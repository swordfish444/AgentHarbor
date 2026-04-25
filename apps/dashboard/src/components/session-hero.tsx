import Link from "next/link";
import type { SessionDetail } from "@agentharbor/shared";
import { formatDateTime, formatDurationMs, formatTokenUsage } from "../lib/formatters";
import { getSessionFailureSummary } from "../lib/session-detail";
import { StatusPill } from "./status-pill";

export function SessionHero({ session, backHref = "/" }: { session: SessionDetail; backHref?: string }) {
  const failureSummary = getSessionFailureSummary(session);
  const heroCopy =
    session.status === "failed"
      ? `Failure surfaced in ${failureSummary?.category ?? "failure"} and is ready for operator review below.`
      : session.status === "completed"
        ? "The session reached a clean terminal state and the timeline below captures the full path."
        : "The session is still active, so the timeline and event feed will keep telling the story as telemetry arrives.";

  return (
    <section className="panel detail-hero session-hero" data-status={session.status}>
      <div className="session-hero-copy">
        <Link className="back-link" href={backHref}>
          Back to dashboard
        </Link>
        <p className="eyebrow">Session Detail</p>
        <h1>{session.summary ?? session.sessionKey}</h1>
        <p className="hero-copy">
          Runner <strong>{session.runnerName}</strong> tracked as <strong>{session.agentType}</strong>. {heroCopy}
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
