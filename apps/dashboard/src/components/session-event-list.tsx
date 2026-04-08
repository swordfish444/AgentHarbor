import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, humanizeEventType } from "../lib/formatters";

export function SessionEventList({ events }: { events: SessionDetail["events"] }) {
  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Raw Events</p>
          <h2>Event feed</h2>
        </div>
        <span className="subtle-badge">{events.length} recorded</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <strong>No raw events recorded.</strong>
          <p>Once telemetry arrives, the exact payloads for each session event will appear here.</p>
        </div>
      ) : (
        <div className="event-feed event-feed-raw">
          {events.map((event) => (
            <div
              className={`list-card ${event.eventType === "agent.session.failed" || event.payload.status === "failed" ? "list-card-critical" : ""}`}
              key={event.id}
            >
              <div className="list-title-row">
                <strong>{humanizeEventType(event.eventType)}</strong>
                <span className="row-meta">{formatDateTime(event.createdAt)}</span>
              </div>
              <p>{event.payload.summary ?? "No summary attached."}</p>
              <div className="list-meta">
                <span>{event.runnerName}</span>
                <span>{event.payload.category ?? "uncategorized"}</span>
                <span>{event.payload.status ?? "n/a"}</span>
                <span>{event.payload.tokenUsage ?? 0} tokens</span>
                <span>{event.payload.filesTouchedCount ?? 0} files</span>
              </div>
              <pre className="payload-preview">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
