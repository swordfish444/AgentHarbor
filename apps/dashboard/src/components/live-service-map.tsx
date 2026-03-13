"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";
import { MetricCard } from "./metric-card";
import { StatusPill } from "./status-pill";
import type { DashboardEvent, DashboardRunner, DashboardSession, DashboardSnapshot } from "../lib/control-node";

const palette = [
  { fill: "#4ee9a0", ring: "rgba(78, 233, 160, 0.24)", shadow: "rgba(78, 233, 160, 0.4)" },
  { fill: "#ff8a5b", ring: "rgba(255, 138, 91, 0.24)", shadow: "rgba(255, 138, 91, 0.38)" },
  { fill: "#4ac2ff", ring: "rgba(74, 194, 255, 0.24)", shadow: "rgba(74, 194, 255, 0.4)" },
  { fill: "#f7d36d", ring: "rgba(247, 211, 109, 0.24)", shadow: "rgba(247, 211, 109, 0.34)" },
  { fill: "#d38cff", ring: "rgba(211, 140, 255, 0.24)", shadow: "rgba(211, 140, 255, 0.38)" },
  { fill: "#ff6b8f", ring: "rgba(255, 107, 143, 0.24)", shadow: "rgba(255, 107, 143, 0.34)" },
];

type RunnerNode = {
  kind: "runner";
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: (typeof palette)[number];
  runner: DashboardRunner;
  sessions: DashboardSession[];
  events: DashboardEvent[];
  agentType: string;
  latestSummary: string;
  totalTokenUsage: number;
  avgDurationMs: number;
  failedSessions: number;
};

type ControlNode = {
  kind: "control";
  id: "control";
  label: string;
  radius: number;
  x: number;
  y: number;
};

type HoverTarget =
  | {
      type: "node";
      nodeId: string;
    }
  | {
      type: "edge";
      nodeId: string;
    };

const controlNode: ControlNode = {
  kind: "control",
  id: "control",
  label: "Master Node",
  radius: 66,
  x: 50,
  y: 50,
};

