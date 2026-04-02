import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatInteger } from "../lib/formatters";

export function SessionSummaryCards({ session }: { session: SessionDetail }) {
  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Session Summary</p>
          <h2>Rollup</h2>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <span className="row-meta">Session Key</span>
          <strong>{session.sessionKey}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Runner</span>
          <strong>{session.runnerName}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Files Touched</span>
          <strong>{formatInteger(session.filesTouchedCount)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Events</span>
          <strong>{formatInteger(session.eventCount)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Ended</span>
          <strong>{session.endedAt ? formatDateTime(session.endedAt) : "Not finished"}</strong>
        </div>
      </div>
    </article>
  );
}
