import type { SessionDetail } from "@agentharbor/shared";
import { formatInteger, formatTokenUsage, humanizeCategory, humanizeEventType } from "../lib/formatters";
import { SimpleBarChart } from "./simple-bar-chart";

const countBy = (labels: string[]) => {
  const counts = new Map<string, number>();

  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => {
      if (left.value !== right.value) {
        return right.value - left.value;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 5);
};

export function SessionEventBreakdown({ session }: { session: SessionDetail }) {
  const eventTypePoints = countBy(session.events.map((event) => humanizeEventType(event.eventType)));
  const categoryPoints = countBy(session.events.map((event) => humanizeCategory(event.payload.category)));
  const peakTokenCheckpoint = Math.max(...session.events.map((event) => event.payload.tokenUsage ?? 0), 0);
  const peakFilesCheckpoint = Math.max(...session.events.map((event) => event.payload.filesTouchedCount ?? 0), 0);

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Event Breakdown</p>
          <h2>What happened most often</h2>
        </div>
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

      <div className="insight-grid">
        <div className="insight-card">
          <strong>By event type</strong>
          <p>Which structured milestones showed up most in this session.</p>
          {eventTypePoints.length > 0 ? (
            <SimpleBarChart points={eventTypePoints} />
          ) : (
            <div className="empty-state compact-empty-state">
              <strong>No event types to chart.</strong>
              <p>Telemetry has not populated this session yet.</p>
            </div>
          )}
        </div>

        <div className="insight-card">
          <strong>By category</strong>
          <p>Where the runner spent its time or hit trouble.</p>
          {categoryPoints.length > 0 ? (
            <SimpleBarChart points={categoryPoints} />
          ) : (
            <div className="empty-state compact-empty-state">
              <strong>No categories to chart.</strong>
              <p>Telemetry has not populated this session yet.</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
