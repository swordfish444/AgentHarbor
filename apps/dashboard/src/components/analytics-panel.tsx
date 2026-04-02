import { dashboardFixtures, type DashboardFixtureVariant } from "../lib/dashboard-fixtures";
import { SimpleBarChart } from "./simple-bar-chart";

export function AnalyticsPanel({ variant }: { variant: DashboardFixtureVariant }) {
  const sections = dashboardFixtures[variant].analytics;

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Presentation placeholders</h2>
        </div>
        <span className="subtle-badge">Phase 4 live aggregates</span>
      </div>

      <div className="chart-grid">
        {sections.map((section) => (
          <article className="chart-card" key={section.id}>
            <div className="chart-header">
              <strong>{section.title}</strong>
              <p>{section.description}</p>
            </div>
            <SimpleBarChart points={section.points} />
          </article>
        ))}
      </div>
    </section>
  );
}
