import Link from "next/link";
import { MetricCard } from "../components/metric-card";
import { StatusPill } from "../components/status-pill";
import { getDashboardData } from "../lib/control-node";

export default async function HomePage() {
  const { stats, runners, sessions, events } = await getDashboardData();

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AgentHarbor</p>
          <h1>Control tower visibility for AI agents spread across your fleet.</h1>
          <p className="hero-copy">
            Track runners, session state, and structured telemetry from Codex, Claude Code, Cursor, and automation
            workers without turning the platform into an orchestrator.
          </p>
        </div>
        <div className="hero-meta panel">
          <p className="eyebrow">Transport</p>
          <p>HTTPS JSON control plane</p>
          <p className="eyebrow top-gap">Future-ready</p>
          <p>Transport boundary is isolated for gRPC streaming later.</p>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="Online Runners" value={`${stats.onlineRunners}/${stats.totalRunners}`} detail="Live heartbeat view across enrolled machines." />
        <MetricCard label="Active Sessions" value={`${stats.activeSessions}`} detail="Sessions currently reported as running." />
        <MetricCard label="24h Sessions" value={`${stats.sessionsLast24h}`} detail="Recent agent work across all runners." />
        <MetricCard label="24h Events" value={`${stats.eventsLast24h}`} detail={`Failures in window: ${stats.failedSessionsLast24h}`} />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Runner Fleet</p>
              <h2>Connected machines</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Runner</th>
                  <th>Machine</th>
                  <th>Status</th>
                  <th>Active Sessions</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {runners.map((runner) => (
                  <tr key={runner.id}>
                    <td>
                      <strong>{runner.name}</strong>
                      <span className="row-meta">{runner.id}</span>
                    </td>
                    <td>
                      {runner.hostname}
                      <span className="row-meta">
                        {runner.os} / {runner.architecture}
                      </span>
                    </td>
                    <td>
                      <StatusPill status={runner.isOnline ? "online" : runner.status} />
                    </td>
                    <td>{runner.activeSessionCount}</td>
                    <td>{runner.lastSeenAt ? new Date(runner.lastSeenAt).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Sessions</p>
              <h2>Recent work</h2>
            </div>
          </div>
          <div className="stack-list">
            {sessions.map((session) => (
              <Link className="list-card" key={session.id} href={`/session/${session.id}`}>
                <div>
                  <div className="list-title-row">
                    <strong>{session.runnerName}</strong>
                    <StatusPill status={session.status} />
                  </div>
                  <p>{session.summary ?? "No summary yet."}</p>
                </div>
                <div className="list-meta">
                  <span>{session.agentType}</span>
                  <span>{session.eventCount} events</span>
                  <span>{session.durationMs ? `${Math.round(session.durationMs / 1000)}s` : "Running"}</span>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Telemetry</p>
            <h2>Recent event stream</h2>
          </div>
        </div>
        <div className="event-grid">
          {events.map((event) => (
            <div className="event-card" key={event.id}>
              <div className="list-title-row">
                <strong>{event.eventType}</strong>
                <span className="row-meta">{new Date(event.createdAt).toLocaleTimeString()}</span>
              </div>
              <p>{event.payload.summary ?? "Structured event with no summary text."}</p>
              <div className="list-meta">
                <span>{event.runnerName}</span>
                <span>{event.payload.agentType}</span>
                <span>{event.payload.category ?? "uncategorized"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
