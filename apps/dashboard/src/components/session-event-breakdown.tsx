import type { SessionDetail } from "@agentharbor/shared";
import { humanizeCategory, humanizeEventType } from "../lib/formatters";
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

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Event Breakdown</p>
          <h2>What happened most often</h2>
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
