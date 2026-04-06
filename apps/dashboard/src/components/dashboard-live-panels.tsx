"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  analyticsResponseSchema,
  streamEventEnvelopeSchema,
  type AnalyticsSection,
  type EventListItem,
} from "@agentharbor/shared";
import { hasActiveDashboardFilters, type DashboardQuery } from "../lib/dashboard-query";
import { AnalyticsPanel } from "./analytics-panel";
import { LiveEventFeed } from "./live-event-feed";

const maxLiveEvents = 12;

const dedupeEvents = (events: EventListItem[]) => {
  const byId = new Map<string, EventListItem>();

  for (const event of events) {
    byId.set(event.id, event);
  }

  return [...byId.values()]
    .sort((left, right) => {
      const createdAtDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return createdAtDelta !== 0 ? createdAtDelta : right.id.localeCompare(left.id);
    })
    .slice(0, maxLiveEvents);
};

export function DashboardLivePanels({
  initialEvents,
  initialAnalytics,
  query,
}: {
  initialEvents: EventListItem[];
  initialAnalytics: AnalyticsSection[];
  query: DashboardQuery;
}) {
  const filtered = hasActiveDashboardFilters(query);
  const [events, setEvents] = useState(initialEvents);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [streamConnected, setStreamConnected] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refreshAnalytics = useEffectEvent(async () => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const task = (async () => {
      const response = await fetch("/api/analytics", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Analytics refresh failed with ${response.status}`);
      }

      const payload = analyticsResponseSchema.parse(await response.json());
      startTransition(() => {
        setAnalytics(payload.sections);
      });
    })();

    refreshInFlight.current = task.finally(() => {
      refreshInFlight.current = null;
    });

    return refreshInFlight.current;
  });

  useEffect(() => {
    const eventSource = new EventSource("/api/stream");

    eventSource.onopen = () => {
      setStreamConnected(true);
    };

    eventSource.onerror = () => {
      setStreamConnected(false);
    };

    const onTelemetryEvent = (message: MessageEvent<string>) => {
      const envelope = streamEventEnvelopeSchema.parse(JSON.parse(message.data));

      if (envelope.type !== "telemetry.event.created") {
        return;
      }

      if (filtered) {
        return;
      }

      startTransition(() => {
        setEvents((current) => dedupeEvents([envelope.payload, ...current]));
      });
    };

    const onStatsHint = () => {
      void refreshAnalytics();
    };

    eventSource.addEventListener("telemetry.event.created", onTelemetryEvent as EventListener);
    eventSource.addEventListener("stats.hint", onStatsHint);
    eventSource.addEventListener("runner.heartbeat.recorded", onStatsHint);
    eventSource.addEventListener("session.updated", onStatsHint);

    return () => {
      eventSource.removeEventListener("telemetry.event.created", onTelemetryEvent as EventListener);
      eventSource.removeEventListener("stats.hint", onStatsHint);
      eventSource.removeEventListener("runner.heartbeat.recorded", onStatsHint);
      eventSource.removeEventListener("session.updated", onStatsHint);
      eventSource.close();
    };
  }, [filtered, refreshAnalytics]);

  const eventModeLabel = filtered ? "Filtered snapshot" : streamConnected ? "Live stream" : "Reconnecting";
  const analyticsModeLabel = streamConnected ? "Live aggregates" : "Snapshot fallback";

  return (
    <section className="dashboard-lower-grid">
      <LiveEventFeed events={events} modeLabel={eventModeLabel} query={query} />
      <AnalyticsPanel modeLabel={analyticsModeLabel} sections={analytics} />
    </section>
  );
}
