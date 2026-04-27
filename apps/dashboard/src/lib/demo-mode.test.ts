import assert from "node:assert/strict";
import test from "node:test";
import { demoCycleMs, scaleDemoOffset } from "@agentharbor/shared";
import {
  buildDemoDashboardData,
  buildDemoPlaybackDashboardData,
  buildDemoPlaybackSessionDetail,
  buildDemoSearch,
  createDemoStartValue,
  demoPrimaryIncidentSessionId,
  demoPrimaryRecoverySessionId,
  demoPlaybackSpeedFactor,
  resolveDemoPlaybackState,
} from "./demo-mode";

test("demo playback preserves the initial snapshot at render time", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);

  const seededSnapshot = buildDemoDashboardData(renderedAtMs, initialDemoStartMs);
  const playbackSnapshot = buildDemoPlaybackDashboardData(renderedAtMs, initialDemoStartMs, renderedAtMs);

  assert.deepEqual(playbackSnapshot, seededSnapshot);
});

test("demo playback caps the wallboard wait for new events below forty-five seconds", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);
  const playbackWindowMs = Math.ceil(demoCycleMs / demoPlaybackSpeedFactor) + 45_000;
  const changePoints: number[] = [];
  let previousEventCount = -1;

  for (let elapsedMs = 0; elapsedMs <= playbackWindowMs; elapsedMs += 1_000) {
    const snapshot = buildDemoPlaybackDashboardData(renderedAtMs + elapsedMs, initialDemoStartMs, renderedAtMs);

    if (snapshot.events.length !== previousEventCount) {
      changePoints.push(elapsedMs);
      previousEventCount = snapshot.events.length;
    }
  }

  let maxGapMs = 0;

  for (let index = 1; index < changePoints.length; index += 1) {
    maxGapMs = Math.max(maxGapMs, changePoints[index]! - changePoints[index - 1]!);
  }

  assert.ok(maxGapMs <= 45_000, `expected max gap <= 45000ms, received ${maxGapMs}`);
});

test("demo playback keeps visible event timestamps at or before the current clock", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);
  const clockMs = renderedAtMs + 12_000;
  const snapshot = buildDemoPlaybackDashboardData(clockMs, initialDemoStartMs, renderedAtMs);
  const newestEvent = snapshot.events[0];

  assert.ok(newestEvent);
  assert.ok(new Date(newestEvent.createdAt).getTime() <= clockMs);
});

test("demo playback keeps the primary incident drilldown reachable throughout the loop", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);
  const session = buildDemoPlaybackSessionDetail(demoPrimaryIncidentSessionId, renderedAtMs, initialDemoStartMs, renderedAtMs);
  const failedEvent = session?.events.find((event) => event.eventType === "agent.session.failed");

  assert.equal(session?.status, "failed");
  assert.equal(failedEvent?.payload.metadata?.failureCode, "STREAM-CHECKPOINT-DRIFT");
});

test("demo playback opens the primary incident as failed even while the live loop is at the warning checkpoint", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = renderedAtMs - scaleDemoOffset(500_000);
  const session = buildDemoPlaybackSessionDetail(demoPrimaryIncidentSessionId, renderedAtMs, initialDemoStartMs, renderedAtMs);
  const failedEvent = session?.events.find((event) => event.eventType === "agent.session.failed");

  assert.equal(session?.status, "failed");
  assert.ok(session?.endedAt);
  assert.equal(failedEvent?.payload.metadata?.failureCode, "STREAM-CHECKPOINT-DRIFT");
});

test("demo playback opens the recovery run as completed even when it is outside the live window", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);
  const session = buildDemoPlaybackSessionDetail(demoPrimaryRecoverySessionId, renderedAtMs, initialDemoStartMs, renderedAtMs);

  assert.equal(session?.status, "completed");
  assert.equal(session?.sessionKey, "SS-407");
});

test("demo route state preserves the playback anchor in query params", () => {
  const demoState = resolveDemoPlaybackState(
    {
      demo: "1",
      demoStart: "123",
      demoAnchor: "456",
      demoResolved: "socket-shark-session-2",
    },
    999,
  );

  assert.deepEqual(demoState, {
    demoStart: 123,
    demoAnchor: 456,
    demoResolved: "socket-shark-session-2",
  });
  assert.equal(buildDemoSearch(demoState), "?demo=1&demoStart=123&demoAnchor=456&demoResolved=socket-shark-session-2");
});

test("demo route state round-trips a custom playback speed", () => {
  const demoState = resolveDemoPlaybackState(
    {
      demo: "1",
      demoStart: "100",
      demoAnchor: "200",
      demoSpeed: "10",
    },
    999,
  );

  assert.deepEqual(demoState, {
    demoStart: 100,
    demoAnchor: 200,
    demoResolved: null,
    demoSpeed: 10,
  });
  assert.equal(buildDemoSearch(demoState), "?demo=1&demoStart=100&demoAnchor=200&demoSpeed=10");
});

test("demo playback honors a non-default speed factor", () => {
  const renderedAtMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialDemoStartMs = createDemoStartValue(renderedAtMs);
  const elapsedMs = 5_000;

  const defaultSnapshot = buildDemoPlaybackDashboardData(renderedAtMs + elapsedMs, initialDemoStartMs, renderedAtMs);
  const fastSnapshot = buildDemoPlaybackDashboardData(renderedAtMs + elapsedMs, initialDemoStartMs, renderedAtMs, 25);

  assert.notEqual(defaultSnapshot.events.length, fastSnapshot.events.length);
});
