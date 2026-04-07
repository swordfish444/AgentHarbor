import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { TextDecoder } from "node:util";
import type { Prisma } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test("control-node integration tests require DATABASE_URL", { skip: true }, () => {});
} else {
  process.env.NODE_ENV = "test";
  process.env.CONTROL_NODE_TLS_ENABLED = "false";
  process.env.DATABASE_URL = databaseUrl;
  const controlNodeAdminToken = "integration-control-admin-token";
  process.env.CONTROL_NODE_ADMIN_TOKEN = controlNodeAdminToken;

  const [{ buildServer }, { prisma }, { hashToken }] = await Promise.all([
    import("../server.js"),
    import("../lib/prisma.js"),
    import("../lib/auth.js"),
  ]);
  let app = await buildServer();
  let listenUrl: string | null = null;

  const baseMachine = {
    hostname: "integration-demo-host",
    os: "macos 15.0",
    architecture: "arm64",
  };

  const enrollRunner = async (
    runnerName: string,
    options: {
      labels?: string[];
      environment?: string;
    } = {},
  ) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/enroll",
      payload: {
        runnerName,
        labels: options.labels ?? ["demo", "backend"],
        environment: options.environment ?? "demo",
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

  const heartbeatTimestamp = () => new Date().toISOString();

  type StreamReader = {
    read: () => Promise<{
      done: boolean;
      value?: Uint8Array;
    }>;
  };

  const getListenUrl = async () => {
    listenUrl ??= await app.listen({ host: "127.0.0.1", port: 0 });
    return listenUrl;
  };

  const readStreamUntil = async (reader: StreamReader, pattern: string, timeoutMs = 3_000) => {
    const decoder = new TextDecoder();
    let output = "";
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        (async () => {
          while (!output.includes(pattern)) {
            const { done, value } = await reader.read();

            if (done) {
              throw new Error(`Stream ended before ${pattern}; received: ${output}`);
            }

            output += decoder.decode(value, { stream: true });
          }
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}; received: ${output}`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    return output;
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
        timestamp: heartbeatTimestamp(),
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

    const runnerByIdResponse = await app.inject({
      method: "GET",
      url: `/v1/runners?runnerId=${enrollment.runner.id}&label=demo`,
    });

    assert.equal(runnerByIdResponse.statusCode, 200);
    const runnersById = runnerByIdResponse.json() as Array<{ id: string }>;
    assert.equal(runnersById.length, 1);
    assert.equal(runnersById[0]?.id, enrollment.runner.id);
  });

  test("filters runners by liveness-derived enrolled and offline statuses", async () => {
    const enrolledRunner = await enrollRunner("backend-runner-enrolled");
    const offlineRunner = await enrollRunner("backend-runner-offline");

    await prisma.runner.update({
      where: { id: offlineRunner.runner.id },
      data: {
        status: "offline",
        lastSeenAt: new Date("2026-04-02T20:00:00.000Z"),
      },
    });

    const enrolledResponse = await app.inject({
      method: "GET",
      url: "/v1/runners?status=enrolled&label=demo&search=backend-runner-enrolled",
    });
    assert.equal(enrolledResponse.statusCode, 200);

    const enrolledRunners = enrolledResponse.json() as Array<{ id: string; status: string }>;
    assert.equal(enrolledRunners.length, 1);
    assert.equal(enrolledRunners[0]?.id, enrolledRunner.runner.id);
    assert.equal(enrolledRunners[0]?.status, "enrolled");

    const offlineResponse = await app.inject({
      method: "GET",
      url: "/v1/runners?status=offline&label=demo&search=backend-runner-offline",
    });
    assert.equal(offlineResponse.statusCode, 200);

    const offlineRunners = offlineResponse.json() as Array<{ id: string; status: string }>;
    assert.equal(offlineRunners.length, 1);
    assert.equal(offlineRunners[0]?.id, offlineRunner.runner.id);
    assert.equal(offlineRunners[0]?.status, "offline");
  });

  test("groups filtered runners by label with online and active-session rollups", async () => {
    const alphaEnrollment = await enrollRunner("backend-group-alpha");
    const betaEnrollment = await enrollRunner("backend-group-beta");
    const frontendEnrollment = await enrollRunner("frontend-group-runner", {
      labels: ["demo", "frontend", "student-team-b"],
    });

    const alphaHeartbeat = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${alphaEnrollment.credentials.token}`,
      },
      payload: {
        timestamp: heartbeatTimestamp(),
        activeSessionCount: 2,
        metadata: {
          mode: "group-test",
        },
      },
    });

    const betaHeartbeat = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${betaEnrollment.credentials.token}`,
      },
      payload: {
        timestamp: heartbeatTimestamp(),
        activeSessionCount: 1,
        metadata: {
          mode: "group-test",
        },
      },
    });

    assert.equal(alphaHeartbeat.statusCode, 200);
    assert.equal(betaHeartbeat.statusCode, 200);

    await prisma.agentSession.create({
      data: {
        runnerId: alphaEnrollment.runner.id,
        agentType: "codex",
        sessionKey: "grouping-active-session",
        status: "running",
        startedAt: new Date("2026-04-02T20:02:30.000Z"),
        summary: "Active grouped runner session",
      },
    });

    const groupResponse = await app.inject({
      method: "GET",
      url: "/v1/runners/groups?search=group",
    });

    assert.equal(groupResponse.statusCode, 200);
    const groups = groupResponse.json() as Array<{
      label: string;
      runnerCount: number;
      onlineCount: number;
      activeSessionCount: number;
      runners: Array<{
        name: string;
        status: string;
      }>;
    }>;

    const backendGroup = groups.find((group) => group.label === "backend");
    assert.ok(backendGroup);
    assert.equal(backendGroup.runnerCount, 2);
    assert.equal(backendGroup.onlineCount, 2);
    assert.equal(backendGroup.activeSessionCount, 1);
    assert.deepEqual(
      backendGroup.runners.map((runner) => runner.name),
      ["backend-group-alpha", "backend-group-beta"],
    );

    const demoGroup = groups.find((group) => group.label === "demo");
    assert.ok(demoGroup);
    assert.equal(demoGroup.runnerCount, 3);

    const frontendOnlyResponse = await app.inject({
      method: "GET",
      url: "/v1/runners/groups?label=frontend",
    });

    assert.equal(frontendOnlyResponse.statusCode, 200);
    const frontendGroups = frontendOnlyResponse.json() as Array<{
      label: string;
      runnerCount: number;
      runners: Array<{
        name: string;
      }>;
    }>;

    assert.equal(frontendGroups.length, 1);
    assert.equal(frontendGroups[0]?.label, "frontend");
    assert.equal(frontendGroups[0]?.runnerCount, 1);
    assert.deepEqual(frontendGroups[0]?.runners.map((runner) => runner.name), ["frontend-group-runner"]);

    const partialSearchResponse = await app.inject({
      method: "GET",
      url: "/v1/runners?search=student",
    });
    assert.equal(partialSearchResponse.statusCode, 200);
    const partialSearchRunners = partialSearchResponse.json() as Array<{ id: string }>;
    assert.equal(partialSearchRunners.length, 1);
    assert.equal(partialSearchRunners[0]?.id, frontendEnrollment.runner.id);

    const partialGroupSearchResponse = await app.inject({
      method: "GET",
      url: "/v1/runners/groups?search=student",
    });
    assert.equal(partialGroupSearchResponse.statusCode, 200);
    const partialGroupSearch = partialGroupSearchResponse.json() as Array<{ label: string }>;
    assert.equal(partialGroupSearch.some((group) => group.label === "student-team-b"), true);
  });

  test("revokes active runner tokens and rejects future heartbeat and telemetry", async () => {
    const enrollment = await enrollRunner("backend-runner-revoked");
    const extraActiveToken = "ah_extra_active_revocation_test";
    const expiredToken = "ah_expired_revocation_test";

    await prisma.runnerToken.createMany({
      data: [
        {
          runnerId: enrollment.runner.id,
          tokenHash: hashToken(extraActiveToken),
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          runnerId: enrollment.runner.id,
          tokenHash: hashToken(expiredToken),
          expiresAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const unauthorizedRevokeResponse = await app.inject({
      method: "POST",
      url: `/v1/runners/${enrollment.runner.id}/revoke-tokens`,
    });
    assert.equal(unauthorizedRevokeResponse.statusCode, 401);

    const revokeResponse = await app.inject({
      method: "POST",
      url: `/v1/runners/${enrollment.runner.id}/revoke-tokens`,
      headers: {
        authorization: `Bearer ${controlNodeAdminToken}`,
      },
    });

    assert.equal(revokeResponse.statusCode, 200);
    const revokeResult = revokeResponse.json() as { runnerId: string; revokedCount: number; revokedAt: string };
    assert.equal(revokeResult.runnerId, enrollment.runner.id);
    assert.equal(revokeResult.revokedCount, 2);
    assert.doesNotThrow(() => new Date(revokeResult.revokedAt).toISOString());

    const tokens = await prisma.runnerToken.findMany({
      where: { runnerId: enrollment.runner.id },
    });
    assert.equal(tokens.filter((token) => token.revokedAt).length, 2);
    assert.equal(tokens.find((token) => token.tokenHash === hashToken(expiredToken))?.revokedAt, null);

    const heartbeatResponse = await app.inject({
      method: "POST",
      url: "/v1/heartbeat",
      headers: {
        authorization: `Bearer ${enrollment.credentials.token}`,
      },
      payload: {
        timestamp: heartbeatTimestamp(),
      },
    });
    assert.equal(heartbeatResponse.statusCode, 401);

    const telemetryResponse = await app.inject({
      method: "POST",
      url: "/v1/telemetry",
      headers: {
        authorization: `Bearer ${extraActiveToken}`,
      },
      payload: {
        events: [
          {
            eventType: "agent.session.started",
            payload: {
              timestamp: new Date().toISOString(),
              agentType: "codex",
              sessionKey: "revoked-token-session",
              category: "session",
            },
          },
        ],
      },
    });
    assert.equal(telemetryResponse.statusCode, 401);

    const missingRunnerResponse = await app.inject({
      method: "POST",
      url: "/v1/runners/missing-runner/revoke-tokens",
      headers: {
        authorization: `Bearer ${controlNodeAdminToken}`,
      },
    });
    assert.equal(missingRunnerResponse.statusCode, 404);
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
            summary: "Session failed because of repeated build issues.",
            category: "build",
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
      url: `/v1/sessions?status=failed&agentType=codex&runnerId=${enrollment.runner.id}&label=demo`,
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

    const wrongLabelSessionsResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?status=failed&label=frontend",
    });
    assert.equal(wrongLabelSessionsResponse.statusCode, 200);
    assert.deepEqual(wrongLabelSessionsResponse.json(), []);

    const failedEventsResponse = await app.inject({
      method: "GET",
      url: "/v1/events?eventType=agent.session.failed&agentType=codex&label=demo&search=build",
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
    assert.equal(failedEvents[0]?.payload.category, "build");
    assert.equal(failedEvents[0]?.payload.status, "failed");

    const wrongLabelEventsResponse = await app.inject({
      method: "GET",
      url: "/v1/events?eventType=agent.session.failed&label=frontend",
    });
    assert.equal(wrongLabelEventsResponse.statusCode, 200);
    assert.deepEqual(wrongLabelEventsResponse.json(), []);
  });

  test("preserves standardized failure categories in session detail so the frontend can explain failures", async () => {
    const enrollment = await enrollRunner("backend-runner-failure-detail");
    const token = enrollment.credentials.token;

    await postTelemetry(token, [
      {
        eventType: "agent.session.started",
        payload: {
          timestamp: "2026-04-02T20:10:00.000Z",
          agentType: "codex",
          sessionKey: "session-timeout",
          summary: "Started a long-running task.",
          category: "session",
          status: "running",
        },
      },
      {
        eventType: "agent.prompt.executed",
        payload: {
          timestamp: "2026-04-02T20:10:20.000Z",
          agentType: "codex",
          sessionKey: "session-timeout",
          summary: "Execution exceeded the allotted time budget.",
          category: "timeout",
          status: "blocked",
        },
      },
      {
        eventType: "agent.session.failed",
        payload: {
          timestamp: "2026-04-02T20:10:45.000Z",
          agentType: "codex",
          sessionKey: "session-timeout",
          summary: "Session failed because the task timed out waiting for completion.",
          category: "timeout",
          status: "failed",
          durationMs: 45_000,
        },
      },
    ]);

    const sessionsResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?status=failed&search=timed out",
    });

    assert.equal(sessionsResponse.statusCode, 200);
    const sessions = sessionsResponse.json() as Array<{
      id: string;
      sessionKey: string;
      summary: string | null;
    }>;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.sessionKey, "session-timeout");
    assert.equal(sessions[0]?.summary, "Session failed because the task timed out waiting for completion.");

    const sessionDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessions[0]?.id}`,
    });

    assert.equal(sessionDetailResponse.statusCode, 200);
    const sessionDetail = sessionDetailResponse.json() as {
      summary: string | null;
      events: Array<{
        eventType: string;
        payload: {
          category?: string;
          summary?: string;
        };
      }>;
    };

    assert.equal(sessionDetail.summary, "Session failed because the task timed out waiting for completion.");
    const failedEvent = sessionDetail.events.find((event) => event.eventType === "agent.session.failed");
    assert.ok(failedEvent);
    assert.equal(failedEvent.payload.category, "timeout");
    assert.equal(failedEvent.payload.summary, "Session failed because the task timed out waiting for completion.");
  });

  test("filters sessions by label, since, and limit in the database query", async () => {
    const demoEnrollment = await enrollRunner("backend-runner-session-filter");
    const frontendEnrollment = await enrollRunner("frontend-runner-session-filter", {
      labels: ["frontend"],
      environment: "preview",
    });

    await prisma.agentSession.createMany({
      data: [
        {
          runnerId: demoEnrollment.runner.id,
          agentType: "codex",
          sessionKey: "old-demo-session",
          status: "completed",
          startedAt: new Date("2026-04-02T20:00:00.000Z"),
          endedAt: new Date("2026-04-02T20:10:00.000Z"),
          summary: "Old demo session outside the since window.",
        },
        {
          runnerId: demoEnrollment.runner.id,
          agentType: "codex",
          sessionKey: "new-demo-session",
          status: "completed",
          startedAt: new Date("2026-04-02T21:00:00.000Z"),
          endedAt: new Date("2026-04-02T21:10:00.000Z"),
          summary: "New demo session inside the since window.",
        },
        {
          runnerId: frontendEnrollment.runner.id,
          agentType: "codex",
          sessionKey: "new-frontend-session",
          status: "completed",
          startedAt: new Date("2026-04-02T21:05:00.000Z"),
          endedAt: new Date("2026-04-02T21:15:00.000Z"),
          summary: "Frontend session should be excluded by label.",
        },
      ],
    });

    const sessionsResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions?label=demo&since=2026-04-02T19:00:00.000Z&limit=1",
    });

    assert.equal(sessionsResponse.statusCode, 200);
    const sessions = sessionsResponse.json() as Array<{ sessionKey: string; runnerId: string }>;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.sessionKey, "new-demo-session");
    assert.equal(sessions[0]?.runnerId, demoEnrollment.runner.id);
  });

  test("filters events by runner, session, event type, since, and limit", async () => {
    const targetEnrollment = await enrollRunner("backend-runner-event-filter");
    const otherEnrollment = await enrollRunner("backend-runner-event-noise");

    const targetSession = await prisma.agentSession.create({
      data: {
        runnerId: targetEnrollment.runner.id,
        agentType: "codex",
        sessionKey: "target-event-session",
        status: "running",
        startedAt: new Date("2026-04-02T21:00:00.000Z"),
        summary: "Target session for event filters.",
      },
    });

    await prisma.telemetryEvent.createMany({
      data: [
        {
          runnerId: targetEnrollment.runner.id,
          sessionId: targetSession.id,
          eventType: "agent.prompt.executed",
          createdAt: new Date("2026-04-02T21:00:30.000Z"),
          payloadJson: {
            timestamp: "2026-04-02T21:00:30.000Z",
            agentType: "codex",
            sessionKey: "target-event-session",
            summary: "Target old event outside the since window.",
            category: "implementation",
          },
        },
        {
          runnerId: targetEnrollment.runner.id,
          sessionId: targetSession.id,
          eventType: "agent.prompt.executed",
          createdAt: new Date("2026-04-02T21:05:00.000Z"),
          payloadJson: {
            timestamp: "2026-04-02T21:05:00.000Z",
            agentType: "codex",
            sessionKey: "target-event-session",
            summary: "Target new event inside the since window.",
            category: "implementation",
          },
        },
        {
          runnerId: otherEnrollment.runner.id,
          sessionId: null,
          eventType: "agent.prompt.executed",
          createdAt: new Date("2026-04-02T21:06:00.000Z"),
          payloadJson: {
            timestamp: "2026-04-02T21:06:00.000Z",
            agentType: "codex",
            sessionKey: "other-event-session",
            summary: "Other runner event should be excluded.",
            category: "implementation",
          },
        },
      ],
    });

    const eventsResponse = await app.inject({
      method: "GET",
      url: `/v1/events?eventType=agent.prompt.executed&runnerId=${targetEnrollment.runner.id}&sessionId=${targetSession.id}&since=2026-04-02T21:00:00.000Z&limit=1`,
    });

    assert.equal(eventsResponse.statusCode, 200);
    const events = eventsResponse.json() as Array<{
      runnerId: string;
      sessionId: string | null;
      eventType: string;
      payload: {
        summary?: string;
      };
    }>;
    assert.equal(events.length, 1);
    assert.equal(events[0]?.runnerId, targetEnrollment.runner.id);
    assert.equal(events[0]?.sessionId, targetSession.id);
    assert.equal(events[0]?.eventType, "agent.prompt.executed");
    assert.equal(events[0]?.payload.summary, "Target new event inside the since window.");
  });

  test("returns global analytics breakdowns for agent types, failures, and runner activity", async () => {
    const alphaEnrollment = await enrollRunner("analytics-alpha-runner");
    const betaEnrollment = await enrollRunner("analytics-beta-runner");
    const gammaEnrollment = await enrollRunner("analytics-gamma-runner");
    const recent = new Date();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const session = (runnerId: string, agentType: string, sessionKey: string, startedAt = recent) => ({
      runnerId,
      agentType,
      sessionKey,
      status: "completed" as const,
      startedAt,
    });

    await prisma.agentSession.createMany({
      data: [
        session(alphaEnrollment.runner.id, "codex", "analytics-alpha-codex-1"),
        session(alphaEnrollment.runner.id, "codex", "analytics-alpha-codex-2"),
        session(alphaEnrollment.runner.id, "claude-code", "analytics-alpha-claude"),
        session(betaEnrollment.runner.id, "codex", "analytics-beta-codex"),
        session(betaEnrollment.runner.id, "claude-code", "analytics-beta-claude"),
        session(gammaEnrollment.runner.id, "automation", "analytics-gamma-automation"),
        session(gammaEnrollment.runner.id, "cursor", "analytics-old-cursor", old),
      ],
    });

    const failurePayload = (category?: string, status = "blocked") => ({
      timestamp: recent.toISOString(),
      agentType: "codex",
      ...(category ? { category } : {}),
      status,
    });
    const telemetryEvent = (runnerId: string, eventType: string, payloadJson: Prisma.InputJsonValue, createdAt = recent) => ({
      runnerId,
      eventType,
      createdAt,
      payloadJson,
    });

    await prisma.telemetryEvent.createMany({
      data: [
        telemetryEvent(alphaEnrollment.runner.id, "agent.prompt.executed", failurePayload("build")),
        telemetryEvent(alphaEnrollment.runner.id, "agent.prompt.executed", failurePayload("test")),
        telemetryEvent(betaEnrollment.runner.id, "agent.prompt.executed", failurePayload("auth")),
        telemetryEvent(betaEnrollment.runner.id, "agent.prompt.executed", failurePayload("network")),
        telemetryEvent(gammaEnrollment.runner.id, "agent.session.failed", failurePayload("failure", "failed")),
        telemetryEvent(gammaEnrollment.runner.id, "agent.session.failed", failurePayload("legacy-timeout", "failed")),
        telemetryEvent(gammaEnrollment.runner.id, "agent.session.failed", failurePayload(undefined, "failed")),
        telemetryEvent(
          gammaEnrollment.runner.id,
          "agent.summary.updated",
          {
            timestamp: recent.toISOString(),
            agentType: "codex",
            category: "implementation",
            status: "in-progress",
          },
        ),
        telemetryEvent(gammaEnrollment.runner.id, "agent.session.failed", failurePayload("failure", "failed"), old),
      ],
    });

    const agentTypesResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics/agent-types",
    });
    assert.equal(agentTypesResponse.statusCode, 200);
    const agentTypes = agentTypesResponse.json() as { items: Array<{ key: string; label: string; count: number }> };
    assert.deepEqual(agentTypes.items, [
      { key: "codex", label: "codex", count: 3 },
      { key: "claude-code", label: "claude-code", count: 2 },
      { key: "automation", label: "automation", count: 1 },
    ]);

    const failuresResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics/failures",
    });
    assert.equal(failuresResponse.statusCode, 200);
    const failures = failuresResponse.json() as { items: Array<{ key: string; label: string; count: number }> };
    assert.deepEqual(failures.items, [
      { key: "unknown", label: "unknown", count: 2 },
      { key: "auth", label: "auth", count: 1 },
      { key: "build", label: "build", count: 1 },
      { key: "failure", label: "failure", count: 1 },
      { key: "network", label: "network", count: 1 },
      { key: "test", label: "test", count: 1 },
    ]);

    const runnerActivityResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics/runners/activity",
    });
    assert.equal(runnerActivityResponse.statusCode, 200);
    const runnerActivity = runnerActivityResponse.json() as {
      items: Array<{ runnerId: string; runnerName: string; sessionCount: number }>;
    };
    assert.deepEqual(runnerActivity.items, [
      { runnerId: alphaEnrollment.runner.id, runnerName: "analytics-alpha-runner", sessionCount: 3 },
      { runnerId: betaEnrollment.runner.id, runnerName: "analytics-beta-runner", sessionCount: 2 },
      { runnerId: gammaEnrollment.runner.id, runnerName: "analytics-gamma-runner", sessionCount: 1 },
    ]);
  });

  test("returns global event analytics in five-minute buckets", async () => {
    const enrollment = await enrollRunner("analytics-timeseries-runner");
    const bucketMs = 5 * 60 * 1000;
    const bucketOne = new Date(Math.floor((Date.now() - 10 * 60 * 1000) / bucketMs) * bucketMs);
    const bucketTwo = new Date(bucketOne.getTime() + bucketMs);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const telemetryEventAt = (createdAt: Date, eventType = "agent.prompt.executed") => ({
      runnerId: enrollment.runner.id,
      eventType,
      createdAt,
      payloadJson: {
        timestamp: createdAt.toISOString(),
        agentType: "codex",
      },
    });

    await prisma.telemetryEvent.createMany({
      data: [
        telemetryEventAt(new Date(bucketOne.getTime() + 30_000)),
        telemetryEventAt(new Date(bucketOne.getTime() + 60_000)),
        telemetryEventAt(new Date(bucketTwo.getTime() + 30_000), "agent.summary.updated"),
        telemetryEventAt(old, "agent.summary.updated"),
      ],
    });

    const timeseriesResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics/events/timeseries",
    });
    assert.equal(timeseriesResponse.statusCode, 200);
    const timeseries = timeseriesResponse.json() as { points: Array<{ bucketStart: string; count: number }> };
    assert.deepEqual(timeseries.points, [
      { bucketStart: bucketOne.toISOString(), count: 2 },
      { bucketStart: bucketTwo.toISOString(), count: 1 },
    ]);
  });

  test("streams heartbeat and telemetry commits over server-sent events", async () => {
    const enrollment = await enrollRunner("backend-runner-stream");
    const response = await fetch(`${await getListenUrl()}/v1/stream/events`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.ok(response.body);

    const reader = response.body.getReader();

    try {
      const heartbeatChunkPromise = readStreamUntil(reader, "event: stats.refresh");
      const heartbeatResponse = await app.inject({
        method: "POST",
        url: "/v1/heartbeat",
        headers: {
          authorization: `Bearer ${enrollment.credentials.token}`,
        },
        payload: {
          timestamp: heartbeatTimestamp(),
          activeSessionCount: 0,
          metadata: {
            mode: "stream-test",
          },
        },
      });

      assert.equal(heartbeatResponse.statusCode, 200);

      const heartbeatChunk = await heartbeatChunkPromise;
      assert.match(heartbeatChunk, /event: runner\.heartbeat/);
      assert.match(heartbeatChunk, /event: telemetry\.created/);
      assert.match(heartbeatChunk, /event: stats\.refresh/);
      assert.match(heartbeatChunk, new RegExp(enrollment.runner.id));

      const telemetryChunkPromise = readStreamUntil(reader, "event: session.updated");
      await postTelemetry(enrollment.credentials.token, [
        {
          eventType: "agent.session.started",
          payload: {
            timestamp: "2026-04-02T23:00:00.000Z",
            agentType: "codex",
            sessionKey: "stream-session",
            summary: "Streamed session started.",
            category: "session",
            status: "running",
          },
        },
      ]);

      const telemetryChunk = await telemetryChunkPromise;
      assert.match(telemetryChunk, /event: telemetry\.created/);
      assert.match(telemetryChunk, /event: session\.updated/);
      assert.match(telemetryChunk, /stream-session/);
    } finally {
      await reader.cancel();
    }
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
