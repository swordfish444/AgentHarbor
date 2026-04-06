import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test("control-node integration tests require DATABASE_URL", { skip: true }, () => {});
} else {
  process.env.NODE_ENV = "test";
  process.env.CONTROL_NODE_TLS_ENABLED = "false";
  process.env.DATABASE_URL = databaseUrl;

  const [{ buildServer }, { prisma }] = await Promise.all([import("../server.js"), import("../lib/prisma.js")]);
  let app = await buildServer();

  const baseMachine = {
    hostname: "integration-demo-host",
    os: "macos 15.0",
    architecture: "arm64",
  };

  const enrollRunner = async (runnerName: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/enroll",
      payload: {
        runnerName,
        labels: ["demo", "backend"],
        environment: "demo",
        machine: {
          ...baseMachine,
          hostname: `${baseMachine.hostname}-${runnerName}`,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    return response.json() as {
      runner: {
        id: string;
        name: string;
        labels: string[];
        environment: string | null;
      };
      credentials: {
        token: string;
      };
    };
  };

  const postTelemetry = async (token: string, events: unknown[]) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/telemetry",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { events },
    });

    assert.equal(response.statusCode, 200);
  };

  beforeEach(async () => {
    await prisma.telemetryEvent.deleteMany();
    await prisma.agentSession.deleteMany();
    await prisma.runnerToken.deleteMany();
    await prisma.runner.deleteMany();
    await prisma.machine.deleteMany();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test("enrolls runners, tracks heartbeats, and filters runners by status and label", async () => {
    const enrollment = await enrollRunner("backend-runner-online");

    assert.deepEqual(enrollment.runner.labels, ["demo", "backend"]);
    assert.equal(enrollment.runner.environment, "demo");

    const heartbeatResponse = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${enrollment.credentials.token}`,
      },
      payload: {
        timestamp: "2026-04-02T20:00:00.000Z",
        activeSessionCount: 0,
        metadata: {
          mode: "test",
        },
      },
    });

    assert.equal(heartbeatResponse.statusCode, 200);

    const runnersResponse = await app.inject({
      method: "GET",
      url: "/v1/runners?status=online&label=demo&search=backend-runner-online",
    });

    assert.equal(runnersResponse.statusCode, 200);
    const runners = runnersResponse.json() as Array<{
      id: string;
      name: string;
      status: string;
      labels: string[];
      environment: string | null;
      activeSessionCount: number;
    }>;

    assert.equal(runners.length, 1);
    assert.equal(runners[0]?.id, enrollment.runner.id);
    assert.equal(runners[0]?.status, "online");
    assert.equal(runners[0]?.environment, "demo");
    assert.deepEqual(runners[0]?.labels, ["demo", "backend"]);
    assert.equal(runners[0]?.activeSessionCount, 0);
  });

  test("creates completed and failed sessions and exposes filterable sessions and events", async () => {
    const enrollment = await enrollRunner("backend-runner-telemetry");
    const token = enrollment.credentials.token;

    await postTelemetry(token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T20:05:00.000Z",
          agentType: "codex",
          sessionKey: "session-completed",
          summary: "Started a successful coding task.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.summary.updated",
        payload: {
          timestamp: "2026-04-02T20:05:10.000Z",
          agentType: "codex",
          sessionKey: "session-completed",
          summary: "Applied the implementation and verified the results.",
          category: "implementation",
          status: "in-progress",
          tokenUsage: 900,
          filesTouchedCount: 3,
        },
      },
      {
        eventType: "agent.session.completed",
        payload: {
          timestamp: "2026-04-02T20:05:20.000Z",
          agentType: "codex",
          sessionKey: "session-completed",
          summary: "Completed successfully.",
          category: "session",
          status: "completed",
          durationMs: 20_000,
          tokenUsage: 1_200,
          filesTouchedCount: 4,
        },
      },
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T20:06:00.000Z",
          agentType: "codex",
          sessionKey: "session-failed",
          summary: "Started a failing coding task.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.prompt.executed",
        payload: {
          timestamp: "2026-04-02T20:06:12.000Z",
          agentType: "codex",
          sessionKey: "session-failed",
          summary: "Build errors blocked the task.",
          category: "build",
          status: "blocked",
          tokenUsage: 700,
          filesTouchedCount: 2,
        },
      },
      {
        eventType: "agent.session.failed",
        payload: {
          timestamp: "2026-04-02T20:06:25.000Z",
          agentType: "codex",
          sessionKey: "session-failed",
          summary: "Session failed after repeated build errors.",
          category: "failure",
          status: "failed",
          durationMs: 25_000,
          tokenUsage: 1_050,
          filesTouchedCount: 3,
        },
      },
    ]);

    const completedSessionsResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?status=completed&agentType=codex&search=successful",
    });
    assert.equal(completedSessionsResponse.statusCode, 200);

    const completedSessions = completedSessionsResponse.json() as Array<{
      sessionKey: string;
      status: string;
    }>;
    assert.equal(completedSessions.length, 1);
    assert.equal(completedSessions[0]?.sessionKey, "session-completed");
    assert.equal(completedSessions[0]?.status, "completed");

    const failedSessionsResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions?status=failed&agentType=codex&runnerId=${enrollment.runner.id}`,
    });
    assert.equal(failedSessionsResponse.statusCode, 200);

    const failedSessions = failedSessionsResponse.json() as Array<{
      sessionKey: string;
      status: string;
      eventCount: number;
    }>;
    assert.equal(failedSessions.length, 1);
    assert.equal(failedSessions[0]?.sessionKey, "session-failed");
    assert.equal(failedSessions[0]?.status, "failed");
    assert.equal(failedSessions[0]?.eventCount, 3);

    const failedEventsResponse = await app.inject({
      method: "GET",
      url: "/v1/events?eventType=agent.session.failed&agentType=codex&search=build",
    });
    assert.equal(failedEventsResponse.statusCode, 200);

    const failedEvents = failedEventsResponse.json() as Array<{
      eventType: string;
      payload: {
        category?: string;
        status?: string;
      };
    }>;
    assert.equal(failedEvents.length, 1);
    assert.equal(failedEvents[0]?.eventType, "agent.session.failed");
    assert.equal(failedEvents[0]?.payload.category, "failure");
    assert.equal(failedEvents[0]?.payload.status, "failed");
  });

  test("accepts legacy stored payload categories when listing events and session detail", async () => {
    const enrollment = await enrollRunner("backend-runner-legacy");

    const session = await prisma.agentSession.create({
      data: {
        runnerId: enrollment.runner.id,
        agentType: "codex",
        sessionKey: "legacy-session",
        status: "completed",
        startedAt: new Date("2026-04-02T21:00:00.000Z"),
        endedAt: new Date("2026-04-02T21:01:00.000Z"),
        summary: "Legacy session summary",
      },
    });

    await prisma.telemetryEvent.create({
      data: {
        runnerId: enrollment.runner.id,
        sessionId: session.id,
        eventType: "agent.prompt.executed",
        createdAt: new Date("2026-04-02T21:00:30.000Z"),
        payloadJson: {
          timestamp: "2026-04-02T21:00:30.000Z",
          agentType: "codex",
          sessionKey: "legacy-session",
          summary: "Legacy event with a non-whitelisted category",
          category: "legacy-build",
          status: "completed",
        },
      },
    });

    const eventsResponse = await app.inject({
      method: "GET",
      url: "/v1/events?eventType=agent.prompt.executed&search=legacy",
    });

    assert.equal(eventsResponse.statusCode, 200);
    const events = eventsResponse.json() as Array<{
      payload: {
        summary?: string;
        category?: string;
      };
    }>;
    assert.equal(events.length, 1);
    assert.equal(events[0]?.payload.summary, "Legacy event with a non-whitelisted category");
    assert.equal(events[0]?.payload.category, undefined);

    const sessionDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}`,
    });

    assert.equal(sessionDetailResponse.statusCode, 200);
    const sessionDetail = sessionDetailResponse.json() as {
      events: Array<{
        payload: {
          summary?: string;
          category?: string;
        };
      }>;
    };
    assert.equal(sessionDetail.events.length, 1);
    assert.equal(sessionDetail.events[0]?.payload.summary, "Legacy event with a non-whitelisted category");
    assert.equal(sessionDetail.events[0]?.payload.category, undefined);
  });

  test("searches past the newest event batch so older matching events are still returned", async () => {
    const enrollment = await enrollRunner("backend-runner-search");

    const session = await prisma.agentSession.create({
      data: {
        runnerId: enrollment.runner.id,
        agentType: "codex",
        sessionKey: "older-search-match",
        status: "failed",
        startedAt: new Date("2026-04-02T22:00:00.000Z"),
        endedAt: new Date("2026-04-02T22:01:00.000Z"),
        summary: "Older match session",
      },
    });

    await prisma.telemetryEvent.create({
      data: {
        runnerId: enrollment.runner.id,
        sessionId: session.id,
        eventType: "agent.prompt.executed",
        createdAt: new Date("2026-04-02T22:00:05.000Z"),
        payloadJson: {
          timestamp: "2026-04-02T22:00:05.000Z",
          agentType: "codex",
          sessionKey: "older-search-match",
          summary: "Build failure older match",
          category: "build",
          status: "blocked",
        },
      },
    });

    const noisyEvents = Array.from({ length: 260 }, (_, index) => ({
      runnerId: enrollment.runner.id,
      sessionId: null,
      eventType: "runner.heartbeat",
      createdAt: new Date(`2026-04-02T22:${String(59 - Math.floor(index / 5)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`),
      payloadJson: {
        timestamp: `2026-04-02T22:${String(59 - Math.floor(index / 5)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
        agentType: "automation",
        summary: "Noise heartbeat event",
        category: "session",
        status: "online",
      },
    }));

    await prisma.telemetryEvent.createMany({
      data: noisyEvents,
    });

    const searchResponse = await app.inject({
      method: "GET",
      url: "/v1/events?search=build&limit=1",
    });

    assert.equal(searchResponse.statusCode, 200);
    const searchedEvents = searchResponse.json() as Array<{
      payload: {
        summary?: string;
      };
    }>;
    assert.equal(searchedEvents.length, 1);
    assert.equal(searchedEvents[0]?.payload.summary, "Build failure older match");

    const agentTypeResponse = await app.inject({
      method: "GET",
      url: "/v1/events?agentType=codex&limit=1",
    });

    assert.equal(agentTypeResponse.statusCode, 200);
    const agentTypeEvents = agentTypeResponse.json() as Array<{
      payload: {
        agentType?: string;
        summary?: string;
      };
    }>;
    assert.equal(agentTypeEvents.length, 1);
    assert.equal(agentTypeEvents[0]?.payload.agentType, "codex");
    assert.equal(agentTypeEvents[0]?.payload.summary, "Build failure older match");
  });

  test("applies since and limit filters with stable ordering for sessions and events", async () => {
    const enrollment = await enrollRunner("backend-runner-since");
    const token = enrollment.credentials.token;

    await postTelemetry(token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T19:00:00.000Z",
          agentType: "codex",
          sessionKey: "session-old",
          summary: "Old session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.session.completed",
        payload: {
          timestamp: "2026-04-02T19:05:00.000Z",
          agentType: "codex",
          sessionKey: "session-old",
          summary: "Old session completed.",
          category: "session",
          status: "completed",
          durationMs: 300_000,
        },
      },
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T20:10:00.000Z",
          agentType: "codex",
          sessionKey: "session-newer",
          summary: "Newer session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.session.completed",
        payload: {
          timestamp: "2026-04-02T20:15:00.000Z",
          agentType: "codex",
          sessionKey: "session-newer",
          summary: "Newer session completed.",
          category: "session",
          status: "completed",
          durationMs: 300_000,
        },
      },
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T21:10:00.000Z",
          agentType: "codex",
          sessionKey: "session-newest",
          summary: "Newest session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.session.completed",
        payload: {
          timestamp: "2026-04-02T21:20:00.000Z",
          agentType: "codex",
          sessionKey: "session-newest",
          summary: "Newest session completed.",
          category: "session",
          status: "completed",
          durationMs: 600_000,
        },
      },
    ]);

    const sessionsResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?status=completed&since=2026-04-02T20:00:00.000Z&limit=2",
    });

    assert.equal(sessionsResponse.statusCode, 200);
    const sessions = sessionsResponse.json() as Array<{
      sessionKey: string;
      startedAt: string;
    }>;
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0]?.sessionKey, "session-newest");
    assert.equal(sessions[1]?.sessionKey, "session-newer");
    assert.equal(new Date(sessions[0]!.startedAt).getTime() > new Date(sessions[1]!.startedAt).getTime(), true);

    const eventsResponse = await app.inject({
      method: "GET",
      url: "/v1/events?since=2026-04-02T20:12:00.000Z&limit=2",
    });

    assert.equal(eventsResponse.statusCode, 200);
    const events = eventsResponse.json() as Array<{
      eventType: string;
      createdAt: string;
      sessionKey: string | null;
    }>;
    assert.equal(events.length, 2);
    assert.equal(events[0]?.sessionKey, "session-newest");
    assert.equal(events[1]?.sessionKey, "session-newer");
    assert.equal(new Date(events[0]!.createdAt).getTime() > new Date(events[1]!.createdAt).getTime(), true);
  });

  test("filters events by sessionId and limits runners in stable order", async () => {
    const firstEnrollment = await enrollRunner("backend-runner-alpha");
    const secondEnrollment = await enrollRunner("backend-runner-beta");

    const firstHeartbeat = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${firstEnrollment.credentials.token}`,
      },
      payload: {
        timestamp: "2026-04-02T22:30:00.000Z",
        activeSessionCount: 0,
        metadata: {
          mode: "test",
        },
      },
    });

    const secondHeartbeat = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${secondEnrollment.credentials.token}`,
      },
      payload: {
        timestamp: "2026-04-02T22:31:00.000Z",
        activeSessionCount: 0,
        metadata: {
          mode: "test",
        },
      },
    });

    assert.equal(firstHeartbeat.statusCode, 200);
    assert.equal(secondHeartbeat.statusCode, 200);

    await postTelemetry(firstEnrollment.credentials.token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T22:32:00.000Z",
          agentType: "codex",
          sessionKey: "session-alpha",
          summary: "Alpha session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.summary.updated",
        payload: {
          timestamp: "2026-04-02T22:32:10.000Z",
          agentType: "codex",
          sessionKey: "session-alpha",
          summary: "Alpha progress update.",
          category: "implementation",
          status: "in-progress",
        },
      },
      {
        eventType: "agent.session.completed",
        payload: {
          timestamp: "2026-04-02T22:32:20.000Z",
          agentType: "codex",
          sessionKey: "session-alpha",
          summary: "Alpha completed.",
          category: "session",
          status: "completed",
          durationMs: 20_000,
        },
      },
    ]);

    await postTelemetry(secondEnrollment.credentials.token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T22:33:00.000Z",
          agentType: "cursor",
          sessionKey: "session-beta",
          summary: "Beta session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.session.failed",
        payload: {
          timestamp: "2026-04-02T22:33:20.000Z",
          agentType: "cursor",
          sessionKey: "session-beta",
          summary: "Beta failed.",
          category: "failure",
          status: "failed",
          durationMs: 20_000,
        },
      },
    ]);

    const sessionLookupResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?runnerId=" + firstEnrollment.runner.id,
    });

    assert.equal(sessionLookupResponse.statusCode, 200);
    const sessionLookup = sessionLookupResponse.json() as Array<{
      id: string;
      sessionKey: string;
    }>;
    assert.equal(sessionLookup.length, 1);
    assert.equal(sessionLookup[0]?.sessionKey, "session-alpha");

    const eventsBySessionResponse = await app.inject({
      method: "GET",
      url: `/v1/events?sessionId=${sessionLookup[0]!.id}&limit=5`,
    });

    assert.equal(eventsBySessionResponse.statusCode, 200);
    const eventsBySession = eventsBySessionResponse.json() as Array<{
      sessionKey: string | null;
      createdAt: string;
    }>;
    assert.equal(eventsBySession.length, 3);
    assert.equal(eventsBySession.every((event) => event.sessionKey === "session-alpha"), true);
    assert.equal(new Date(eventsBySession[0]!.createdAt).getTime() > new Date(eventsBySession[1]!.createdAt).getTime(), true);

    const runnersResponse = await app.inject({
      method: "GET",
      url: "/v1/runners?status=online&search=backend-runner&limit=1",
    });

    assert.equal(runnersResponse.statusCode, 200);
    const runners = runnersResponse.json() as Array<{
      id: string;
      name: string;
      updatedAt: string;
    }>;
    assert.equal(runners.length, 1);
    assert.equal(runners[0]?.id, secondEnrollment.runner.id);
    assert.equal(runners[0]?.name, "backend-runner-beta");
  });

  test("returns analytics sections for agent mix, event volume, runner activity, and failure categories", async () => {
    const enrollment = await enrollRunner("backend-runner-analytics");

    await postTelemetry(enrollment.credentials.token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: new Date().toISOString(),
          agentType: "codex",
          sessionKey: "analytics-session-1",
          summary: "Analytics session started.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.prompt.executed",
        payload: {
          timestamp: new Date().toISOString(),
          agentType: "codex",
          sessionKey: "analytics-session-1",
          summary: "Build issue while generating analytics fixture data.",
          category: "build",
          status: "blocked",
        },
      },
      {
        eventType: "agent.session.failed",
        payload: {
          timestamp: new Date().toISOString(),
          agentType: "codex",
          sessionKey: "analytics-session-1",
          summary: "Analytics session failed.",
          category: "failure",
          status: "failed",
          durationMs: 10_000,
        },
      },
    ]);

    const analyticsResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics",
    });

    assert.equal(analyticsResponse.statusCode, 200);
    const analytics = analyticsResponse.json() as {
      sections: Array<{
        id: string;
        points: Array<{
          label: string;
          value: number;
        }>;
      }>;
    };

    assert.deepEqual(
      analytics.sections.map((section) => section.id),
      ["agent-type-distribution", "event-volume", "runner-activity", "failure-categories"],
    );
    assert.equal(analytics.sections[0]?.points.some((point) => point.label === "codex" && point.value >= 1), true);
    assert.equal(analytics.sections[2]?.points.some((point) => point.label === "backend-runner-analytics"), true);
    assert.equal(analytics.sections[3]?.points.some((point) => point.label === "Build"), true);
  });
}
