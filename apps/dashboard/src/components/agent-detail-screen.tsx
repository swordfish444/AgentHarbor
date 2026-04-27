"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventListItem, RunnerListItem, SessionListItem } from "@agentharbor/shared";
import type { DashboardData } from "../lib/control-node";
import { pinDemoAgentDetailData } from "../lib/demo-agent-detail";
import {
  buildDemoPlaybackDashboardData,
  buildDemoSearch,
  demoPrimaryIncidentRunnerId,
  demoPrimaryIncidentSessionId,
  getDemoPlaybackSecurityIncident,
} from "../lib/demo-mode";
import {
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatRelativeTime,
  formatTime,
  formatTokenUsage,
  humanizeCategory,
  humanizeEventType,
} from "../lib/formatters";
import { getRunnerColor } from "../lib/runner-colors";
import { SimpleBarChart } from "./simple-bar-chart";
import { StatusPill } from "./status-pill";

const countByLabel = (labels: string[]) => {
  const counts = new Map<string, number>();

  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => {
      if (left.value !== right.value) {
        return right.value - left.value;
      }

      return left.label.localeCompare(right.label);
    });
};

const sessionSort = (left: SessionListItem, right: SessionListItem) =>
  new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();

const eventSort = (left: EventListItem, right: EventListItem) =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

const deriveRunnerStatus = (runner: RunnerListItem | null, latestSession: SessionListItem | null, hasSecurityIncident: boolean) => {
  if (hasSecurityIncident) {
    return "warning";
  }

  if (!runner?.isOnline) {
    return "offline";
  }

  if (latestSession?.status === "running") {
    return "running";
  }

  return runner?.status ?? "online";
};

