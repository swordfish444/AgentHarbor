export default function DashboardLoading() {
  return (
    <main className="shell loading-shell">
      <section className="panel route-state-panel">
        <p className="eyebrow">Dashboard Loading</p>
        <h1>Preparing the operator view</h1>
        <p className="muted">Fetching the latest fleet, session, and telemetry data from the control node.</p>
        <div className="skeleton-stack">
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line skeleton-line-body" />
          <div className="skeleton-line skeleton-line-body short" />
        </div>
      </section>

      <section className="metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="panel skeleton-card" key={index}>
            <div className="skeleton-line skeleton-line-label" />
            <div className="skeleton-line skeleton-line-metric" />
            <div className="skeleton-line skeleton-line-body short" />
          </article>
        ))}
      </section>

      <section className="dashboard-main-grid">
        <article className="panel skeleton-card">
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-table">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="skeleton-line skeleton-line-row" key={index} />
            ))}
          </div>
        </article>
        <article className="panel skeleton-card">
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-table">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="skeleton-line skeleton-line-row" key={index} />
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
