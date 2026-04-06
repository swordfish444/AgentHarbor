import { SimpleBarChart } from "./simple-bar-chart";

export function AnalyticsPanel({
  sections,
  modeLabel,
}: {
  sections: Array<{
    id: string;
    title: string;
    description: string;
    points: Array<{
      label: string;
      value: number;
    }>;
  }>;
  modeLabel: string;
}) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Fleet aggregates</h2>
        </div>
        <span className="subtle-badge">{modeLabel}</span>
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
