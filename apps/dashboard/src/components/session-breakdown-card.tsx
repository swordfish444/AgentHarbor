import type { SessionDetail } from "@agentharbor/shared";
import { formatInteger, formatTokenUsage } from "../lib/formatters";
import { getSessionEventBreakdown } from "../lib/session-detail";
import { SimpleBarChart } from "./simple-bar-chart";

export function SessionBreakdownCard({ session }: { session: SessionDetail }) {
  const points = getSessionEventBreakdown(session.events);
  const peakTokenCheckpoint = Math.max(...session.events.map((event) => event.payload.tokenUsage ?? 0), 0);
  const peakFilesCheckpoint = Math.max(...session.events.map((event) => event.payload.filesTouchedCount ?? 0), 0);

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Metrics View</p>
          <h2>Event mix</h2>
        </div>
        <span className="subtle-badge">{points.length} event types</span>
      </div>

      <div className="summary-grid summary-grid-compact">
        <div className="summary-card">
          <span className="row-meta">Total Events</span>
          <strong>{formatInteger(session.eventCount)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Session Tokens</span>
          <strong>{formatTokenUsage(session.tokenUsage)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Peak Token Checkpoint</span>
          <strong>{formatInteger(peakTokenCheckpoint)} tokens</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Peak Files Checkpoint</span>
          <strong>{formatInteger(peakFilesCheckpoint)} files</strong>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="empty-state">
          <strong>No metric breakdown yet.</strong>
          <p>This chart will populate as soon as the session records structured telemetry events.</p>
        </div>
      ) : (
        <SimpleBarChart points={points} />
      )}
    </article>
  );
}
