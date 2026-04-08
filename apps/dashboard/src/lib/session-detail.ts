import type { EventListItem, SessionDetail } from "@agentharbor/shared";
import { humanizeEventType } from "./formatters";

const terminalStatuses = new Set(["completed", "failed"]);

const isTerminalEvent = (event: EventListItem) =>
  event.eventType === "agent.session.completed" ||
  event.eventType === "agent.session.failed" ||
  terminalStatuses.has(event.payload.status ?? "");

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

export const getSessionEventBreakdown = (events: SessionDetail["events"]) => {
  const counts = new Map<string, number>();

  for (const event of events) {
    const label = humanizeEventType(event.eventType);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}
