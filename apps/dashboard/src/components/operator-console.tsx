"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventListItem, RunnerListItem, SessionListItem, StreamEvent } from "@agentharbor/shared";
import type { DashboardData } from "../lib/control-node";
import {
  buildDemoPlaybackDashboardData,
  buildDemoSearch,
  createDemoStartValue,
  demoPrimaryIncidentRunnerId,
  demoPrimaryIncidentSessionId,
} from "../lib/demo-mode";
import { formatInteger, formatRelativeTime, formatTime } from "../lib/formatters";
import { getRunnerColor } from "../lib/runner-colors";

const rowsPerPage = 5;
const chatPreviewCharacterThreshold = 140;
const realtimeEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;

type StreamState = "connecting" | "live" | "reconnecting";

interface AgentRow {
  runnerId: string;
  name: string;
  accent: string;
  accentSoft: string;
  startedAt: string | null;
  tasksCompleted: number;
  errors: number;
  errorSessionId: string | null;
  totalTokens: number;
  isRunning: boolean;
  lastSignalAt: string | null;
}

interface ChatEntry {
  id: string;
  runnerId: string;
  runnerName: string;
  accent: string;
  accentSoft: string;
  createdAt: string;
  message: string;
}

const compareByTimestamp = (left: string | null | undefined, right: string | null | undefined) =>
  new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();

const isConnectedRunner = (runner: RunnerListItem) => runner.isOnline || runner.activeSessionCount > 0 || runner.status === "online";

const isChatworthyEvent = (event: EventListItem) =>
  event.eventType !== "runner.heartbeat" && Boolean(event.payload.summary?.trim());

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
};

const buildAgentRows = (data: DashboardData, isDemoMode = false): AgentRow[] => {
  const sessionsByRunner = new Map<string, SessionListItem[]>();

  for (const session of data.sessions) {
    const bucket = sessionsByRunner.get(session.runnerId) ?? [];
    bucket.push(session);
    sessionsByRunner.set(session.runnerId, bucket);
  }

  return data.runners
    .filter((runner) => isConnectedRunner(runner) || (isDemoMode && runner.id === demoPrimaryIncidentRunnerId))
    .map((runner) => {
      const runnerSessions = [...(sessionsByRunner.get(runner.id) ?? [])].sort((left, right) =>
        compareByTimestamp(left.startedAt, right.startedAt),
      );
      const latestSession = runnerSessions[0] ?? null;
      const color = getRunnerColor(runner.id);
      const tasksCompleted = runnerSessions.filter((session) => session.status === "completed").length;
      const failedSessions = runnerSessions.filter((session) => session.status === "failed");
      const pinnedDemoIncident = isDemoMode && runner.id === demoPrimaryIncidentRunnerId;
      const errors = pinnedDemoIncident ? Math.max(1, failedSessions.length) : failedSessions.length;
      const errorSessionId = failedSessions[0]?.id ?? (pinnedDemoIncident ? demoPrimaryIncidentSessionId : null);
      const totalTokens = runnerSessions.reduce((sum, session) => sum + (session.tokenUsage ?? 0), 0);
      const startedAt = latestSession?.startedAt ?? runner.lastSeenAt ?? runner.createdAt;
      const isRunning = latestSession?.status === "running" || runner.activeSessionCount > 0;

      return {
        runnerId: runner.id,
        name: runner.name,
        accent: color.solid,
        accentSoft: color.soft,
        startedAt,
        tasksCompleted,
        errors,
        errorSessionId,
        totalTokens,
        isRunning,
        lastSignalAt: runner.lastSeenAt ?? latestSession?.startedAt ?? runner.updatedAt,
      };
    })
    .sort((left, right) => {
      if (left.isRunning !== right.isRunning) {
        return left.isRunning ? -1 : 1;
      }

      return compareByTimestamp(left.lastSignalAt, right.lastSignalAt);
    });
};

