export default function SessionDetailLoading() {
  return (
    <main className="shell loading-shell">
      <section className="panel route-state-panel">
        <p className="eyebrow">Session Loading</p>
        <h1>Preparing the session drilldown</h1>
        <p className="muted">Pulling the latest timeline, metrics, and raw event details for this run.</p>
        <div className="skeleton-stack">
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line skeleton-line-body" />
          <div className="skeleton-line skeleton-line-body short" />
        </div>
      </section>

      <section className="detail-layout">
        <div className="detail-column">
          {Array.from({ length: 3 }, (_, index) => (
            <article className="panel skeleton-card" key={index}>
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-body" />
              <div className="skeleton-line skeleton-line-body short" />
            </article>
          ))}
        </div>
        <div className="detail-column">
          {Array.from({ length: 2 }, (_, index) => (
            <article className="panel skeleton-card" key={index}>
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-table">
                {Array.from({ length: 4 }, (_, row) => (
                  <div className="skeleton-line skeleton-line-row" key={row} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
