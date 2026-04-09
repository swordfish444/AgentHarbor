import assert from "node:assert/strict";
import test from "node:test";
import { parseStreamMetadata } from "./live-refresh";

test("uses stream payload metadata when emittedAt and type are present", () => {
  const metadata = parseStreamMetadata(
    JSON.stringify({
      emittedAt: "2026-04-09T19:00:00.000Z",
      type: "telemetry.created",
    }),
    "stats.refresh",
    () => "2026-04-09T19:05:00.000Z",
  );

  assert.deepEqual(metadata, {
    emittedAt: "2026-04-09T19:00:00.000Z",
    type: "telemetry.created",
  });
});

test("falls back to the current timestamp and event type when stream payload is malformed", () => {
  const metadata = parseStreamMetadata("not json", "stats.refresh", () => "2026-04-09T19:05:00.000Z");

  assert.deepEqual(metadata, {
    emittedAt: "2026-04-09T19:05:00.000Z",
    type: "stats.refresh",
  });
});
