import Link from "next/link";
import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatDurationMs, formatTokenUsage } from "../lib/formatters";
import { StatusPill } from "./status-pill";

export function SessionHero({ session }: { session: SessionDetail }) {
  return (
    <section className="panel detail-hero">
      <div>
        <Link className="back-link" href="/">
          Back to dashboard
        </Link>
        <p className="eyebrow">Session Detail</p>
        <h1>{session.summary ?? session.sessionKey}</h1>
        <p className="hero-copy">
          Runner <strong>{session.runnerName}</strong> tracked as <strong>{session.agentType}</strong>.
        </p>
      </div>
      <div className="detail-meta">
        <StatusPill status={session.status} />
        <span>Started {formatDateTime(session.startedAt)}</span>
        <span>{formatDurationMs(session.durationMs)}</span>
        <span>{formatTokenUsage(session.tokenUsage)}</span>
      </div>
    </section>
  );
}
