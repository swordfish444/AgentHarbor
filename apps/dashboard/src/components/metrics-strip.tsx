import type { StatsResponse } from "@agentharbor/shared";
import { MetricCard } from "./metric-card";

export function MetricsStrip({
  stats,
  hasActiveFilters,
}: {
  stats: StatsResponse;
  hasActiveFilters: boolean;
}) {
  const globalCopy = hasActiveFilters ? "Global total, not narrowed by dashboard filters." : "Global fleet snapshot.";

  return (
    <section className="metrics-grid">
      <MetricCard
        label="Online Runners"
        value={`${stats.onlineRunners}/${stats.totalRunners}`}
        detail={`Live heartbeat coverage across enrolled machines. ${globalCopy}`}
      />
      <MetricCard label="Active Sessions" value={`${stats.activeSessions}`} detail={`Sessions currently reported as running. ${globalCopy}`} />
      <MetricCard label="24h Sessions" value={`${stats.sessionsLast24h}`} detail="Global 24-hour throughput across the control plane." />
      <MetricCard
        label="24h Events"
        value={`${stats.eventsLast24h}`}
        detail={`Global 24-hour telemetry volume. Failures: ${stats.failedSessionsLast24h}.`}
      />
    </section>
  );
}
