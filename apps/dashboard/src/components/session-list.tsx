import Link from "next/link";
import type { SessionListItem } from "@agentharbor/shared";
import { hasActiveDashboardFilters, type DashboardQuery } from "../lib/dashboard-query";
import { formatDurationMs, formatInteger, formatTokenUsage, formatDateTime } from "../lib/formatters";
import { StatusPill } from "./status-pill";

export function SessionList({ sessions, query }: { sessions: SessionListItem[]; query: DashboardQuery }) {
  const filtered = hasActiveDashboardFilters(query);

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Sessions</p>
          <h2>Active and recent work</h2>
        </div>
        <span className="subtle-badge">{sessions.length} visible</span>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <strong>{filtered ? "No sessions match the current view." : "No sessions reported yet."}</strong>
          <p>
            {filtered
              ? "Try removing one of the active filters or broadening the search text."
              : "The latest runner telemetry will populate this panel once demo traffic starts."}
          </p>
          {filtered ? <Link href="/">Clear filters</Link> : null}
        </div>
      ) : (
        <div className="stack-list">
          {sessions.map((session) => (
            <Link
              className={`list-card session-card ${session.status === "failed" ? "list-card-critical" : ""}`}
              key={session.id}
              href={`/session/${session.id}`}
            >
              <div>
                <div className="list-title-row">
                  <strong>{session.runnerName}</strong>
                  <StatusPill status={session.status} />
                </div>
                <span className="row-meta">{session.sessionKey}</span>
                <p>{session.summary ?? "No summary reported for this session yet."}</p>
              </div>
              <div className="list-meta">
                <span>{session.agentType}</span>
                <span>{formatInteger(session.eventCount)} events</span>
                <span>{formatDurationMs(session.durationMs)}</span>
                <span>{formatInteger(session.filesTouchedCount)} files</span>
                <span>{formatTokenUsage(session.tokenUsage)}</span>
              </div>
              <div className="list-footer">
                <span>Started {formatDateTime(session.startedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
