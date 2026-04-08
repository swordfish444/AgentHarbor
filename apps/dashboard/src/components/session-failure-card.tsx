import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatDurationMs } from "../lib/formatters";
import { getSessionFailureSummary, getSessionTerminalEvent } from "../lib/session-detail";
import { StatusPill } from "./status-pill";

export function SessionFailureCard({ session }: { session: SessionDetail }) {
  const failureSummary = getSessionFailureSummary(session);
  const terminalEvent = getSessionTerminalEvent(session);

  const tone = session.status === "failed" ? "failed" : session.status === "completed" ? "completed" : "running";
  const title =
    session.status === "failed"
      ? "Failure explanation"
      : session.status === "completed"
        ? "Completed cleanly"
        : "Run still in progress";
  const summary =
    failureSummary?.summary ??
    terminalEvent?.payload.summary ??
    session.summary ??
    (session.status === "completed"
      ? "The session reached its terminal state without a failure signal."
      : "The session is still receiving telemetry and has not reached a terminal state yet.");
  const category =
    failureSummary?.category ??
    terminalEvent?.payload.category ??
    (session.status === "completed" ? "session" : "in-flight");

  return (
    <article className={`panel outcome-card outcome-card-${tone}`}>
      <div className="section-header">
        <div>
          <p className="eyebrow">Terminal State</p>
          <h2>{title}</h2>
        </div>
        <StatusPill status={session.status} />
      </div>

      <p className="outcome-copy">{summary}</p>

      <div className="outcome-meta">
        <span className="tag">Category: {category}</span>
        <span className="tag">
          Event: {terminalEvent ? terminalEvent.eventType : session.status === "running" ? "Awaiting terminal event" : "Not reported"}
        </span>
        <span className="tag">Recorded: {formatDateTime(failureSummary?.createdAt ?? terminalEvent?.createdAt ?? session.endedAt)}</span>
        <span className="tag">Duration: {formatDurationMs(session.durationMs)}</span>
      </div>
    </article>
  );
}
