"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const refreshEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;

export function DashboardLiveRefresh() {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");

  useEffect(() => {
    let closed = false;
    const source = new EventSource("/api/stream/events");
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
        setStatus("connected");
      }
    };

    source.onerror = () => {
      if (!closed) {
        setStatus("reconnecting");
      }
    };

    for (const eventType of refreshEventTypes) {
      source.addEventListener(eventType, scheduleRefresh);
    }

    return () => {
      closed = true;
      source.close();

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [router]);

  const statusLabel =
    status === "connected"
      ? "Live stream connected"
      : status === "reconnecting"
        ? "Live stream reconnecting"
        : "Live stream connecting";

  return <span className="subtle-badge">{statusLabel}</span>;
}