export function AgentDetailScreen({
  agentId,
  initialData,
  renderedAt,
  initialDemoEnabled = false,
  initialDemoStart = null,
  initialDemoAnchor = null,
  initialDemoResolved = null,
  initialDemoSpeed = null,
  initialDemoPaused = false,
}: {
  agentId: string;
  initialData: DashboardData;
  renderedAt: string;
  initialDemoEnabled?: boolean;
  initialDemoStart?: number | null;
  initialDemoAnchor?: number | null;
  initialDemoResolved?: string | null;
  initialDemoSpeed?: number | null;
  initialDemoPaused?: boolean;
}) {
  const [demoNow, setDemoNow] = useState(() => new Date(renderedAt).getTime());
  const demoAnchorMs = useMemo(() => initialDemoAnchor ?? new Date(renderedAt).getTime(), [initialDemoAnchor, renderedAt]);
  const isDemoMode = initialDemoEnabled && initialDemoStart != null;
  const effectivePlaybackSpeed = initialDemoPaused ? 0 : initialDemoSpeed ?? undefined;

  useEffect(() => {
    if (!isDemoMode || initialDemoStart == null) {
      return;
    }

    setDemoNow(Date.now());

    const timer = setInterval(() => {
      setDemoNow(Date.now());
    }, 2_000);

    return () => clearInterval(timer);
  }, [initialDemoStart, initialDemoAnchor, initialDemoSpeed, initialDemoPaused, isDemoMode]);

  const playbackData = useMemo(
    () => (isDemoMode && initialDemoStart ? buildDemoPlaybackDashboardData(demoNow, initialDemoStart, demoAnchorMs, effectivePlaybackSpeed) : initialData),
    [demoAnchorMs, demoNow, initialData, effectivePlaybackSpeed, initialDemoStart, isDemoMode],
  );
  const data = useMemo(
    () => (isDemoMode ? pinDemoAgentDetailData(playbackData, initialData, agentId) : playbackData),
    [agentId, initialData, isDemoMode, playbackData],
  );
  const runner = data.runners.find((candidate) => candidate.id === agentId) ?? null;
  const sessions = data.sessions.filter((session) => session.runnerId === agentId).sort(sessionSort);
  const latestSession = sessions[0] ?? null;
  const events = data.events.filter((event) => event.runnerId === agentId).sort(eventSort);
  const securityIncident =
    isDemoMode && initialDemoStart ? getDemoPlaybackSecurityIncident(agentId, demoNow, initialDemoStart, demoAnchorMs, effectivePlaybackSpeed) : null;
  const isPrimaryIncidentResolved =
    isDemoMode && agentId === demoPrimaryIncidentRunnerId && initialDemoResolved === demoPrimaryIncidentSessionId;
  const status = deriveRunnerStatus(runner, latestSession, Boolean(securityIncident));
  const color = getRunnerColor(agentId);
  const totalTokens = sessions.reduce((sum, session) => sum + (session.tokenUsage ?? 0), 0);
  const completedCount = sessions.filter((session) => session.status === "completed").length;
  const failedCount = sessions.filter((session) => session.status === "failed" && !(isPrimaryIncidentResolved && session.id === demoPrimaryIncidentSessionId)).length;
  const runningCount = sessions.filter((session) => session.status === "running").length;
  const activityPoints = countByLabel(events.map((event) => humanizeCategory(event.payload.category))).slice(0, 5);
  const outcomePoints = [
    { label: "Completed", value: completedCount },
    { label: "Running", value: runningCount },
    { label: "Failed", value: failedCount },
    ...(securityIncident ? [{ label: "Security", value: 1 }] : []),
  ].filter((point) => point.value > 0);
  const liveAlert = !securityIncident && !isPrimaryIncidentResolved ? data.alerts[0] ?? null : null;
  const runnerName = runner?.name ?? latestSession?.runnerName ?? agentId;
  const agentType = latestSession?.agentType ?? (events[0]?.payload.agentType ?? "custom");
  const demoSearch = buildDemoSearch(
    isDemoMode && initialDemoStart != null
      ? {
          demoStart: initialDemoStart,
          demoAnchor: demoAnchorMs,
          demoResolved: initialDemoResolved,
          demoSpeed: initialDemoSpeed ?? undefined,
          demoPaused: initialDemoPaused || undefined,
        }
      : null,
  );
  const backHref = isDemoMode && initialDemoStart != null ? `/wallboard${demoSearch}` : "/wallboard";
  const fullDashboardHref = isDemoMode && initialDemoStart != null ? `/${demoSearch}` : "/";
  const latestSessionHref = latestSession ? `/session/${latestSession.id}${demoSearch}` : null;

  return (
    <div className="agent-detail-stack">
      <section className="detail-hero agent-detail-hero" data-status={status}>
        <div className="agent-detail-hero-copy">
          <Link className="tag agent-detail-back-link" href={backHref}>
            Back to Fleet View
          </Link>
          <div className="agent-detail-title-row">
            <span
              aria-hidden="true"
              className="agent-detail-dot"
              style={{ backgroundColor: color.solid, boxShadow: `0 0 0 10px ${color.soft}` }}
            />
            <div>
              <p className="eyebrow">Agent Detail</p>
              <h1>{runnerName}</h1>
            </div>
          </div>
          <p className="hero-copy">
            {securityIncident
              ? "This agent is holding a suspicious dependency path for review. The detail view calls out the risk, recent work, and what the operator should inspect next."
              : latestSession?.summary ?? "This agent is connected to the fleet and ready for drill-in review."}
          </p>
          <div className="hero-filter-list">
            <span className="tag">{agentType}</span>
            <span className="tag">Status: {status}</span>
            <span className="tag">
              {runner?.lastSeenAt ? `Last seen ${formatRelativeTime(runner.lastSeenAt, isDemoMode ? demoNow : Date.now())}` : "Waiting for telemetry"}
            </span>
            <Link className="tag" href={fullDashboardHref}>
              Open the full dashboard
            </Link>
          </div>
        </div>
        <div className="hero-meta panel">
          <div className="hero-meta-block">
            <p className="eyebrow">Current State</p>
            <StatusPill status={status} />
            <p>{runner?.hostname ?? "No hostname reported"}</p>
            <p>{runner?.environment ? `env:${runner.environment}` : "Environment not tagged"}</p>
          </div>
          <div className="hero-meta-block">
            <p className="eyebrow">Latest Session</p>
            {latestSessionHref ? (
              <p>
                <Link className="agent-detail-link" href={latestSessionHref}>
                  {latestSession.sessionKey}
                </Link>
              </p>
            ) : (
              <p>No session yet</p>
            )}
            <p>{latestSession ? formatDurationMs(latestSession.durationMs) : "No duration yet"}</p>
            <p>{latestSession?.startedAt ? `Started ${formatDateTime(latestSession.startedAt)}` : "Awaiting first session"}</p>
          </div>
        </div>
      </section>

      <section className="summary-grid">
        <div className="summary-card">
          <span className="row-meta">Tasks completed</span>
          <strong>{formatInteger(completedCount)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Failures</span>
          <strong>{formatInteger(failedCount)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Total tokens</span>
          <strong>{formatInteger(totalTokens)}</strong>
        </div>
        <div className="summary-card">
          <span className="row-meta">Live events</span>
          <strong>{formatInteger(events.length)}</strong>
        </div>
      </section>

      {securityIncident ? (
        <article className="panel agent-alert-card agent-alert-card-warning">
          <div className="section-header">
            <div>
              <p className="eyebrow">Security Review</p>
              <h2>{securityIncident.title}</h2>
            </div>
            <StatusPill status={securityIncident.severity} />
          </div>
          <p className="outcome-copy">{securityIncident.detail}</p>
          <div className="agent-alert-grid">
            <div className="insight-card">
              <strong>Evidence</strong>
              <ul className="agent-alert-list">
                {securityIncident.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="insight-card">
              <strong>Operator actions</strong>
              <ul className="agent-alert-list">
                {securityIncident.recommendedActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ) : liveAlert ? (
        <article className={`panel agent-alert-card agent-alert-card-${liveAlert.severity}`}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Alert</p>
              <h2>{liveAlert.title}</h2>
            </div>
            <StatusPill status={liveAlert.severity} />
          </div>
          <p className="outcome-copy">{liveAlert.detail}</p>
        </article>
      ) : null}

      <section className="detail-layout">
        <div className="detail-sidebar-stack">
          <article className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Agent Metrics</p>
                <h2>Task outcomes</h2>
              </div>
            </div>
            {outcomePoints.length > 0 ? (
              <SimpleBarChart points={outcomePoints} />
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No task outcomes yet.</strong>
                <p>This agent has not emitted enough data to chart.</p>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Telemetry Mix</p>
                <h2>Where it spent time</h2>
              </div>
            </div>
            {activityPoints.length > 0 ? (
              <SimpleBarChart points={activityPoints} />
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No telemetry categories yet.</strong>
                <p>The chart will populate as soon as events land for this runner.</p>
              </div>
            )}
          </article>
        </div>

        <div className="detail-sidebar-stack">
          <article className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Recent Tasks</p>
                <h2>Latest sessions</h2>
              </div>
              <span className="subtle-badge">{sessions.length} total</span>
            </div>
            {sessions.length > 0 ? (
              <div className="stack-list">
                {sessions.slice(0, 5).map((session) => (
                  <Link
                    className={`list-card session-card ${session.status === "failed" ? "list-card-critical" : ""}`}
                    key={session.id}
                    href={`/session/${session.id}${demoSearch}`}
                  >
                    <div>
                      <div className="list-title-row">
                        <strong>{session.sessionKey}</strong>
                        <StatusPill status={session.status} />
                      </div>
                      <p>{session.summary ?? "No summary reported for this session yet."}</p>
                    </div>
                    <div className="list-meta">
                      <span>{formatDurationMs(session.durationMs)}</span>
                      <span>{formatInteger(session.filesTouchedCount)} files</span>
                      <span>{formatTokenUsage(session.tokenUsage)}</span>
                    </div>
                    <div className="list-footer">
                      <span>Started {formatDateTime(session.startedAt)}</span>
                      <span className="agent-detail-link">Open session</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No sessions available.</strong>
                <p>Once this runner starts working, recent tasks will land here.</p>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Recent Activity</p>
                <h2>Latest telemetry</h2>
              </div>
              <span className="subtle-badge">{events.length} events</span>
            </div>
            {events.length > 0 ? (
              <div className="event-feed event-feed-raw">
                {events.slice(0, 6).map((event) => (
                  <div className="event-card" key={event.id}>
                    <div className="list-title-row">
                      <strong>{humanizeEventType(event.eventType)}</strong>
                      <span className="row-meta">{formatTime(event.createdAt)}</span>
                    </div>
                    <p>{event.payload.summary ?? "Structured event with no summary text."}</p>
                    <div className="list-meta">
                      <span>{humanizeCategory(event.payload.category)}</span>
                      {event.payload.status ? <span>{event.payload.status}</span> : null}
                      {event.sessionKey ? <span>{event.sessionKey}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty-state">
                <strong>No telemetry yet.</strong>
                <p>Recent agent chatter and state changes will show up here.</p>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
