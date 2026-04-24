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

export interface SessionFailureInsight {
  failureCode: string | null;
  rootCause: string | null;
  trigger: string | null;
  impact: string | null;
  affectedComponent: string | null;
  traceId: string | null;
  recoveredFromSessionKey: string | null;
  evidence: string[];
  nextActions: string[];
  eventType: string;
  createdAt: string;
}

export const getSessionTerminalEvent = (session: SessionDetail) =>
  [...session.events].reverse().find((event) => isTerminalEvent(event)) ?? null;

const failureInsightMetadataKeys = new Set([
  "failureCode",
  "rootCause",
  "trigger",
  "impact",
  "affectedComponent",
  "traceId",
  "evidence",
  "nextActions",
  "recoveredFromSessionKey",
]);

const metadataString = (metadata: EventListItem["payload"]["metadata"] | undefined, key: string) => {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const metadataStringArray = (metadata: EventListItem["payload"]["metadata"] | undefined, key: string) => {
  const value = metadata?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => item.trim().length > 0);
};

const hasFailureInsightMetadata = (event: EventListItem) =>
  Boolean(event.payload.metadata && Object.keys(event.payload.metadata).some((key) => failureInsightMetadataKeys.has(key)));

const candidateInsightEvents = (session: SessionDetail) => {
  const terminalEvent = getSessionTerminalEvent(session);
  const candidates = terminalEvent ? [terminalEvent] : [];

  for (const event of [...session.events].reverse()) {
    if (!candidates.some((candidate) => candidate.id === event.id)) {
      candidates.push(event);
    }
  }

  return candidates;
};

export function getSessionFailureInsight(session: SessionDetail): SessionFailureInsight | null {
  if (session.status !== "failed") {
    return null;
  }

  const sourceEvent = candidateInsightEvents(session).find(hasFailureInsightMetadata);
  const metadata = sourceEvent?.payload.metadata;

  if (!sourceEvent || !metadata) {
    return null;
  }

  return {
    failureCode: metadataString(metadata, "failureCode"),
    rootCause: metadataString(metadata, "rootCause"),
    trigger: metadataString(metadata, "trigger"),
    impact: metadataString(metadata, "impact"),
    affectedComponent: metadataString(metadata, "affectedComponent"),
    traceId: metadataString(metadata, "traceId"),
    recoveredFromSessionKey: metadataString(metadata, "recoveredFromSessionKey"),
    evidence: metadataStringArray(metadata, "evidence"),
    nextActions: metadataStringArray(metadata, "nextActions"),
    eventType: humanizeEventType(sourceEvent.eventType),
    createdAt: sourceEvent.createdAt,
  };
}

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
