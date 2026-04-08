import type { StatsResponse } from "@agentharbor/shared";
import { MetricCard } from "./metric-card";

export function MetricsStrip({
  stats,
  hasActiveFilters,
}: {
  stats: StatsResponse;
  hasActiveFilters: boolean;
}) {
  const scopeCopy = hasActiveFilters ? "Filtered to the current dashboard view." : "Fleet-wide snapshot.";
  const windowLabel = hasActiveFilters ? "Window Sessions" : "24h Sessions";
  const eventLabel = hasActiveFilters ? "Window Events" : "24h Events";

  return (
    <section className="metrics-grid">
      <MetricCard
        label="Online Runners"
        value={`${stats.onlineRunners}/${stats.totalRunners}`}
        detail={`Live heartbeat coverage across the visible runner slice. ${scopeCopy}`}
      />
      <MetricCard
        label="Active Sessions"
        value={`${stats.activeSessions}`}
        detail={`Sessions currently reported as running. ${scopeCopy}`}
      />
      <MetricCard
        label={windowLabel}
        value={`${stats.sessionsLast24h}`}
        detail={hasActiveFilters ? "Completed and failed sessions inside the current filtered window." : "Fleet-wide 24-hour session throughput."}
      />
      <MetricCard
        label={eventLabel}
        value={`${stats.eventsLast24h}`}
        detail={`Telemetry volume in the current analytics window. Failed sessions: ${stats.failedSessionsLast24h}.`}
      />
    </section>
  );
}
