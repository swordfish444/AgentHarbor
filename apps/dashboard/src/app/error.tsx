"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="shell">
      <section className="panel route-state-panel route-state-error">
        <p className="eyebrow">Dashboard Error</p>
        <h1>Control node request failed</h1>
        <p className="route-state-copy">
          The dashboard could not load its current snapshot. This is different from an empty state or a missing route.
        </p>
        <p className="muted">{error.message}</p>
        <div className="route-state-actions">
          <button className="button-primary" onClick={() => reset()} type="button">
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
