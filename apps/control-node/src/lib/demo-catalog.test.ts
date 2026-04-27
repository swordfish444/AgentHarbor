import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoCatalogSnapshot, buildDemoReplayPlan, createDemoStartValue } from "@agentharbor/shared";
import { buildBurstSocketFailureMetadata } from "./demo-harness.js";

test("demo catalog snapshot stays presenter-ready", () => {
  const nowMs = new Date("2026-04-19T18:00:00.000Z").getTime();
  const demoStartMs = createDemoStartValue(nowMs);
  const snapshot = buildDemoCatalogSnapshot(nowMs, demoStartMs);

  assert.equal(snapshot.runners.length, 6);
  assert.equal(snapshot.sessions.length, 13);
  assert.ok(snapshot.events.length >= 35);
  assert.ok(snapshot.events.length <= 60);
  assert.equal(snapshot.alerts[0]?.severity, "critical");
  assert.equal(snapshot.alerts[0]?.href, "/session/socket-shark-session-2");
  assert.equal(snapshot.alerts[1]?.severity, "warning");
  assert.equal(snapshot.alerts[2]?.severity, "info");
  assert.ok(snapshot.runnerGroups.some((group) => group.label === "demo"));
  assert.ok(snapshot.runnerGroups.some((group) => group.label === "presentation"));
  assert.ok(snapshot.runners.some((runner) => !runner.isOnline));
  assert.ok(snapshot.sessions.some((session) => session.status === "failed"));
  assert.ok(snapshot.sessions.some((session) => session.status === "running"));

  const stateLabels = snapshot.runners
    .map((runner) => runner.labels.find((label) => /^state:[A-Z]{2}$/.test(label)))
    .filter((label): label is string => Boolean(label));

  assert.equal(stateLabels.length, snapshot.runners.length);
  assert.equal(new Set(stateLabels).size, snapshot.runners.length);
  assert.ok(snapshot.runners.every((runner) => /'s (MacBook Pro|Mac Studio|MacBook Air)$/.test(runner.machineName)));

  const operatorVisibleProblemEvents = snapshot.events.filter(
    (event) => event.payload.status === "warning" || event.payload.status === "failed",
  );
  const primaryFailure = snapshot.events.find(
    (event) => event.sessionId === "socket-shark-session-2" && event.eventType === "agent.session.failed",
  );

  assert.ok(operatorVisibleProblemEvents.length >= 2);
  assert.equal(primaryFailure?.payload.metadata?.failureCode, "STREAM-CHECKPOINT-DRIFT");
  assert.equal(primaryFailure?.payload.metadata?.remedyActionLabel, "Apply checkpoint guard");
  assert.equal(primaryFailure?.payload.metadata?.remedySessionId, "socket-shark-session-3");
  assert.equal(typeof primaryFailure?.payload.metadata?.rootCause, "string");
  assert.ok(Array.isArray(primaryFailure?.payload.metadata?.evidence));
  assert.ok(Array.isArray(primaryFailure?.payload.metadata?.nextActions));

  const heartbeatFailure = snapshot.events.find(
    (event) => event.sessionId === "stack-sparrow-session-2" && event.eventType === "agent.session.failed",
  );

  assert.equal(heartbeatFailure?.payload.metadata?.failureCode, "HEARTBEAT-GAP");
  assert.equal(heartbeatFailure?.payload.metadata?.remedySessionId, undefined);
  assert.equal(heartbeatFailure?.payload.metadata?.remedyActionLabel, undefined);
  assert.ok(snapshot.sessions.some((session) => session.id === "stack-sparrow-session-3" && session.status === "completed"));
});

test("demo replay plan limits heartbeat correction to offline and active runners", () => {
  const nowMs = new Date("2026-04-19T18:00:00.000Z").getTime();
  const demoStartMs = createDemoStartValue(nowMs);
  const replayPlan = buildDemoReplayPlan(nowMs, demoStartMs);
  const heartbeatRunners = replayPlan.runners.filter((runner) => runner.lastSeenAt != null);

  assert.equal(heartbeatRunners.length, 2);
  assert.ok(heartbeatRunners.some((runner) => runner.seed.id === "merge-marmot"));
  assert.ok(heartbeatRunners.some((runner) => runner.seed.id === "stack-sparrow"));
});

test("demo replay plan preserves structured failure metadata through telemetry payloads", () => {
  const nowMs = new Date("2026-04-19T18:00:00.000Z").getTime();
  const demoStartMs = createDemoStartValue(nowMs);
  const replayPlan = buildDemoReplayPlan(nowMs, demoStartMs);
  const replayFailureEvent = replayPlan.runners
    .flatMap((runner) => runner.telemetryEvents)
    .find((event) => event.eventType === "agent.session.failed" && event.payload.sessionKey === "SS-406");

  assert.equal(replayFailureEvent?.payload.metadata?.failureCode, "STREAM-CHECKPOINT-DRIFT");
  assert.ok(Array.isArray(replayFailureEvent?.payload.metadata?.evidence));
  assert.ok(Array.isArray(replayFailureEvent?.payload.metadata?.nextActions));
});

test("demo burst failure metadata can link to a recovery session", () => {
  const metadata = buildBurstSocketFailureMetadata({
    id: "recovery-session-id",
    sessionKey: "RR-809",
  });

  assert.equal(metadata.recoveredFromSessionKey, "RR-808");
  assert.equal(metadata.remedyActionLabel, "Apply checkpoint guard");
  assert.equal(metadata.remedySessionId, "recovery-session-id");
  assert.equal(metadata.remedySessionKey, "RR-809");
  assert.equal(typeof metadata.remedyOutcome, "string");
});
