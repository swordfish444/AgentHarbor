"use client";

import Link from "next/link";

export function RouteErrorState({
  eyebrow,
  title,
  description,
  reset,
}: {
  eyebrow: string;
  title: string;
  description: string;
  reset: () => void;
}) {
  return (
    <main className="shell route-state-shell">
      <section className="panel route-state">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="hero-copy">{description}</p>
        <div className="route-state-actions">
          <button className="button-primary" onClick={reset} type="button">
            Try again
          </button>
          <Link className="button-secondary route-link-button" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
