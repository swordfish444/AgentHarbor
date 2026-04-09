"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventListItem, RunnerListItem, SessionListItem } from "@agentharbor/shared";
import type { DashboardData } from "../lib/control-node";
import {
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatRelativeTime,
  formatTokenUsage,
  humanizeAgentType,
  humanizeCategory,
  humanizeEventType,
} from "../lib/formatters";
import { StatusPill } from "./status-pill";

type RunnerTone = "critical" | "running" | "offline" | "healthy";

interface RunnerOverviewRow {
  runner: RunnerListItem;
  agentType: string;
  tone: RunnerTone;
  latestSession: SessionListItem | null;
  latestEvent: EventListItem | null;
  recentEvents: EventListItem[];
  summary: string;
  focusLabel: string;
  focusMeta: string;
  lastSignalAt: string | null;
}

const compactSummary = (summary: string | null | undefined, fallback: string, maxLength = 108) => {
  const value = summary?.trim() || fallback;

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

const compareByCreatedAt = (left: string | null | undefined, right: string | null | undefined) =>
  new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();

const isNotableEvent = (event: EventListItem) =>
  event.eventType !== "runner.heartbeat" && Boolean(event.payload.summary?.trim());

const inferRunnerAgentType = (
  runner: RunnerListItem,
  latestSession: SessionListItem | null,
  latestEvent: EventListItem | null,
) => {
  if (latestSession?.agentType) {
    return latestSession.agentType;
  }

  if (latestEvent?.payload.agentType) {
    return latestEvent.payload.agentType;
  }

  const labelMatch = runner.labels.find((label) =>
    ["codex", "claude-code", "cursor", "automation", "custom"].includes(label),
  );

  return labelMatch ?? "custom";
};

const deriveRunnerTone = ({
  runner,
  latestSession,
  latestEvent,
}: {
  runner: RunnerListItem;
  latestSession: SessionListItem | null;
  latestEvent: EventListItem | null;
}): RunnerTone => {
  if (
    latestSession?.status === "failed" ||
    latestEvent?.eventType === "agent.session.failed" ||
    latestEvent?.payload.status === "failed"
  ) {
    return "critical";
  }

  if (latestSession?.status === "running" || runner.isOnline) {
    return "running";
  }

  if (runner.status === "offline") {
    return "offline";
  }

  return "healthy";
};

const buildFocusMeta = ({
  tone,
  runner,
  latestSession,
  latestEvent,
}: {
  tone: RunnerTone;
  runner: RunnerListItem;
  latestSession: SessionListItem | null;
  latestEvent: EventListItem | null;
}) => {
  if (tone === "critical") {
    return latestEvent?.payload.category ? `${humanizeCategory(latestEvent.payload.category)} issue` : "Needs drilldown";
  }

  if (latestSession?.status === "running") {
    return "Running now";
  }

  if (runner.isOnline) {
    return "Live heartbeat";
  }

  return "Awaiting heartbeat";
};

const deriveRunnerRows = (data: DashboardData): RunnerOverviewRow[] => {
  const sessionsByRunner = new Map<string, SessionListItem[]>();
  const eventsByRunner = new Map<string, EventListItem[]>();

  for (const session of data.sessions) {
    const existing = sessionsByRunner.get(session.runnerId) ?? [];
    existing.push(session);
    sessionsByRunner.set(session.runnerId, existing);
  }

  for (const event of data.events) {
    const existing = eventsByRunner.get(event.runnerId) ?? [];
    existing.push(event);
    eventsByRunner.set(event.runnerId, existing);
  }

  return [...data.runners]
    .map((runner) => {
      const latestSession =
        (sessionsByRunner.get(runner.id) ?? []).sort((left, right) => compareByCreatedAt(left.startedAt, right.startedAt))[0] ?? null;
      const recentEvents = (eventsByRunner.get(runner.id) ?? []).sort((left, right) =>
        compareByCreatedAt(left.createdAt, right.createdAt),
      );
      const latestEvent = recentEvents[0] ?? null;
      const notableEvents = recentEvents.filter(isNotableEvent);
      const agentType = inferRunnerAgentType(runner, latestSession, latestEvent);
      const tone = deriveRunnerTone({ runner, latestSession, latestEvent });
      const lastSignalAt = latestEvent?.createdAt ?? latestSession?.startedAt ?? runner.lastSeenAt;
      const summary = compactSummary(
        latestSession?.summary ?? latestEvent?.payload.summary,
        tone === "offline" ? "No recent work reported for this runner." : "Waiting for a useful session summary.",
      );
      const focusLabel =
        latestSession?.status === "failed"
          ? "Latest failure"
          : latestSession?.status === "running"
            ? "Current work"
            : latestSession?.status === "completed"
              ? "Last completed"
              : latestEvent
                ? humanizeEventType(latestEvent.eventType)
                : "No recent signal";

      return {
        runner,
        agentType,
        tone,
        latestSession,
        latestEvent,
        recentEvents: notableEvents.slice(0, 4),
        summary,
        focusLabel,
        focusMeta: buildFocusMeta({ tone, runner, latestSession, latestEvent }),
        lastSignalAt,
      };
    })
    .sort((left, right) => {
      const toneOrder = {
        critical: 0,
        running: 1,
        healthy: 2,
        offline: 3,
      } as const;

      const toneDelta = toneOrder[left.tone] - toneOrder[right.tone];

      if (toneDelta !== 0) {
        return toneDelta;
      }

      return compareByCreatedAt(left.lastSignalAt, right.lastSignalAt);
    });
};

const attentionRank = (status: string) => {
  if (status === "failed") {
    return 0;
  }

  if (status === "running") {
    return 1;
  }

  if (status === "completed") {
    return 2;
  }

  return 3;
};

export function OperatorConsole({ data }: { data: DashboardData }) {
  const runnerRows = useMemo(() => deriveRunnerRows(data), [data]);
  const attentionSessions = useMemo(
    () => {
      const rankedSessions = [...data.sessions].sort((left, right) => {
        const statusDelta = attentionRank(left.status) - attentionRank(right.status);

        if (statusDelta !== 0) {
          return statusDelta;
        }

        return compareByCreatedAt(left.startedAt, right.startedAt);
      });
      const actionableSessions = rankedSessions.filter((session) => session.status === "failed" || session.status === "running");

      return (actionableSessions.length > 0 ? actionableSessions : rankedSessions).slice(0, 6);
    },
    [data.sessions],
  );
  const compactEvents = useMemo(() => data.events.filter(isNotableEvent).slice(0, 6), [data.events]);

  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(runnerRows[0]?.runner.id ?? null);

  useEffect(() => {
    if (!runnerRows.some((row) => row.runner.id === selectedRunnerId)) {
      setSelectedRunnerId(runnerRows[0]?.runner.id ?? null);
    }
  }, [runnerRows, selectedRunnerId]);

  const selectedRunner = runnerRows.find((row) => row.runner.id === selectedRunnerId) ?? runnerRows[0] ?? null;
  const highlightedAgentMix = data.analytics.agentTypes.items[0] ?? null;
  const highlightedFailure = data.analytics.failures.items[0] ?? null;
  const highlightedActivity = data.analytics.runnerActivity.items[0] ?? null;

  return (
    <section className="console-grid">
      <article className="panel fleet-console-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Agent fleet</p>
            <h2>Monitor every connected coding agent</h2>
          </div>
          <span className="subtle-badge">{runnerRows.length} visible</span>
        </div>

        <div className="fleet-table-wrap">
          {runnerRows.length === 0 ? (
            <div className="empty-state">
              <strong>No agents are visible in the current view.</strong>
              <p>Adjust the dashboard filters or seed fresh demo traffic to repopulate the overview.</p>
            </div>
          ) : (
            <table className="fleet-console-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Current focus</th>
                  <th>Status</th>
                  <th>Last signal</th>
                </tr>
              </thead>
              <tbody>
                {runnerRows.map((row) => (
                  <tr
                    className={`fleet-console-row ${selectedRunner?.runner.id === row.runner.id ? "is-selected" : ""}`}
                    data-tone={row.tone}
                    key={row.runner.id}
                    onClick={() => setSelectedRunnerId(row.runner.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedRunnerId(row.runner.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <div className="fleet-agent-cell">
                        <strong>{row.runner.name}</strong>
                        <div className="fleet-agent-meta">
                          <span className="tag">{humanizeAgentType(row.agentType)}</span>
                          {row.runner.environment ? <span className="tag tag-environment">{row.runner.environment}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="fleet-focus-cell">
                        <span className="row-meta">{row.focusLabel}</span>
                        <strong>{row.summary}</strong>
                        <span className="row-meta">{row.focusMeta}</span>
                      </div>
                    </td>
                    <td>
                      <div className="fleet-status-cell">
                        <StatusPill status={row.latestSession?.status ?? row.runner.status} />
                        <span className="row-meta">
                          {formatInteger(row.latestSession?.eventCount)} events · {formatDurationMs(row.latestSession?.durationMs, "Live")}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="fleet-signal-cell">
                        <strong>{formatRelativeTime(row.lastSignalAt)}</strong>
                        <span className="row-meta">{formatDateTime(row.lastSignalAt)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </article>

      <div className="console-sidebar">
        <article className="panel spotlight-panel">
          {selectedRunner ? (
            <>
              <div className="section-header spotlight-header">
                <div>
                  <p className="eyebrow">Spotlight</p>
                  <h2>{selectedRunner.runner.name}</h2>
                </div>
                <StatusPill status={selectedRunner.latestSession?.status ?? selectedRunner.runner.status} />
              </div>

              <p className="spotlight-summary">{selectedRunner.summary}</p>

              <div className="spotlight-stat-grid">
                <article className="summary-card">
                  <p className="eyebrow">Agent type</p>
                  <strong>{humanizeAgentType(selectedRunner.agentType)}</strong>
                  <span className="row-meta">{selectedRunner.runner.hostname}</span>
                </article>
                <article className="summary-card">
                  <p className="eyebrow">Last session</p>
                  <strong>{selectedRunner.latestSession ? formatDurationMs(selectedRunner.latestSession.durationMs) : "No session yet"}</strong>
                  <span className="row-meta">{formatDateTime(selectedRunner.latestSession?.startedAt ?? null)}</span>
                </article>
                <article className="summary-card">
                  <p className="eyebrow">Files touched</p>
                  <strong>{formatInteger(selectedRunner.latestSession?.filesTouchedCount)}</strong>
                  <span className="row-meta">{formatInteger(selectedRunner.latestSession?.eventCount)} signals in session</span>
                </article>
                <article className="summary-card">
                  <p className="eyebrow">Token usage</p>
                  <strong>{selectedRunner.latestSession?.tokenUsage ? formatInteger(selectedRunner.latestSession.tokenUsage) : "0"}</strong>
                  <span className="row-meta">{formatTokenUsage(selectedRunner.latestSession?.tokenUsage)}</span>
                </article>
              </div>

              {selectedRunner.latestSession ? (
                <div className="spotlight-detail-card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Latest session</p>
                      <strong>{selectedRunner.latestSession.sessionKey}</strong>
                    </div>
                    <Link className="route-link-button button-secondary" href={`/session/${selectedRunner.latestSession.id}`}>
                      Open drilldown
                    </Link>
                  </div>
                  <div className="tag-list">
                    <span className="tag">{humanizeAgentType(selectedRunner.latestSession.agentType)}</span>
                    <span className="tag">{formatInteger(selectedRunner.latestSession.eventCount)} events</span>
                    <span className="tag">{formatDurationMs(selectedRunner.latestSession.durationMs)}</span>
                  </div>
                </div>
              ) : null}

              <div className="spotlight-detail-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Recent signals</p>
                    <strong>What this agent reported most recently</strong>
                  </div>
                  <span className="subtle-badge">{selectedRunner.recentEvents.length} events</span>
                </div>
                <div className="compact-list">
                  {selectedRunner.recentEvents.length > 0 ? (
                    selectedRunner.recentEvents.map((event) =>
                      event.sessionId ? (
                        <Link className="compact-list-card" href={`/session/${event.sessionId}`} key={event.id}>
                          <div className="compact-list-header">
                            <strong>{humanizeEventType(event.eventType)}</strong>
                            <span className="row-meta">{formatRelativeTime(event.createdAt)}</span>
                          </div>
                          <p>{compactSummary(event.payload.summary, "Structured signal without a summary.")}</p>
                          <div className="tag-list">
                            <span className="tag">{humanizeCategory(event.payload.category)}</span>
                            <span className="tag">{event.payload.status ?? "reported"}</span>
                          </div>
                        </Link>
                      ) : (
                        <article className="compact-list-card" key={event.id}>
                          <div className="compact-list-header">
                            <strong>{humanizeEventType(event.eventType)}</strong>
                            <span className="row-meta">{formatRelativeTime(event.createdAt)}</span>
                          </div>
                          <p>{compactSummary(event.payload.summary, "Structured signal without a summary.")}</p>
                          <div className="tag-list">
                            <span className="tag">{humanizeCategory(event.payload.category)}</span>
                            <span className="tag">{event.payload.status ?? "reported"}</span>
                          </div>
                        </article>
                      ),
                    )
                  ) : (
                    <div className="empty-state compact-empty-state">
                      <strong>No recent signals for this agent.</strong>
                      <p>New telemetry from the selected runner will appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>No runner selected.</strong>
              <p>Select a row in the fleet table to inspect its latest session and telemetry signals.</p>
            </div>
          )}
        </article>

        <div className="sidebar-lower-grid">
          <article className="panel compact-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Watch now</p>
                <h2>Needs attention</h2>
              </div>
              <span className="subtle-badge">{attentionSessions.length} sessions</span>
            </div>
            <div className="compact-list">
              {attentionSessions.map((session) => (
                <Link className={`compact-list-card ${session.status === "failed" ? "compact-list-card-critical" : ""}`} href={`/session/${session.id}`} key={session.id}>
                  <div className="compact-list-header">
                    <strong>{session.runnerName}</strong>
                    <StatusPill status={session.status} />
                  </div>
                  <p>{compactSummary(session.summary, "No summary reported for this session.")}</p>
                  <div className="tag-list">
                    <span className="tag">{humanizeAgentType(session.agentType)}</span>
                    <span className="tag">{formatInteger(session.filesTouchedCount)} files</span>
                    <span className="tag">{formatTokenUsage(session.tokenUsage)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="panel compact-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Fleet pulse</p>
                <h2>Purposeful demo signals</h2>
              </div>
            </div>
            <div className="pulse-grid">
              <article className="pulse-card">
                <p className="eyebrow">Most active agent</p>
                <strong>{highlightedAgentMix ? humanizeAgentType(highlightedAgentMix.label) : "Awaiting traffic"}</strong>
                <span className="row-meta">
                  {highlightedAgentMix ? `${formatInteger(highlightedAgentMix.count)} sessions in the current window.` : "Send demo activity to populate this callout."}
                </span>
              </article>
              <article className="pulse-card">
                <p className="eyebrow">Primary failure mode</p>
                <strong>{highlightedFailure ? humanizeCategory(highlightedFailure.label) : "No failures in view"}</strong>
                <span className="row-meta">
                  {highlightedFailure ? `${formatInteger(highlightedFailure.count)} sessions are clustering here.` : "Healthy fleets keep this panel quiet."}
                </span>
              </article>
              <article className="pulse-card">
                <p className="eyebrow">Busiest runner</p>
                <strong>{highlightedActivity?.runnerName ?? "Awaiting traffic"}</strong>
                <span className="row-meta">
                  {highlightedActivity ? `${formatInteger(highlightedActivity.sessionCount)} sessions in the active slice.` : "This highlights the loudest runner on the screen."}
                </span>
              </article>
            </div>
          </article>

          <article className="panel compact-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Signal feed</p>
                <h2>Latest notable telemetry</h2>
              </div>
              <span className="subtle-badge">{compactEvents.length} items</span>
            </div>
            <div className="compact-list">
              {compactEvents.length > 0 ? (
                compactEvents.map((event) =>
                  event.sessionId ? (
                    <Link className="compact-list-card" href={`/session/${event.sessionId}`} key={event.id}>
                      <div className="compact-list-header">
                        <strong>{event.runnerName}</strong>
                        <span className="row-meta">{formatRelativeTime(event.createdAt)}</span>
                      </div>
                      <p>{compactSummary(event.payload.summary, "Structured event with no summary text.")}</p>
                      <div className="tag-list">
                        <span className="tag">{humanizeEventType(event.eventType)}</span>
                        <span className="tag">{humanizeCategory(event.payload.category)}</span>
                      </div>
                    </Link>
                  ) : (
                    <article className="compact-list-card" key={event.id}>
                      <div className="compact-list-header">
                        <strong>{event.runnerName}</strong>
                        <span className="row-meta">{formatRelativeTime(event.createdAt)}</span>
                      </div>
                      <p>{compactSummary(event.payload.summary, "Structured event with no summary text.")}</p>
                      <div className="tag-list">
                        <span className="tag">{humanizeEventType(event.eventType)}</span>
                        <span className="tag">{humanizeCategory(event.payload.category)}</span>
                      </div>
                    </article>
                  ),
                )
              ) : (
                <div className="empty-state compact-empty-state">
                  <strong>No notable telemetry yet.</strong>
                  <p>Heartbeat noise is intentionally hidden here so only meaningful session signals surface.</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
