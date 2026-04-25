import assert from "node:assert/strict";
import test from "node:test";
import type { SessionDetail } from "@agentharbor/shared";
import { getSessionFailureInsight, getSessionFailureSummary, getSessionTerminalEvent } from "./session-detail";

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

test("extracts structured failure insight from terminal event metadata", () => {
  const session = buildSession([
    {
      id: "event-1",
      runnerId: "runner-1",
      runnerName: "mission-codex-1",
      sessionId: "session-1",
      sessionKey: "mission-codex-1-blocked",
      eventType: "agent.session.failed",
      payload: {
        timestamp: "2026-04-09T18:04:00.000Z",
        agentType: "codex",
        sessionKey: "mission-codex-1-blocked",
        summary: "Replay failed after socket checkpoint drift.",
        category: "network",
        status: "failed",
        metadata: {
          failureCode: "STREAM-CHECKPOINT-DRIFT",
          rootCause: "Replay cursor advanced before checkpoint acknowledgement persisted.",
          trigger: "Staging socket reset at reconnect boundary.",
          impact: "Rollback replay cannot be trusted yet.",
          affectedComponent: "control-node event stream",
          traceId: "demo-trace-ss-406",
          recoveredFromSessionKey: "SS-406",
          remedyActionLabel: "Apply checkpoint guard",
          remedySessionId: "socket-shark-session-3",
          remedySessionKey: "SS-407",
          remedyOutcome: "Recovery replay verifies the checkpoint guard.",
          evidence: ["Socket reset preceded checkpoint ack.", "Heartbeat stayed online."],
          nextActions: ["Pause rollback drill.", "Replay with checkpoint guard."],
        },
      },
      createdAt: "2026-04-09T18:04:00.000Z",
    },
  ]);

  assert.deepEqual(getSessionFailureInsight(session), {
    failureCode: "STREAM-CHECKPOINT-DRIFT",
    rootCause: "Replay cursor advanced before checkpoint acknowledgement persisted.",
    trigger: "Staging socket reset at reconnect boundary.",
    impact: "Rollback replay cannot be trusted yet.",
    affectedComponent: "control-node event stream",
    traceId: "demo-trace-ss-406",
    recoveredFromSessionKey: "SS-406",
    remedyActionLabel: "Apply checkpoint guard",
    remedySessionId: "socket-shark-session-3",
    remedySessionKey: "SS-407",
    remedyOutcome: "Recovery replay verifies the checkpoint guard.",
    evidence: ["Socket reset preceded checkpoint ack.", "Heartbeat stayed online."],
    nextActions: ["Pause rollback drill.", "Replay with checkpoint guard."],
    eventType: "Agent / Session / Failed",
    createdAt: "2026-04-09T18:04:00.000Z",
  });
});

test("failure insight falls back cleanly when metadata is absent", () => {
  const session = buildSession([
    {
      id: "event-1",
      runnerId: "runner-1",
      runnerName: "mission-codex-1",
      sessionId: "session-1",
      sessionKey: "mission-codex-1-blocked",
      eventType: "agent.session.failed",
      payload: {
        timestamp: "2026-04-09T18:04:00.000Z",
        agentType: "codex",
        sessionKey: "mission-codex-1-blocked",
        summary: "Replay failed without structured metadata.",
        category: "network",
        status: "failed",
      },
      createdAt: "2026-04-09T18:04:00.000Z",
    },
  ]);

  assert.equal(getSessionFailureInsight(session), null);
});

test("failure insight ignores malformed array metadata entries", () => {
  const session = buildSession([
    {
      id: "event-1",
      runnerId: "runner-1",
      runnerName: "mission-codex-1",
      sessionId: "session-1",
      sessionKey: "mission-codex-1-blocked",
      eventType: "agent.session.failed",
      payload: {
        timestamp: "2026-04-09T18:04:00.000Z",
        agentType: "codex",
        sessionKey: "mission-codex-1-blocked",
        summary: "Replay failed with partially malformed metadata.",
        category: "network",
        status: "failed",
        metadata: {
          failureCode: "STREAM-CHECKPOINT-DRIFT",
          evidence: ["Socket reset preceded checkpoint ack.", 42, "", null] as unknown as string[],
          nextActions: [false, "Replay with checkpoint guard."] as unknown as string[],
        },
      },
      createdAt: "2026-04-09T18:04:00.000Z",
    },
  ]);

  const insight = getSessionFailureInsight(session);

  assert.deepEqual(insight?.evidence, ["Socket reset preceded checkpoint ack."]);
  assert.deepEqual(insight?.nextActions, ["Replay with checkpoint guard."]);
});
