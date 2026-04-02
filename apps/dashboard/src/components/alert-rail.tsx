import Link from "next/link";
import { dashboardFixtures, type AlertPreviewItem, type DashboardFixtureVariant } from "../lib/dashboard-fixtures";

export function AlertRail({ variant }: { variant: DashboardFixtureVariant }) {
  const alerts: AlertPreviewItem[] = dashboardFixtures[variant].alerts;

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Alert Rail</p>
          <h2>Operator attention preview</h2>
        </div>
        <span className="subtle-badge">Phase 3 live logic</span>
      </div>

      <div className="alert-grid">
        {alerts.map((alert) =>
          alert.href ? (
            <Link className={`alert-card severity-${alert.severity}`} href={alert.href} key={alert.id}>
              <span className="alert-severity">{alert.severity}</span>
              <strong>{alert.title}</strong>
              <p>{alert.detail}</p>
            </Link>
          ) : (
            <article className={`alert-card severity-${alert.severity}`} key={alert.id}>
              <span className="alert-severity">{alert.severity}</span>
              <strong>{alert.title}</strong>
              <p>{alert.detail}</p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
