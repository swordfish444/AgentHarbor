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
}
