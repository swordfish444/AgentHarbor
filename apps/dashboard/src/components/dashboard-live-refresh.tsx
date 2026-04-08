"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardQueryToSearchParams, type DashboardQuery } from "../lib/dashboard-query";
import { formatDateTime } from "../lib/formatters";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface DashboardLiveRefreshProps {
  query: DashboardQuery;
}

interface LiveStatusResponse {
  checkedAt: string;
  latestEventAt: string | null;
}

const pollIntervalMs = 8_000;
const disconnectThresholdMs = 20_000;

const statusCopy: Record<ConnectionState, { title: string; detail: string }> = {
  connecting: {
    title: "Connecting",
    detail: "Checking the control node before we start automatic rehearsal refreshes.",
  },
  connected: {
    title: "Connected",
    detail: "Polling for fresh telemetry and refreshing the dashboard when new events land.",
  },
  reconnecting: {
    title: "Reconnecting",
    detail: "The last poll failed, so the dashboard is trying to re-establish the live link.",
  },
  disconnected: {
    title: "Disconnected",
    detail: "The control node has been unreachable long enough that rehearsal data may be stale.",
  },
};

export function DashboardLiveRefresh({ query }: DashboardLiveRefreshProps) {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastHealthyAt, setLastHealthyAt] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastSeenEventRef = useRef<string | null>(null);
  const failureStartedAtRef = useRef<number | null>(null);
  const hasConnectedRef = useRef(false);
  const queryString = dashboardQueryToSearchParams(query).toString();

  useEffect(() => {
    let disposed = false;

    hasConnectedRef.current = false;
    failureStartedAtRef.current = null;
    lastSeenEventRef.current = null;
    setConnectionState("connecting");
    setLastHealthyAt(null);
    setLastEventAt(null);
    setLastError(null);

    const runPoll = async () => {
      if (disposed) {
        return;
      }

      try {
        const response = await fetch(`/api/live-status${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          let message = `Control node polling failed with status ${response.status}.`;

          try {
            const payload = (await response.json()) as { message?: string };
            if (payload.message) {
              message = payload.message;
            }
          } catch {}

          throw new Error(message);
        }

        const payload = (await response.json()) as LiveStatusResponse;
        failureStartedAtRef.current = null;
        setLastHealthyAt(payload.checkedAt);
        setLastEventAt(payload.latestEventAt);
        setLastError(null);
        setConnectionState("connected");

        if (!hasConnectedRef.current) {
          hasConnectedRef.current = true;
          lastSeenEventRef.current = payload.latestEventAt;
          return;
        }

        if (payload.latestEventAt !== lastSeenEventRef.current) {
          lastSeenEventRef.current = payload.latestEventAt;
          startTransition(() => {
            router.refresh();
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Control node polling failed.";
        const now = Date.now();

        if (failureStartedAtRef.current == null) {
          failureStartedAtRef.current = now;
        }

        const failureDurationMs = now - failureStartedAtRef.current;
        setLastError(message);

        if (hasConnectedRef.current) {
          setConnectionState(failureDurationMs >= disconnectThresholdMs ? "disconnected" : "reconnecting");
        } else {
          setConnectionState(failureDurationMs >= disconnectThresholdMs ? "disconnected" : "connecting");
        }
      }
    };

    void runPoll();
    const intervalId = window.setInterval(() => {
      void runPoll();
    }, pollIntervalMs);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [queryString, router]);

  const content = statusCopy[connectionState];

  return (
    <section className={`panel live-refresh-banner live-refresh-${connectionState}`}>
      <div className="section-header">
        <div>
          <p className="eyebrow">Live Refresh</p>
          <h2>{content.title}</h2>
        </div>
        <span className={`live-refresh-pill live-refresh-pill-${connectionState}`}>{content.title}</span>
      </div>
      <p className="hero-copy">{content.detail}</p>
      <div className="live-refresh-meta">
        <span className="tag">Poll cadence: every 8 seconds</span>
        <span className="tag">Last healthy check: {formatDateTime(lastHealthyAt)}</span>
        <span className="tag">Latest event: {lastEventAt ? formatDateTime(lastEventAt) : "No events yet"}</span>
        {lastError ? <span className="tag tag-danger">Issue: {lastError}</span> : null}
      </div>
    </section>
  );
}
