import assert from "node:assert/strict";
import test from "node:test";
import { scaleDemoOffset } from "@agentharbor/shared";
import { buildDemoDashboardData } from "./demo-mode";
import { pinDemoAgentDetailData } from "./demo-agent-detail";

test("pins the selected demo agent when playback rolls before its join window", () => {
  const demoStartMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialData = buildDemoDashboardData(demoStartMs + scaleDemoOffset(570_000), demoStartMs);
  const currentData = buildDemoDashboardData(demoStartMs + scaleDemoOffset(10_000), demoStartMs);

  assert.ok(initialData.runners.some((runner) => runner.id === "socket-shark"));
  assert.equal(currentData.runners.some((runner) => runner.id === "socket-shark"), false);

  const pinnedData = pinDemoAgentDetailData(currentData, initialData, "socket-shark");

  assert.ok(pinnedData.runners.some((runner) => runner.id === "socket-shark"));
  assert.ok(pinnedData.sessions.some((session) => session.runnerId === "socket-shark"));
  assert.ok(pinnedData.events.some((event) => event.runnerId === "socket-shark"));
});

test("keeps current playback data primary when the selected demo agent is still visible", () => {
  const demoStartMs = Date.parse("2026-04-22T22:00:00.000Z");
  const initialData = buildDemoDashboardData(demoStartMs + scaleDemoOffset(570_000), demoStartMs);
  const currentData = buildDemoDashboardData(demoStartMs + scaleDemoOffset(590_000), demoStartMs);
  const currentRunner = currentData.runners.find((runner) => runner.id === "socket-shark");

  assert.ok(currentRunner);

  const pinnedData = pinDemoAgentDetailData(currentData, initialData, "socket-shark");
  const pinnedRunners = pinnedData.runners.filter((runner) => runner.id === "socket-shark");

  assert.equal(pinnedRunners.length, 1);
  assert.equal(pinnedRunners[0]?.lastSeenAt, currentRunner.lastSeenAt);
});
