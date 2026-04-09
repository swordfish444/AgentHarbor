import assert from "node:assert/strict";
import test from "node:test";
import type { SessionDetail } from "@agentharbor/shared";
import { getSessionFailureSummary, getSessionTerminalEvent } from "./session-detail";

const buildSession = (events: SessionDetail["events"]): SessionDetail => ({
  id: "session-1",
  runnerId: "runner-1",
  runnerName: "mission-codex-1",
  agentType: "codex",
  sessionKey: "mission-codex-1-blocked",
  status: "failed",
  startedAt: "2026-04-09T18:00:00.000Z",
  endedAt: "2026-04-09T18:04:00.000Z",
  summary: "Session failed while waiting for an approval gate.",
  tokenUsage: 420,
  durationMs: 240000,
  filesTouchedCount: 3,
  eventCount: events.length,
  events,
});

test("treats blocked events as the terminal failure signal when sessions fail", () => {
  const session = buildSession([
    {
      id: "event-1",
      runnerId: "runner-1",
      runnerName: "mission-codex-1",
      sessionId: "session-1",
      sessionKey: "mission-codex-1-blocked",
      eventType: "agent.session.started",
      payload: {
        timestamp: "2026-04-09T18:00:00.000Z",
        agentType: "codex",
        sessionKey: "mission-codex-1-blocked",
        summary: "Session started.",
        category: "session",
        status: "running",
      },
      createdAt: "2026-04-09T18:00:00.000Z",
    },
    {
      id: "event-2",
      runnerId: "runner-1",
      runnerName: "mission-codex-1",
      sessionId: "session-1",
      sessionKey: "mission-codex-1-blocked",
      eventType: "agent.prompt.executed",
      payload: {
        timestamp: "2026-04-09T18:04:00.000Z",
        agentType: "codex",
        sessionKey: "mission-codex-1-blocked",
        summary: "Timed out while waiting for an approval gate.",
        category: "human-approval",
        status: "blocked",
      },
      createdAt: "2026-04-09T18:04:00.000Z",
    },
  ]);

  const terminalEvent = getSessionTerminalEvent(session);
  assert.equal(terminalEvent?.payload.status, "blocked");

  const summary = getSessionFailureSummary(session);
  assert.deepEqual(summary, {
    category: "human-approval",
    summary: "Timed out while waiting for an approval gate.",
    eventType: "Agent / Prompt / Executed",
    createdAt: "2026-04-09T18:04:00.000Z",
  });
});
