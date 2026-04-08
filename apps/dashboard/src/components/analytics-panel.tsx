import type { DashboardAnalytics } from "../lib/control-node";
import { formatTime } from "../lib/formatters";
import { SimpleBarChart } from "./simple-bar-chart";

const titleCaseWords = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export function AnalyticsPanel({ analytics }: { analytics: DashboardAnalytics }) {
  const sections = [
    {
      id: "agent-types",
      title: "Sessions by agent type",
      description: "Live aggregate counts grouped by the agent currently reporting work.",
      points: analytics.agentTypes.items.map((item) => ({
        label: titleCaseWords(item.label),
        value: item.count,
      })),
      emptyCopy: "No sessions match the current aggregate filters yet.",
    },
    {
      id: "failures",
      title: "Failure categories",
      description: "Structured failure rollups ready for demos and operator drilldowns.",
      points: analytics.failures.items.map((item) => ({
        label: titleCaseWords(item.label),
        value: item.count,
      })),
      emptyCopy: "No failure categories are available for this dashboard slice.",
    },
    {
      id: "event-timeseries",
      title: "Event volume over time",
      description: "Recent telemetry activity grouped into backend time buckets.",
      points: analytics.eventTimeseries.points.map((point) => ({
        label: formatTime(point.bucketStart),
        value: point.count,
      })),
      emptyCopy: "No aggregate event volume has been reported yet.",
    },
  ];

  const hasAnyAnalytics = sections.some((section) => section.points.length > 0);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Live backend aggregates</h2>
        </div>
        <span className="subtle-badge">{hasAnyAnalytics ? "Backend data active" : "Awaiting aggregate data"}</span>
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
              <div className="empty-state">
                <strong>No aggregate data yet.</strong>
                <p>{section.emptyCopy}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
