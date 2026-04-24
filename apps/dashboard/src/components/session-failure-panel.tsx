import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatDurationMs, humanizeCategory, humanizeEventType } from "../lib/formatters";
import { getSessionFailureInsight, getSessionFailureSummary, getSessionTerminalEvent } from "../lib/session-detail";
import { StatusPill } from "./status-pill";

export function SessionFailurePanel({ session }: { session: SessionDetail }) {
  const failureSummary = getSessionFailureSummary(session);
  const failureInsight = getSessionFailureInsight(session);
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
  const category = humanizeCategory(
    failureSummary?.category ??
      terminalEvent?.payload.category ??
      (session.status === "completed" ? "session" : "in-flight"),
  );

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

      {failureInsight ? (
        <div className="failure-insight-grid">
          <div className="failure-insight-card">
            <span className="row-meta">Root cause</span>
            <strong>{failureInsight.rootCause ?? "Root cause not classified."}</strong>
            {failureInsight.trigger ? <p>Trigger: {failureInsight.trigger}</p> : null}
            {failureInsight.impact ? <p>Impact: {failureInsight.impact}</p> : null}
          </div>

          <div className="failure-insight-card">
            <span className="row-meta">Operator handle</span>
            <strong>{failureInsight.failureCode ?? "Uncoded failure"}</strong>
            <div className="outcome-meta">
              {failureInsight.affectedComponent ? <span className="tag">Component: {failureInsight.affectedComponent}</span> : null}
              {failureInsight.traceId ? <span className="tag">Trace: {failureInsight.traceId}</span> : null}
              {failureInsight.recoveredFromSessionKey ? <span className="tag">Recovered from: {failureInsight.recoveredFromSessionKey}</span> : null}
            </div>
          </div>

          {failureInsight.evidence.length > 0 ? (
            <div className="failure-insight-card">
              <span className="row-meta">Evidence</span>
              <ul className="failure-insight-list">
                {failureInsight.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {failureInsight.nextActions.length > 0 ? (
            <div className="failure-insight-card">
              <span className="row-meta">Next action</span>
              <ul className="failure-insight-list">
                {failureInsight.nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="outcome-meta">
        <span className="tag">Category: {category}</span>
        <span className="tag">
          Event: {failureSummary?.eventType ?? (terminalEvent ? humanizeEventType(terminalEvent.eventType) : "Awaiting terminal event")}
        </span>
        <span className="tag">Recorded: {formatDateTime(failureSummary?.createdAt ?? terminalEvent?.createdAt ?? session.endedAt)}</span>
        <span className="tag">Duration: {formatDurationMs(session.durationMs)}</span>
      </div>
    </article>
  );
}
