import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatDurationMs, humanizeCategory, humanizeEventType } from "../lib/formatters";
import { getSessionFailureInsight, getSessionFailureSummary, getSessionTerminalEvent } from "../lib/session-detail";
import { RemedyActionButton } from "./remedy-action-button";
import { StatusPill } from "./status-pill";

export function SessionFailurePanel({ session, routeSearch = "" }: { session: SessionDetail; routeSearch?: string }) {
  const failureSummary = getSessionFailureSummary(session);
  const failureInsight = getSessionFailureInsight(session);
  const terminalEvent = getSessionTerminalEvent(session);
  const tone = session.status === "failed" ? "failed" : session.status === "completed" ? "completed" : "running";
  const title =
    session.status === "failed"
      ? "Failure summary"
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
  const eventLabel = failureSummary?.eventType ?? (terminalEvent ? humanizeEventType(terminalEvent.eventType) : "Awaiting terminal event");
  const recordedAt = formatDateTime(failureSummary?.createdAt ?? terminalEvent?.createdAt ?? session.endedAt);
  const primaryAction = failureInsight?.nextActions[0] ?? "Review the failed session timeline and raw telemetry.";
  const visibleRootCause = failureInsight?.rootCause ?? "Root cause not classified.";
  const remedyHref = failureInsight?.remedySessionId ? `/session/${failureInsight.remedySessionId}${routeSearch}` : null;

  const outcomeMeta = (
    <div className="outcome-meta">
      <span className="tag">Category: {category}</span>
      <span className="tag">Event: {eventLabel}</span>
      <span className="tag">Recorded: {recordedAt}</span>
      <span className="tag">Duration: {formatDurationMs(session.durationMs)}</span>
    </div>
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
        <>
          <div className="failure-triage-grid">
            <div className="failure-insight-card">
              <span className="row-meta">What went wrong</span>
              <strong>{visibleRootCause}</strong>
            </div>

            <div className="failure-insight-card">
              <span className="row-meta">Do next</span>
              <strong>{primaryAction}</strong>
            </div>
          </div>

          {remedyHref ? (
            <div className="remedy-action-row">
              <div>
                <span className="row-meta">Remedy</span>
                <strong>{failureInsight.remedyOutcome ?? "Open the recovery run to get the agent moving again."}</strong>
              </div>
              <RemedyActionButton href={remedyHref} label={failureInsight.remedyActionLabel ?? "Open recovery run"} />
            </div>
          ) : null}

          <details className="failure-detail-dropdown">
            <summary>Show evidence and trace details</summary>
            <div className="failure-detail-content">
              <div className="failure-detail-block">
                <span className="row-meta">Operator handle</span>
                <strong>{failureInsight.failureCode ?? "Uncoded failure"}</strong>
                <div className="outcome-meta">
                  {failureInsight.affectedComponent ? <span className="tag">Component: {failureInsight.affectedComponent}</span> : null}
                  {failureInsight.traceId ? <span className="tag">Trace: {failureInsight.traceId}</span> : null}
                  {failureInsight.recoveredFromSessionKey ? <span className="tag">Recovered from: {failureInsight.recoveredFromSessionKey}</span> : null}
                  {failureInsight.remedySessionKey ? <span className="tag">Recovery session: {failureInsight.remedySessionKey}</span> : null}
                </div>
              </div>

              {failureInsight.trigger || failureInsight.impact ? (
                <div className="failure-detail-block">
                  <span className="row-meta">Context</span>
                  {failureInsight.trigger ? <p>Trigger: {failureInsight.trigger}</p> : null}
                  {failureInsight.impact ? <p>Impact: {failureInsight.impact}</p> : null}
                </div>
              ) : null}

              {failureInsight.evidence.length > 0 ? (
                <div className="failure-detail-block">
                  <span className="row-meta">Evidence</span>
                  <ul className="failure-insight-list">
                    {failureInsight.evidence.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {failureInsight.nextActions.length > 1 ? (
                <div className="failure-detail-block">
                  <span className="row-meta">Full action list</span>
                  <ul className="failure-insight-list">
                    {failureInsight.nextActions.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {outcomeMeta}
            </div>
          </details>
        </>
      ) : null}

      {failureInsight ? null : outcomeMeta}
    </article>
  );
}
