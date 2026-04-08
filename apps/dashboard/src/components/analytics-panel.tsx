import type { DashboardAnalytics } from "../lib/control-node";
import { SimpleBarChart } from "./simple-bar-chart";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function AnalyticsPanel({ analytics }: { analytics: DashboardAnalytics }) {
  const sections = [
    {
      id: "agent-types",
      title: "Agent mix",
      description: "Sessions by agent type in the current dashboard window.",
      points: analytics.agentTypes.items.slice(0, 5).map((item) => ({
        label: item.label,
        value: item.count,
      })),
    },
    {
      id: "failure-categories",
      title: "Failure categories",
      description: "The failure modes currently surfacing most often.",
      points: analytics.failures.items.slice(0, 5).map((item) => ({
        label: item.label,
        value: item.count,
      })),
    },
    {
      id: "runner-activity",
      title: "Runner activity",
      description: "Which runners are carrying the most sessions right now.",
      points: analytics.runnerActivity.items.slice(0, 5).map((item) => ({
        label: item.runnerName,
        value: item.sessionCount,
      })),
    },
    {
      id: "event-timeseries",
      title: "Telemetry volume",
      description: "Recent event throughput in five-minute buckets.",
      points: analytics.eventTimeseries.points.slice(-8).map((point) => ({
        label: timeFormatter.format(new Date(point.bucketStart)),
        value: point.count,
      })),
    },
  ];

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Live control-node aggregates</h2>
        </div>
        <span className="subtle-badge">Filter-aware</span>
      </div>

      <div className="chart-grid">
        {sections.map((section) => (
          <article className="chart-card" key={section.id}>
            <div className="chart-header">
              <strong>{section.title}</strong>
              <p>{section.description}</p>
            </div>
            {section.points.length > 0 ? (
              <SimpleBarChart points={section.points} />
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No data in this slice.</strong>
                <p>Expand the filters or send new demo telemetry to populate this chart.</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
