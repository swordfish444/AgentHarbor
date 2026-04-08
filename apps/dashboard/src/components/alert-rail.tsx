import Link from "next/link";
import type { AlertItem } from "@agentharbor/shared";

export function AlertRail({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Alert Rail</p>
          <h2>Operator attention</h2>
        </div>
        <span className="subtle-badge">{alerts.length} live</span>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <strong>No alerts are active.</strong>
          <p>The control node has not raised any fleet-level attention items for this view.</p>
        </div>
      ) : (
        <div className="alert-grid">
          {alerts.map((alert) =>
            alert.href ? (
              <Link className={`alert-card alert-card-interactive severity-${alert.severity}`} href={alert.href} key={alert.id}>
                <span className="alert-severity">{alert.severity}</span>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
                {typeof alert.count === "number" ? <span className="row-meta">{alert.count} affected</span> : null}
              </Link>
            ) : (
              <article className={`alert-card severity-${alert.severity}`} key={alert.id}>
                <span className="alert-severity">{alert.severity}</span>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
                {typeof alert.count === "number" ? <span className="row-meta">{alert.count} affected</span> : null}
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}
