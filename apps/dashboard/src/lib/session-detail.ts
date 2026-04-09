import type { EventListItem, SessionDetail } from "@agentharbor/shared";
import { humanizeEventType } from "./formatters";

const terminalEventStatuses = new Set(["completed", "failed", "blocked"]);

const isTerminalEvent = (event: EventListItem) =>
  event.eventType === "agent.session.completed" ||
  event.eventType === "agent.session.failed" ||
  terminalEventStatuses.has(event.payload.status ?? "");

export interface SessionFailureSummary {
  category: string;
  summary: string;
  eventType: string;
  createdAt: string | null;
}

export const getSessionTerminalEvent = (session: SessionDetail) =>
  [...session.events].reverse().find((event) => isTerminalEvent(event)) ?? null;

export function getSessionFailureSummary(session: SessionDetail): SessionFailureSummary | null {
  if (session.status !== "failed") {
    return null;
  }

  const terminalEvent = getSessionTerminalEvent(session);

  return {
    category: terminalEvent?.payload.category ?? "failure",
    summary: terminalEvent?.payload.summary ?? session.summary ?? "Session failed without a terminal summary.",
    eventType: terminalEvent ? humanizeEventType(terminalEvent.eventType) : "Terminal failure event unavailable",
    createdAt: terminalEvent?.createdAt ?? session.endedAt ?? null,
  };
}
