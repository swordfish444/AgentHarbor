"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventListItem, RunnerListItem, SessionListItem, StreamEvent } from "@agentharbor/shared";
import type { DashboardData } from "../lib/control-node";
import { formatInteger, formatRelativeTime, formatTime } from "../lib/formatters";

const rowsPerPage = 5;
const chatPreviewCharacterThreshold = 140;
const realtimeEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;

const runnerPalette = [
  { solid: "#63b3ff", soft: "rgba(99, 179, 255, 0.18)" },
  { solid: "#ff8e5f", soft: "rgba(255, 142, 95, 0.18)" },
  { solid: "#70e2a7", soft: "rgba(112, 226, 167, 0.18)" },
  { solid: "#d8a7ff", soft: "rgba(216, 167, 255, 0.18)" },
  { solid: "#ffd36b", soft: "rgba(255, 211, 107, 0.18)" },
  { solid: "#7de1ff", soft: "rgba(125, 225, 255, 0.18)" },
  { solid: "#ff98c7", soft: "rgba(255, 152, 199, 0.18)" },
  { solid: "#8ff29d", soft: "rgba(143, 242, 157, 0.18)" },
] as const;

type StreamState = "connecting" | "live" | "reconnecting";

interface AgentRow {
  runnerId: string;
  name: string;
  accent: string;
  accentSoft: string;
  startedAt: string | null;
  tasksCompleted: number;
  errors: number;
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

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const getRunnerColor = (runnerId: string) => runnerPalette[hashString(runnerId) % runnerPalette.length] ?? runnerPalette[0];

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
};

const buildAgentRows = (data: DashboardData): AgentRow[] => {
  const sessionsByRunner = new Map<string, SessionListItem[]>();

  for (const session of data.sessions) {
    const bucket = sessionsByRunner.get(session.runnerId) ?? [];
    bucket.push(session);
    sessionsByRunner.set(session.runnerId, bucket);
  }

  return data.runners
    .filter(isConnectedRunner)
    .map((runner) => {
      const runnerSessions = [...(sessionsByRunner.get(runner.id) ?? [])].sort((left, right) =>
        compareByTimestamp(left.startedAt, right.startedAt),
      );
      const latestSession = runnerSessions[0] ?? null;
      const color = getRunnerColor(runner.id);
      const tasksCompleted = runnerSessions.filter((session) => session.status === "completed").length;
      const errors = runnerSessions.filter((session) => session.status === "failed").length;
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

const buildChatEntries = (data: DashboardData): ChatEntry[] =>
  {
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
}: {
  initialData: DashboardData;
  renderedAt: string;
}) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);
  const [relativeNow, setRelativeNow] = useState(() => new Date(renderedAt).getTime());
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  const agentRows = useMemo(() => buildAgentRows(data), [data]);
  const connectedAgents = agentRows.length;
  const runningAgents = agentRows.filter((row) => row.isRunning).length;
  const idleAgents = Math.max(0, connectedAgents - runningAgents);
  const pageCount = Math.max(1, Math.ceil(agentRows.length / rowsPerPage));
  const visibleRows = agentRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const chatEntries = useMemo(() => buildChatEntries(data), [data]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount - 1));
  }, [pageCount]);

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
    const clock = setInterval(() => {
      setRelativeNow(Date.now());
    }, 30_000);

    return () => {
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
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

        if (streamEvent?.data?.event) {
          setData((currentData) => optimisticInsertEvent(currentData, streamEvent.data!.event!));
        }

        if (streamEvent?.data?.session) {
          setData((currentData) => optimisticUpsertSession(currentData, streamEvent.data!.session!));
        }

        if (streamEvent?.data?.runner) {
          setData((currentData) => optimisticUpsertRunner(currentData, streamEvent.data!.runner!));
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
  }, [refreshSnapshot, scheduleSnapshotRefresh]);

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

  return (
    <section className="realtime-screen">
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
            <span className={`stream-indicator stream-${streamState}`}>
              <span className="stream-dot" />
              {streamState === "live" ? "Live" : streamState === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
            <span className="monitor-meta-text">
              {lastSignalAt ? `Last signal ${formatRelativeTime(lastSignalAt, relativeNow)}` : "Awaiting live signals"}
            </span>
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
                visibleRows.map((row) => (
                  <tr className={row.isRunning ? "agent-row-running" : "agent-row-idle"} key={row.runnerId}>
                    <td>
                      <div className="agent-name-cell">
                        <span
                          aria-hidden="true"
                          className="agent-dot"
                          style={{ backgroundColor: row.accent, boxShadow: `0 0 0 6px ${row.accentSoft}` }}
                        />
                        <div>
                          <strong>
                            <Link className="agent-detail-link" href={`/?runnerId=${row.runnerId}`}>
                              {row.name}
                            </Link>
                          </strong>
                          <span className="agent-state-copy">{row.isRunning ? "Running now" : "Idle"}</span>
                        </div>
                      </div>
                    </td>
                    <td>{formatRelativeTime(row.startedAt, relativeNow)}</td>
                    <td>{formatInteger(row.tasksCompleted)}</td>
                    <td>{formatInteger(row.errors)}</td>
                    <td>{formatInteger(row.totalTokens)}</td>
                  </tr>
                ))
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
            <span className={`stream-indicator stream-${streamState}`}>
              <span className="stream-dot" />
              {streamState === "live" ? "Live" : streamState === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
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

                return (
                  <article className="chat-entry" key={entry.id} style={{ borderLeftColor: entry.accent }}>
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
                  </article>
                );
              })
            ) : (
              <div className="chat-empty-state">Telemetry will appear here as soon as connected agents start reporting work.</div>
            )}
          </div>
        </div>

        {snapshotError ? <p className="monitor-error-copy">{snapshotError}</p> : null}
      </section>
    </section>
  );
}
