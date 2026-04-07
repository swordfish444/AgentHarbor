import type { EventListItem } from "@agentharbor/shared";
import { formatDateTime, humanizeCategory, humanizeEventType } from "../lib/formatters";

const toneForEvent = (event: EventListItem) => {
  if (event.eventType === "agent.session.failed" || event.payload.status === "failed") {
    return "failed";
  }

  if (event.eventType === "agent.session.completed" || event.payload.status === "completed") {
    return "completed";
  }

  if (event.eventType === "agent.session.started") {
    return "running";
  }

  return "neutral";
};

export function SessionTimeline({ events }: { events: EventListItem[] }) {
  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Timeline</p>
          <h2>Structured events</h2>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <strong>No structured events recorded.</strong>
          <p>When telemetry arrives for this session, the timeline will narrate it here in event order.</p>
        </div>
      ) : (
        <div className="timeline-list">
          {events.map((event) => (
            <div className="timeline-item" key={event.id}>
              <div className="timeline-marker">
                <div className="timeline-dot" data-tone={toneForEvent(event)} />
              </div>
              <div className="timeline-copy">
                <div className="list-title-row">
                  <strong>{humanizeEventType(event.eventType)}</strong>
                  <span className="row-meta">{formatDateTime(event.createdAt)}</span>
                </div>
                <p>{event.payload.summary ?? "No summary attached to this event."}</p>
                <div className="list-meta">
                  <span>{humanizeCategory(event.payload.category)}</span>
                  <span>{event.payload.status ?? "n/a"}</span>
                  <span>{event.payload.tokenUsage ?? 0} tokens</span>
                  <span>{event.payload.filesTouchedCount ?? 0} files</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