const buildChatEntries = (data: DashboardData): ChatEntry[] => {
  const eventEntries = dedupeById(data.events.filter(isChatworthyEvent))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(-32)
    .map((event) => {
      const color = getRunnerColor(event.runnerId);

      return {
        id: event.id,
        runnerId: event.runnerId,
        runnerName: event.runnerName,
        accent: color.solid,
        accentSoft: color.soft,
        createdAt: event.createdAt,
        message: event.payload.summary?.trim() ?? "Reported structured telemetry.",
      };
    });

  if (eventEntries.length > 0) {
    return eventEntries;
  }

  return data.sessions
    .filter((session) => Boolean(session.summary?.trim()))
    .sort((left, right) => compareByTimestamp(left.endedAt ?? left.startedAt, right.endedAt ?? right.startedAt))
    .slice(0, 32)
    .reverse()
    .map((session) => {
      const color = getRunnerColor(session.runnerId);

      return {
        id: `session:${session.id}`,
        runnerId: session.runnerId,
        runnerName: session.runnerName,
        accent: color.solid,
        accentSoft: color.soft,
        createdAt: session.endedAt ?? session.startedAt,
        message: session.summary?.trim() ?? "Updated the current run.",
      };
    });
};

const safeParseStreamEvent = (rawPayload: string) => {
  try {
    return JSON.parse(rawPayload) as StreamEvent & {
      data?: {
        event?: EventListItem;
        session?: SessionListItem;
        runner?: RunnerListItem;
      };
    };
  } catch {
    return null;
  }
};

const optimisticInsertEvent = (data: DashboardData, event: EventListItem): DashboardData => ({
  ...data,
  events: dedupeById([event, ...data.events]).sort((left, right) => compareByTimestamp(left.createdAt, right.createdAt)).slice(0, 120),
});

const optimisticUpsertSession = (data: DashboardData, session: SessionListItem): DashboardData => ({
  ...data,
  sessions: dedupeById([session, ...data.sessions])
    .sort((left, right) => compareByTimestamp(left.startedAt, right.startedAt))
    .slice(0, 160),
});

const optimisticUpsertRunner = (data: DashboardData, runner: RunnerListItem): DashboardData => ({
  ...data,
  runners: dedupeById([runner, ...data.runners]).sort((left, right) => compareByTimestamp(left.lastSeenAt, right.lastSeenAt)).slice(0, 120),
});

