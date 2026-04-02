import Link from "next/link";
import type { EventListItem } from "@agentharbor/shared";
import { hasActiveDashboardFilters, type DashboardQuery } from "../lib/dashboard-query";
import { formatTime, humanizeEventType } from "../lib/formatters";

export function LiveEventFeed({ events, query }: { events: EventListItem[]; query: DashboardQuery }) {
  const filtered = hasActiveDashboardFilters(query);

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Telemetry</p>
          <h2>Recent event stream</h2>
        </div>
        <span className="subtle-badge">Snapshot mode</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <strong>{filtered ? "No telemetry matches the current filters." : "No telemetry events yet."}</strong>
          <p>
            {filtered
              ? "The event feed honors the session, runner, label, and search filters from the URL."
              : "Phase 3 will make this panel live, but the filtered server snapshot is already wired in."}
          </p>
          {filtered ? <Link href="/">Clear filters</Link> : null}
        </div>
      ) : (
        <div className="event-feed">
          {events.map((event) => {
            const content = (
              <>
                <div className="list-title-row">
                  <strong>{humanizeEventType(event.eventType)}</strong>
                  <span className="row-meta">{formatTime(event.createdAt)}</span>
                </div>
                <p>{event.payload.summary ?? "Structured event with no summary text."}</p>
                <div className="list-meta">
                  <span>{event.runnerName}</span>
                  <span>{event.payload.agentType}</span>
                  <span>{event.payload.category ?? "uncategorized"}</span>
                  {event.sessionKey ? <span>{event.sessionKey}</span> : null}
                </div>
              </>
            );

            if (!event.sessionId) {
              return (
                <div className="event-card" key={event.id}>
                  {content}
                </div>
              );
            }

            return (
              <Link className="event-card event-link" href={`/session/${event.sessionId}`} key={event.id}>
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