const formatDuration = (durationMs: number | null | undefined) => {
  if (!durationMs) {
    return "n/a";
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
};

const formatRelative = (value: string | null) => {
  if (!value) {
    return "Never seen";
  }

  const deltaSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  if (deltaSeconds < 3_600) {
    return `${Math.round(deltaSeconds / 60)}m ago`;
  }

  return `${Math.round(deltaSeconds / 3_600)}h ago`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const extractBars = (sessions: DashboardSession[], events: DashboardEvent[]) => {
  const values = events
    .slice(0, 6)
    .reverse()
    .map((event) => event.payload.tokenUsage ?? event.payload.filesTouchedCount ?? 1);

  if (values.length > 0) {
    return values;
  }

  return sessions
    .slice(0, 6)
    .reverse()
    .map((session) => session.tokenUsage ?? session.durationMs ?? 1);
};

const SparkBars = ({ values, color }: { values: number[]; color: string }) => {
  const normalized = values.length > 0 ? values : [1];
  const maxValue = Math.max(...normalized, 1);

  return (
    <svg className="sparkbars" viewBox={`0 0 ${normalized.length * 18} 72`} role="img" aria-label="Recent activity sparkbars">
      {normalized.map((value, index) => {
        const height = Math.max(10, (value / maxValue) * 58);
        return (
          <g key={`${value}-${index}`}>
            <rect className="sparkbar-bg" x={index * 18} y={6} width={12} height={60} rx={6} />
            <rect className="sparkbar-fill" x={index * 18} y={66 - height} width={12} height={height} rx={6} fill={color} />
          </g>
        );
      })}
    </svg>
  );
};

function buildRunnerNodes(data: DashboardSnapshot): RunnerNode[] {
  const visibleRunners = data.runners.length > 0 ? data.runners : [];

  return visibleRunners.map((runner, index) => {
    const sessions = data.sessions.filter((session) => session.runnerId === runner.id);
    const events = data.events.filter((event) => event.runnerId === runner.id);
    const primarySession = sessions[0];
    const primaryEvent = events.find((event) => event.payload.agentType !== "automation") ?? events[0];
    const agentType = primarySession?.agentType ?? primaryEvent?.payload.agentType ?? "custom";
    const latestSummary =
      primarySession?.summary ??
      events.find((event) => event.payload.summary)?.payload.summary ??
      "No summary has been reported yet.";
    const totalTokenUsage = sessions.reduce((sum, session) => sum + (session.tokenUsage ?? 0), 0);
    const avgDurationMs =
      sessions.filter((session) => session.durationMs).reduce((sum, session) => sum + (session.durationMs ?? 0), 0) /
        Math.max(
          1,
          sessions.filter((session) => session.durationMs).length,
        ) || 0;
    const failedSessions = sessions.filter((session) => session.status === "failed").length;

    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(visibleRunners.length, 1);
    const orbit = visibleRunners.length > 5 ? 34 + (index % 2) * 8 : 30 + (index % 2) * 5;
    const x = 50 + Math.cos(angle) * orbit;
    const y = 50 + Math.sin(angle) * orbit * 0.72;

    return {
      kind: "runner",
      id: runner.id,
      label: runner.name,
      x,
      y,
      radius: clamp(52 + events.length * 2 + runner.activeSessionCount * 6, 54, 94),
      color: palette[index % palette.length],
      runner,
      sessions,
      events,
      agentType,
      latestSummary,
      totalTokenUsage,
      avgDurationMs,
      failedSessions,
    };
  });
}

export function LiveServiceMap({ data }: { data: DashboardSnapshot }) {
  const runnerNodes = buildRunnerNodes(data);
  const defaultSelected = runnerNodes.find((node) => node.runner.isOnline)?.id ?? runnerNodes[0]?.id ?? "control";
  const [selectedNodeId, setSelectedNodeId] = useState(defaultSelected);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);

  const selectedRunner = runnerNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedControl = selectedNodeId === "control" ? controlNode : null;

  const hoveredRunner =
    hoverTarget?.type === "node" || hoverTarget?.type === "edge"
      ? runnerNodes.find((node) => node.id === hoverTarget.nodeId) ?? null
      : null;

  const legendEntries = runnerNodes.map((node) => ({
    id: node.id,
    label: node.label,
    agentType: node.agentType,
    color: node.color.fill,
    isOnline: node.runner.isOnline,
  }));

  return (
    <main className="shell live-shell">
      <section className="hero live-hero">
        <div>
          <p className="eyebrow">Live Control Plane</p>
          <h1>Service-map style visibility for every active coding agent.</h1>
          <p className="hero-copy">
            Inspired by Datadog’s service map interaction model, this view keeps the control node at the center,
            color-codes each active agent, exposes hover metrics on nodes and links, and uses a persistent drawer for
            deeper operator context.
          </p>
        </div>
        <div className="hero-meta panel">
          <p className="eyebrow">Topology Mode</p>
          <p>Runner-to-control connectivity</p>
          <p className="eyebrow top-gap">Hover Model</p>
          <p>Node vitals, connection health, recent session pressure, and last contact time.</p>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Online Runners"
          value={`${data.stats.onlineRunners}/${data.stats.totalRunners}`}
          detail="Live heartbeat view across enrolled machines."
        />
        <MetricCard
          label="Active Sessions"
          value={`${data.stats.activeSessions}`}
          detail="Sessions currently reported as running."
        />
        <MetricCard
          label="24h Sessions"
          value={`${data.stats.sessionsLast24h}`}
          detail="Recent agent work across all runners."
        />
        <MetricCard
          label="24h Events"
          value={`${data.stats.eventsLast24h}`}
          detail={`Failures in window: ${data.stats.failedSessionsLast24h}`}
        />
      </section>

      <section className="map-layout">
        <article className="panel service-map-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Live Dashboard</p>
              <h2>Agent topology</h2>
            </div>
            <button className="drawer-focus-button" onClick={() => setSelectedNodeId("control")} type="button">
              Focus master node
            </button>
          </div>

          <div className="map-stage">
            <svg className="service-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(132,195,232,0.06)" strokeWidth="0.18" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
              <circle className="control-node-halo" cx={controlNode.x} cy={controlNode.y} r="17" />
              <circle className="control-node-halo control-node-halo-secondary" cx={controlNode.x} cy={controlNode.y} r="29" />

              {runnerNodes.map((node) => {
                const midX = (controlNode.x + node.x) / 2;
                const midY = (controlNode.y + node.y) / 2;
                const isHighlighted = hoverTarget?.nodeId === node.id || selectedNodeId === node.id;

                return (
                  <g key={`edge-${node.id}`}>
                    <line
                      className={`edge-link ${isHighlighted ? "is-highlighted" : ""}`}
                      x1={controlNode.x}
                      y1={controlNode.y}
                      x2={node.x}
                      y2={node.y}
                      style={{ strokeWidth: node.runner.isOnline ? 0.65 : 0.34 }}
                    />
                    <line
                      className="edge-hit"
                      x1={controlNode.x}
                      y1={controlNode.y}
                      x2={node.x}
                      y2={node.y}
                      onMouseEnter={() => setHoverTarget({ type: "edge", nodeId: node.id })}
                      onMouseLeave={() => setHoverTarget((current) => (current?.type === "edge" ? null : current))}
                    />
                    <circle className={`edge-bead ${isHighlighted ? "is-highlighted" : ""}`} cx={midX} cy={midY} r="0.95" />
                    <text className="edge-label" x={midX + 1.5} y={midY - 1.5}>
                      {node.events.length}
                    </text>
                  </g>
                );
              })}
            </svg>

            <button
              className={`service-node control-node-button ${selectedNodeId === "control" ? "is-selected" : ""}`}
              style={
                {
                  left: `${controlNode.x}%`,
                  top: `${controlNode.y}%`,
                  "--node-size": `${controlNode.radius}px`,
                  "--node-fill": "#0c2340",
                  "--node-ring": "rgba(74, 194, 255, 0.2)",
                  "--node-shadow": "rgba(74, 194, 255, 0.32)",
                } as CSSProperties
              }
              onClick={() => setSelectedNodeId("control")}
              onMouseEnter={() => setHoverTarget({ type: "node", nodeId: "control" })}
              onMouseLeave={() => setHoverTarget((current) => (current?.nodeId === "control" ? null : current))}
              type="button"
            >
              <span className="service-node-orb">
                <span className="service-node-core service-node-core-control">AH</span>
              </span>
              <span className="service-node-label">{controlNode.label}</span>
              <span className="service-node-meta">HTTPS ingest + stats</span>
            </button>

            {runnerNodes.map((node) => (
              <button
                className={`service-node ${selectedNodeId === node.id ? "is-selected" : ""} ${node.runner.isOnline ? "is-online" : "is-offline"}`}
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                onMouseEnter={() => setHoverTarget({ type: "node", nodeId: node.id })}
                onMouseLeave={() =>
                  setHoverTarget((current) => (current?.type === "node" && current.nodeId === node.id ? null : current))
                }
                style={
                  {
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    "--node-size": `${node.radius}px`,
                    "--node-fill": node.color.fill,
                    "--node-ring": node.color.ring,
                    "--node-shadow": node.color.shadow,
                  } as CSSProperties
                }
                type="button"
              >
                {node.runner.isOnline ? <span className="service-node-pulse" /> : null}
                <span className="service-node-orb">
                  <span className="service-node-core">{node.agentType.slice(0, 2).toUpperCase()}</span>
                  <span className="service-node-status-dot" />
                  <span className="service-node-count">{node.events.length}</span>
                </span>
                <span className="service-node-label">{node.label}</span>
                <span className="service-node-meta">{node.agentType}</span>
              </button>
            ))}

            {hoverTarget?.nodeId === "control" ? (
              <div className="hover-card" style={{ left: "calc(50% + 96px)", top: "calc(50% - 96px)" }}>
                <p className="eyebrow">Master Node</p>
                <strong>AgentHarbor Control Node</strong>
                <p className="hover-copy">Central ingest, auth, session rollup, and dashboard read APIs.</p>
                <div className="hover-metrics">
                  <span>{data.stats.onlineRunners} online runners</span>
                  <span>{data.stats.eventsLast24h} events / 24h</span>
                  <span>{data.stats.sessionsLast24h} sessions / 24h</span>
                </div>
              </div>
            ) : null}

            {hoveredRunner ? (
              <div
                className="hover-card"
                style={{
                  left: `calc(${clamp(hoveredRunner.x, 18, 78)}% + 24px)`,
                  top: `calc(${clamp(hoveredRunner.y, 18, 78)}% - 34px)`,
                }}
              >
                <p className="eyebrow">{hoverTarget?.type === "edge" ? "Connection" : "Agent Node"}</p>
                <strong>{hoverTarget?.type === "edge" ? `${hoveredRunner.label} ↔ Master Node` : hoveredRunner.label}</strong>
                <p className="hover-copy">{hoveredRunner.latestSummary}</p>
                <div className="hover-metrics">
                  <span>{hoveredRunner.agentType}</span>
                  <span>{hoveredRunner.events.length} recent events</span>
                  <span>{hoveredRunner.runner.activeSessionCount} active sessions</span>
                  <span>{formatRelative(hoveredRunner.runner.lastSeenAt)}</span>
                </div>
              </div>
            ) : null}

            <div className="legend-panel">
              <p className="eyebrow">Legend</p>
              <div className="legend-list">
                {legendEntries.map((entry) => (
                  <button className="legend-item" key={entry.id} onClick={() => setSelectedNodeId(entry.id)} type="button">
                    <span className="legend-swatch" style={{ background: entry.color }} />
                    <span>
                      <strong>{entry.label}</strong>
                      <span className="row-meta">
                        {entry.agentType} / {entry.isOnline ? "online" : "offline"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>

        <aside className="panel drawer-panel">
          {selectedControl ? (
            <>
              <div className="drawer-header">
                <div className="drawer-color-chip drawer-color-chip-control">AH</div>
                <div>
                  <p className="eyebrow">Master Node</p>
                  <h2>AgentHarbor control plane</h2>
                  <p className="muted">Fleet-wide health, ingest posture, and active topology summary.</p>
                </div>
              </div>

              <div className="drawer-vitals">
                <div className="vital-card">
                  <span className="row-meta">Transport</span>
                  <strong>HTTPS JSON</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">Auth</span>
                  <strong>Bearer tokens + SHA-256 hash</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">Online Fleet</span>
                  <strong>{data.stats.onlineRunners}</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">24h Failures</span>
                  <strong>{data.stats.failedSessionsLast24h}</strong>
                </div>
              </div>

              <div className="drawer-stack">
                <section className="mini-chart-card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Telemetry Pressure</p>
                      <h3>Recent event volume</h3>
                    </div>
                  </div>
                  <SparkBars values={data.events.slice(0, 8).reverse().map((event) => event.payload.tokenUsage ?? 1)} color="#4ac2ff" />
                </section>

                <section>
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Top Nodes</p>
                      <h3>Most active agents</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {runnerNodes.map((node) => (
                      <button className="mini-list-item" key={node.id} onClick={() => setSelectedNodeId(node.id)} type="button">
                        <span className="legend-swatch" style={{ background: node.color.fill }} />
                        <div>
                          <strong>{node.label}</strong>
                          <p>{node.events.length} events / {node.sessions.length} sessions</p>
                        </div>
                        <StatusPill status={node.runner.isOnline ? "online" : "offline"} />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : selectedRunner ? (
            <>
              <div className="drawer-header">
                <div className="drawer-color-chip" style={{ background: selectedRunner.color.fill }}>
                  {selectedRunner.agentType.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="eyebrow">Agent Node</p>
                  <h2>{selectedRunner.label}</h2>
                  <p className="muted">
                    {selectedRunner.agentType} on {selectedRunner.runner.hostname}
                  </p>
                </div>
                <StatusPill status={selectedRunner.runner.isOnline ? "online" : "offline"} />
              </div>

              <div className="drawer-vitals">
                <div className="vital-card">
                  <span className="row-meta">Last Seen</span>
                  <strong>{formatRelative(selectedRunner.runner.lastSeenAt)}</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">Recent Events</span>
                  <strong>{selectedRunner.events.length}</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">Avg Duration</span>
                  <strong>{formatDuration(selectedRunner.avgDurationMs)}</strong>
                </div>
                <div className="vital-card">
                  <span className="row-meta">Token Usage</span>
                  <strong>{selectedRunner.totalTokenUsage || 0}</strong>
                </div>
              </div>

              <div className="drawer-stack">
                <section className="mini-chart-card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Activity Graph</p>
                      <h3>Token and event pressure</h3>
                    </div>
                  </div>
                  <SparkBars values={extractBars(selectedRunner.sessions, selectedRunner.events)} color={selectedRunner.color.fill} />
                </section>

                <section className="mini-chart-card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Vitals</p>
                      <h3>Connection and runtime</h3>
                    </div>
                  </div>
                  <div className="drawer-vitals compact">
                    <div className="vital-card">
                      <span className="row-meta">OS</span>
                      <strong>{selectedRunner.runner.os}</strong>
                    </div>
                    <div className="vital-card">
                      <span className="row-meta">Arch</span>
                      <strong>{selectedRunner.runner.architecture}</strong>
                    </div>
                    <div className="vital-card">
                      <span className="row-meta">Active Sessions</span>
                      <strong>{selectedRunner.runner.activeSessionCount}</strong>
                    </div>
                    <div className="vital-card">
                      <span className="row-meta">Failed Sessions</span>
                      <strong>{selectedRunner.failedSessions}</strong>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Recent Sessions</p>
                      <h3>Session drilldown</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {selectedRunner.sessions.length > 0 ? (
                      selectedRunner.sessions.slice(0, 4).map((session) => (
                        <Link className="mini-list-item mini-list-link" href={`/session/${session.id}`} key={session.id}>
                          <div>
                            <strong>{session.summary ?? session.sessionKey}</strong>
                            <p>
                              {session.eventCount} events / {formatDuration(session.durationMs)}
                            </p>
                          </div>
                          <StatusPill status={session.status} />
                        </Link>
                      ))
                    ) : (
                      <div className="mini-empty">No recent sessions were returned for this runner.</div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Recent Telemetry</p>
                      <h3>Structured events</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {selectedRunner.events.slice(0, 5).map((event) => (
                      <div className="mini-list-item" key={event.id}>
                        <div>
                          <strong>{event.eventType}</strong>
                          <p>{event.payload.summary ?? "Structured event with no summary text."}</p>
                        </div>
                        <span className="row-meta">{new Date(event.createdAt).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="mini-empty">Enroll a runner to populate the live service map.</div>
          )}
        </aside>
      </section>
    </main>
  );
}
