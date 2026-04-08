import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, humanizeCategory } from "../lib/formatters";

const findPrimaryFailureEvent = (session: SessionDetail) =>
  [...session.events]
    .reverse()
    .find(
      (event) =>
        event.eventType === "agent.session.failed" ||
        event.payload.status === "failed" ||
        event.payload.status === "blocked",
    );

export function SessionFailurePanel({ session }: { session: SessionDetail }) {
  const failureEvent = findPrimaryFailureEvent(session);

  if (!failureEvent) {
    return (
      <article className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Failure Context</p>
            <h2>No current escalation</h2>
          </div>
        </div>
        <div className="empty-state compact-empty-state">
          <strong>No failure-classified event was recorded for this session.</strong>
          <p>Use the timeline and raw events below to inspect the full sequence if this session still looks suspicious.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Failure Context</p>
          <h2>Primary operator explanation</h2>
        </div>
        <span className="subtle-badge">{humanizeCategory(failureEvent.payload.category)}</span>
      </div>

      <div className="insight-card failure-insight-card">
        <strong>{failureEvent.payload.summary ?? "No failure summary was attached to the terminal event."}</strong>
        <p>The highest-signal failure marker arrived at {formatDateTime(failureEvent.createdAt)}.</p>
        <div className="list-meta">
          <span>{failureEvent.eventType}</span>
          <span>{failureEvent.payload.status ?? "n/a"}</span>
          <span>{humanizeCategory(failureEvent.payload.category)}</span>
        </div>
      </div>
    </article>
  );
}
