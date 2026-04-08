"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const refreshEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;

export function DashboardLiveRefresh() {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "degraded">("connecting");

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
      source.addEventListener(eventType, () => {
        if (!closed) {
          clearReconnectWarning();
          setStatus("connected");
        }

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

  const statusLabel =
    status === "connected"
      ? "Live stream connected"
      : status === "degraded"
        ? "Live stream offline, showing last snapshot"
      : status === "reconnecting"
        ? "Live stream reconnecting"
        : "Live stream connecting";

  return <span className="subtle-badge">{statusLabel}</span>;
}
