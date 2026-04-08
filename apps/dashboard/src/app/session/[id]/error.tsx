"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SessionDetailError({
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
        <p className="eyebrow">Session Error</p>
        <h1>Session detail could not be loaded</h1>
        <p className="route-state-copy">
          The request reached an error state instead of a true not-found response, so the drilldown can explain what
          failed during rehearsal.
        </p>
        <p className="muted">{error.message}</p>
        <div className="route-state-actions">
          <button className="button-primary" onClick={() => reset()} type="button">
            Retry
          </button>
          <Link className="button-secondary route-action-link" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
