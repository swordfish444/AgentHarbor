"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "../lib/formatters";

const refreshEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;
type ConnectionState = "connecting" | "connected" | "reconnecting" | "degraded";

const statusCopy: Record<ConnectionState, { title: string; detail: string }> = {
  connecting: {
    title: "Connecting",
    detail: "Opening the live stream so the dashboard can refresh itself as runner activity lands.",
  },
  connected: {
    title: "Connected",
    detail: "Server-sent events are active and the dashboard will refresh when new telemetry arrives.",
  },
  reconnecting: {
    title: "Reconnecting",
    detail: "The live stream dropped and the dashboard is waiting for the control node connection to recover.",
  },
  degraded: {
    title: "Disconnected",
    detail: "The stream has been unavailable long enough that the dashboard may be showing an older snapshot.",
  },
};

const parseStreamMetadata = (rawPayload: string, fallbackType: string) => {
  try {
    const payload = JSON.parse(rawPayload) as { emittedAt?: string; type?: string };
    return {
      emittedAt: typeof payload.emittedAt === "string" ? payload.emittedAt : new Date().toISOString(),
      type: typeof payload.type === "string" ? payload.type : fallbackType,
    };
  } catch {
    return {
      emittedAt: new Date().toISOString(),
      type: fallbackType,
    };
  }
};

export function DashboardLiveRefresh() {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [lastSignalType, setLastSignalType] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    const source = new EventSource("/api/stream/events");
    const clearReconnectWarning = () => {
      if (reconnectWarningTimerRef.current) {
        clearTimeout(reconnectWarningTimerRef.current);
        reconnectWarningTimerRef.current = null;
      }
    };
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, 500);
    };

    source.onopen = () => {
      if (!closed) {
        clearReconnectWarning();
        setStatus("connected");
        setLastConnectedAt(new Date().toISOString());
      }
    };

    source.onerror = () => {
      if (!closed) {
        setStatus("reconnecting");

        if (!reconnectWarningTimerRef.current) {
          reconnectWarningTimerRef.current = setTimeout(() => {
            if (!closed) {
              setStatus("degraded");
            }
          }, 12_000);
        }
      }
    };

    for (const eventType of refreshEventTypes) {
      source.addEventListener(eventType, (event: MessageEvent<string>) => {
        if (!closed) {
          clearReconnectWarning();
          setStatus("connected");
        }

        const metadata = parseStreamMetadata(String(event.data), eventType);
        setLastSignalAt(metadata.emittedAt);
        setLastSignalType(metadata.type);
        scheduleRefresh();
      });
    }

    return () => {
      closed = true;
      source.close();

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      clearReconnectWarning();
    };
  }, [router]);

  const content = statusCopy[status];

  return (
    <section className={`panel live-refresh-banner live-refresh-${status}`}>
      <div className="section-header">
        <div>
          <p className="eyebrow">Live Refresh</p>
          <h2>{content.title}</h2>
        </div>
        <span className={`live-refresh-pill live-refresh-pill-${status}`}>{content.title}</span>
      </div>
      <p className="hero-copy">{content.detail}</p>
      <div className="live-refresh-meta">
        <span className="tag">Transport: server-sent events</span>
        <span className="tag">Refresh debounce: 500ms</span>
        <span className="tag">Last connected: {formatDateTime(lastConnectedAt)}</span>
        <span className={`tag ${status === "degraded" ? "tag-danger" : ""}`}>
          Last signal: {lastSignalAt ? formatDateTime(lastSignalAt) : "Awaiting first event"}
        </span>
        <span className="tag">Signal type: {lastSignalType ?? "Awaiting first event"}</span>
      </div>
    </section>
  );
}
