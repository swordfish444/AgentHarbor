import type { EventListItem } from "@agentharbor/shared";
import { formatDateTime, humanizeCategory, humanizeEventType } from "../lib/formatters";

export function SessionRawEvents({ events }: { events: EventListItem[] }) {
  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Raw Events</p>
          <h2>Operator inspection list</h2>
        </div>
        <span className="subtle-badge">{events.length} total</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <strong>No raw events have been recorded for this session.</strong>
          <p>As structured telemetry arrives, the full event history will appear here.</p>
        </div>
      ) : (
        <div className="event-feed event-feed-raw">
          {events.map((event) => (
            <div
              className={`list-card raw-event-card ${
                event.eventType === "agent.session.failed" ||
                event.payload.status === "failed" ||
                event.payload.status === "blocked"
                  ? "list-card-critical"
                  : ""
              }`}
              key={event.id}
            >
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
                <span>{event.payload.durationMs ?? 0} ms</span>
              </div>
              <pre className="payload-preview">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
