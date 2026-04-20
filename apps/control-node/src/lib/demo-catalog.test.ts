import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoCatalogSnapshot, buildDemoReplayPlan, createDemoStartValue } from "@agentharbor/shared";

test("demo catalog snapshot stays presenter-ready", () => {
  const nowMs = new Date("2026-04-19T18:00:00.000Z").getTime();
  const demoStartMs = createDemoStartValue(nowMs);
  const snapshot = buildDemoCatalogSnapshot(nowMs, demoStartMs);

  assert.equal(snapshot.runners.length, 6);
  assert.equal(snapshot.sessions.length, 10);
  assert.ok(snapshot.events.length >= 35);
  assert.ok(snapshot.events.length <= 50);
  assert.equal(snapshot.alerts[0]?.severity, "critical");
  assert.equal(snapshot.alerts[1]?.severity, "warning");
  assert.equal(snapshot.alerts[2]?.severity, "info");
  assert.ok(snapshot.runnerGroups.some((group) => group.label === "demo"));
  assert.ok(snapshot.runnerGroups.some((group) => group.label === "presentation"));
  assert.ok(snapshot.runners.some((runner) => !runner.isOnline));
  assert.ok(snapshot.sessions.some((session) => session.status === "failed"));
  assert.ok(snapshot.sessions.some((session) => session.status === "running"));
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
