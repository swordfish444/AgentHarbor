import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "../../../components/status-pill";
import { getSessionDetail } from "../../../lib/control-node";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = await getSessionDetail(id);

    return (
      <main className="shell">
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
            <span>Started {new Date(session.startedAt).toLocaleString()}</span>
            <span>{session.durationMs ? `${Math.round(session.durationMs / 1000)} seconds` : "Still running"}</span>
            <span>{session.tokenUsage ? `${session.tokenUsage} tokens` : "No token usage reported"}</span>
          </div>
        </section>

        <section className="content-grid">
          <article className="panel">
            <p className="eyebrow">Session Summary</p>
            <h2>Rollup</h2>
            <div className="detail-grid">
              <div>
                <span className="row-meta">Session Key</span>
                <strong>{session.sessionKey}</strong>
              </div>
              <div>
                <span className="row-meta">Files Touched</span>
                <strong>{session.filesTouchedCount ?? 0}</strong>
              </div>
              <div>
                <span className="row-meta">Events</span>
                <strong>{session.eventCount}</strong>
              </div>
              <div>
                <span className="row-meta">Ended</span>
                <strong>{session.endedAt ? new Date(session.endedAt).toLocaleString() : "Not finished"}</strong>
              </div>
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">Timeline</p>
            <h2>Structured events</h2>
            <div className="stack-list">
              {session.events.map((event) => (
                <div className="event-card" key={event.id}>
                  <div className="list-title-row">
                    <strong>{event.eventType}</strong>
                    <span className="row-meta">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{event.payload.summary ?? "No summary attached to this event."}</p>
                  <div className="list-meta">
                    <span>{event.payload.category ?? "uncategorized"}</span>
                    <span>{event.payload.status ?? "n/a"}</span>
                    <span>{event.payload.tokenUsage ?? 0} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