export function OperatorConsole({
  initialData,
  renderedAt,
  initialDemoEnabled = false,
  initialDemoStart = null,
  initialDemoAnchor = null,
}: {
  initialData: DashboardData;
  renderedAt: string;
  initialDemoEnabled?: boolean;
  initialDemoStart?: number | null;
  initialDemoAnchor?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);
  const [relativeNow, setRelativeNow] = useState(() => new Date(renderedAt).getTime());
  const [isDemoMode, setIsDemoMode] = useState(initialDemoEnabled);
  const [demoStart, setDemoStart] = useState<number | null>(initialDemoStart);
  const [demoNow, setDemoNow] = useState(() => new Date(renderedAt).getTime());
  const [demoAnchorMs, setDemoAnchorMs] = useState(() => initialDemoAnchor ?? new Date(renderedAt).getTime());
  const [freshRunnerIds, setFreshRunnerIds] = useState<string[]>([]);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const previousRunnerIdsRef = useRef<string[]>([]);

  const effectiveDemoStart = isDemoMode ? (demoStart ?? createDemoStartValue()) : null;

  useEffect(() => {
    if (isDemoMode && demoStart == null) {
      const now = Date.now();
      setDemoAnchorMs(now);
      setDemoStart(createDemoStartValue(now));
    }
  }, [demoStart, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) {
      return;
    }

    setDemoNow(Date.now());
    const timer = setInterval(() => {
      setDemoNow(Date.now());
      setRelativeNow(Date.now());
    }, 2_000);

    return () => clearInterval(timer);
  }, [isDemoMode]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

    const clock = setInterval(() => {
      setRelativeNow(Date.now());
    }, 30_000);

    return () => clearInterval(clock);
  }, [isDemoMode]);

  const displayData = useMemo(
    () => (isDemoMode && effectiveDemoStart ? buildDemoPlaybackDashboardData(demoNow, effectiveDemoStart, demoAnchorMs) : data),
    [data, demoAnchorMs, demoNow, effectiveDemoStart, isDemoMode],
  );

  const agentRows = useMemo(() => buildAgentRows(displayData, isDemoMode), [displayData, isDemoMode]);
  const connectedAgents = agentRows.length;
  const runningAgents = agentRows.filter((row) => row.isRunning).length;
  const idleAgents = Math.max(0, connectedAgents - runningAgents);
  const pageCount = Math.max(1, Math.ceil(agentRows.length / rowsPerPage));
  const visibleRows = agentRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const chatEntries = useMemo(() => buildChatEntries(displayData), [displayData]);
  const displayStreamState = isDemoMode ? "live" : streamState;
  const displayLastSignalAt = isDemoMode ? new Date(demoNow).toISOString() : lastSignalAt;
  const demoSearch = buildDemoSearch(
    isDemoMode && effectiveDemoStart != null
      ? {
          demoStart: effectiveDemoStart,
          demoAnchor: demoAnchorMs,
        }
      : null,
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const previousRunnerIds = previousRunnerIdsRef.current;
    const nextRunnerIds = agentRows.map((row) => row.runnerId);

    if (previousRunnerIds.length > 0) {
      const addedRunnerIds = nextRunnerIds.filter((runnerId) => !previousRunnerIds.includes(runnerId));

      if (addedRunnerIds.length > 0) {
        setFreshRunnerIds((currentIds) => [...new Set([...currentIds, ...addedRunnerIds])]);

        const timeout = setTimeout(() => {
          setFreshRunnerIds((currentIds) => currentIds.filter((runnerId) => !addedRunnerIds.includes(runnerId)));
        }, 1_900);

        previousRunnerIdsRef.current = nextRunnerIds;
        return () => clearTimeout(timeout);
      }
    }

    previousRunnerIdsRef.current = nextRunnerIds;
    return undefined;
  }, [agentRows]);

  const refreshSnapshot = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Dashboard snapshot request failed: ${response.status}`);
      }

      const nextData = (await response.json()) as DashboardData;
      setData(nextData);
      setSnapshotError(null);
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : "Unable to refresh dashboard snapshot.");
    } finally {
      refreshInFlightRef.current = false;

      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refreshSnapshot();
      }
    }
  }, []);

  const scheduleSnapshotRefresh = useCallback(
    (delayMs = 180) => {
      if (refreshTimerRef.current) {
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void refreshSnapshot();
      }, delayMs);
    },
    [refreshSnapshot],
  );

  useEffect(() => {
    if (isDemoMode) {
      setStreamState("live");
      return;
    }

    let closed = false;
    const source = new EventSource("/api/stream/events");

    source.onopen = () => {
      if (!closed) {
        setStreamState("live");
      }
    };

    source.onerror = () => {
      if (!closed) {
        setStreamState("reconnecting");
      }
    };

    for (const eventType of realtimeEventTypes) {
      source.addEventListener(eventType, (event: MessageEvent<string>) => {
        if (closed) {
          return;
        }

        setStreamState("live");
        const streamEvent = safeParseStreamEvent(String(event.data));
        setLastSignalAt(streamEvent?.emittedAt ?? new Date().toISOString());
        const payload = streamEvent?.data;
        const nextEvent = payload?.event;
        const nextSession = payload?.session;
        const nextRunner = payload?.runner;

        if (nextEvent) {
          setData((currentData) => optimisticInsertEvent(currentData, nextEvent));
        }

        if (nextSession) {
          setData((currentData) => optimisticUpsertSession(currentData, nextSession));
        }

        if (nextRunner) {
          setData((currentData) => optimisticUpsertRunner(currentData, nextRunner));
        }

        scheduleSnapshotRefresh();
      });
    }

    const periodicResync = setInterval(() => {
      void refreshSnapshot();
    }, 12_000);

    return () => {
      closed = true;
      clearInterval(periodicResync);
      source.close();

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isDemoMode, refreshSnapshot, scheduleSnapshotRefresh]);

  const scrollChatToLatest = useCallback(() => {
    const viewport = chatViewportRef.current;

    if (!viewport) {
      return;
    }

    autoScrollRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    requestAnimationFrame(() => {
      autoScrollRef.current = false;
      setIsPinnedToLatest(true);
    });
  }, []);

  useEffect(() => {
    if (isPinnedToLatest) {
      scrollChatToLatest();
    }
  }, [chatEntries.length, isPinnedToLatest, scrollChatToLatest]);

  const handleChatScroll = () => {
    if (autoScrollRef.current) {
      return;
    }

    const viewport = chatViewportRef.current;

    if (!viewport) {
      return;
    }

    const threshold = 40;
    const pinned = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold;
    setIsPinnedToLatest(pinned);
  };

  const handleDemoToggle = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setDemoStart(null);
      router.replace(pathname, { scroll: false });
      return;
    }

    const now = Date.now();
    const nextDemoStart = createDemoStartValue(now);
    setIsDemoMode(true);
    setDemoAnchorMs(now);
    setDemoStart(nextDemoStart);
    router.replace(
      `${pathname}${buildDemoSearch({
        demoStart: nextDemoStart,
        demoAnchor: now,
      })}`,
      { scroll: false },
    );
  };

  return (
    <section className="realtime-screen">
      <header className="panel wallboard-header">
        <div className="wallboard-header-brand">
          <img alt="AgentHarbor" className="wallboard-logo" src="/agentharbor-mark.svg" />
          <div>
            <p className="eyebrow">AgentHarbor</p>
            <h1>Fleet View</h1>
          </div>
        </div>

        <div className="wallboard-header-actions">
          <span className={`stream-indicator stream-${displayStreamState}`}>
            <span className="stream-dot" />
            {isDemoMode ? "Demo live" : displayStreamState === "live" ? "Live" : displayStreamState === "connecting" ? "Connecting" : "Reconnecting"}
          </span>
          <span className="monitor-meta-text">
            {displayLastSignalAt ? `Last signal ${formatRelativeTime(displayLastSignalAt, isDemoMode ? demoNow : relativeNow)}` : "Awaiting live signals"}
          </span>
          <button
            aria-label="Demo Mode"
            aria-pressed={isDemoMode}
            className={`demo-toggle ${isDemoMode ? "is-active" : ""}`}
            onClick={handleDemoToggle}
            type="button"
          >
            <span className="demo-toggle-knob" />
            <span className="demo-toggle-tooltip">Demo Mode</span>
          </button>
        </div>
      </header>

      <section className="monitor-metrics">
        <article className="monitor-metric panel">
          <strong>{formatInteger(connectedAgents)}</strong>
          <span>connected</span>
        </article>
        <article className="monitor-metric panel">
          <strong>{formatInteger(runningAgents)}</strong>
          <span>running</span>
        </article>
        <article className="monitor-metric panel">
          <strong>{formatInteger(idleAgents)}</strong>
          <span>idle</span>
        </article>
      </section>

      <section className="panel monitor-panel">
        <div className="monitor-section-header">
          <p className="eyebrow monitor-section-label">Connected agents</p>
          <div className="monitor-header-meta">
            <span className="monitor-meta-text">{isDemoMode ? "Seeded presentation loop" : "Live control-node snapshot"}</span>
          </div>
        </div>

        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Started at</th>
                <th>Tasks completed</th>
                <th>Errors</th>
                <th>Total tokens</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length > 0 ? (
                visibleRows.map((row) => {
                  const agentHref = `/agents/${row.runnerId}${demoSearch}`;

                  return (
                    <tr
                      className={`${row.errors > 0 ? "agent-row-error" : row.isRunning ? "agent-row-running" : "agent-row-idle"} ${
                        freshRunnerIds.includes(row.runnerId) ? "agent-row-fresh" : ""
                      }`}
                      key={row.runnerId}
                    >
                      <td>
                        <div className="agent-name-cell">
                          <span
                            aria-hidden="true"
                            className="agent-dot"
                            style={{ backgroundColor: row.accent, boxShadow: `0 0 0 6px ${row.accentSoft}` }}
                          />
                          <div>
                            <strong>
                              <Link className="agent-detail-link" href={agentHref}>
                                {row.name}
                              </Link>
                            </strong>
                            <span className="agent-state-copy">
                              {row.errors > 0 ? "Error ready to inspect" : row.isRunning ? "Running now" : "Idle"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{formatRelativeTime(row.startedAt, isDemoMode ? demoNow : relativeNow)}</td>
                      <td>{formatInteger(row.tasksCompleted)}</td>
                      <td>
                        {row.errors > 0 && row.errorSessionId ? (
                          <Link className="error-count-link" href={`/session/${row.errorSessionId}${demoSearch}`}>
                            {formatInteger(row.errors)}
                          </Link>
                        ) : (
                          formatInteger(row.errors)
                        )}
                      </td>
                      <td>{formatInteger(row.totalTokens)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="monitor-empty-row" colSpan={5}>
                    No connected agents are visible yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="monitor-pagination">
          <button
            aria-label="Previous page"
            className="pagination-button"
            disabled={page === 0}
            onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
            type="button"
          >
            ←
          </button>
          <span>
            Page {pageCount === 0 ? 0 : page + 1} of {pageCount}
          </span>
          <button
            aria-label="Next page"
            className="pagination-button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))}
            type="button"
          >
            →
          </button>
        </div>
      </section>

      <section className="panel monitor-panel chat-panel">
        <div className="monitor-section-header">
          <p className="eyebrow monitor-section-label">Chat</p>
          <div className="monitor-header-meta">
            <span className="monitor-meta-text">{isPinnedToLatest ? "Pinned to latest" : "Scroll paused"}</span>
            {!isPinnedToLatest ? (
              <button
                className="jump-button"
                onClick={() => {
                  scrollChatToLatest();
                }}
                type="button"
              >
                Jump to latest
              </button>
            ) : null}
          </div>
        </div>

        <div className="chat-scroll-frame" onScroll={handleChatScroll} ref={chatViewportRef}>
          <div className="chat-list">
            {chatEntries.length > 0 ? (
              chatEntries.map((entry) => {
                const isExpanded = Boolean(expandedMessages[entry.id]);
                const shouldClamp = entry.message.length > chatPreviewCharacterThreshold;
                const avatar = entry.runnerName.charAt(0).toUpperCase();

                return (
                  <article className="chat-entry" key={entry.id} style={{ borderLeftColor: entry.accent }}>
                    <span className="chat-entry-avatar" style={{ backgroundColor: entry.accentSoft, color: entry.accent }}>
                      {avatar}
                    </span>
                    <div className="chat-entry-body">
                      <p className={`chat-entry-text ${shouldClamp && !isExpanded ? "is-clamped" : ""}`}>
                        <span className="chat-entry-time">{formatTime(entry.createdAt)}</span>
                        <span className="chat-entry-divider"> {" - "}</span>
                        <span className="chat-entry-author" style={{ color: entry.accent }}>
                          {entry.runnerName}
                        </span>
                        <span className="chat-entry-divider">{": "}</span>
                        <span className="chat-entry-content">{entry.message}</span>
                      </p>
                      {shouldClamp ? (
                        <button
                          className="chat-expand-button"
                          onClick={() =>
                            setExpandedMessages((currentState) => ({
                              ...currentState,
                              [entry.id]: !currentState[entry.id],
                            }))
                          }
                          type="button"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="chat-empty-state">Telemetry will appear here as soon as connected agents start reporting work.</div>
            )}
          </div>
        </div>

        {snapshotError && !isDemoMode ? <p className="monitor-error-copy">{snapshotError}</p> : null}
        {isDemoMode ? (
          <div className="monitor-demo-footer">
            <span>Detail drill-in: click an agent to open its full detail page.</span>
            <Link className="agent-detail-link" href="/">
              Open the full dashboard
            </Link>
          </div>
        ) : null}
      </section>
    </section>
  );
}
