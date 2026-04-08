import Link from "next/link";
import type { DashboardAlert } from "../lib/dashboard-alerts";

export function AlertRail({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Alert Rail</p>
          <h2>Operator attention</h2>
        </div>
        <span className="subtle-badge">{alerts.length > 0 ? "Live derived alerts" : "No urgent alerts"}</span>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <strong>No urgent alerts right now.</strong>
          <p>The visible dashboard slice is quiet, so the rail stays calm instead of inventing warnings.</p>
        </div>
      ) : (
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
      )}
    </section>
  );
}
