import Link from "next/link";
import type { DashboardData } from "../lib/control-node";
import { buildDemoSearch } from "../lib/demo-mode";
import { formatDateTime } from "../lib/formatters";
import {
  dashboardTimeRangeOptions,
  hasActiveDashboardFilters,
  type DashboardFilterOptions,
  type DashboardQuery,
} from "../lib/dashboard-query";
import { AlertRail } from "./alert-rail";
import { AnalyticsPanel } from "./analytics-panel";
import { FilterBar } from "./filter-bar";
import { FleetTable } from "./fleet-table";
import { LiveEventFeed } from "./live-event-feed";
import { MetricsStrip } from "./metrics-strip";
import { SessionList } from "./session-list";

export function DashboardScreen({
  data,
  query,
  filterOptions,
  demoState,
}: {
  data: DashboardData;
  query: DashboardQuery;
  filterOptions: DashboardFilterOptions;
  demoState?: {
    demoStart: number;
    demoAnchor: number;
    demoResolved?: string | null;
  };
}) {
  const isDemoMode = demoState != null;
  const filtered = hasActiveDashboardFilters(query);
  const selectedTimeRangeLabel = query.timeRange
    ? dashboardTimeRangeOptions.find((option) => option.value === query.timeRange)?.label ?? query.timeRange
    : null;
  const detailSearch = buildDemoSearch(demoState);
  const wallboardHref = isDemoMode ? `/wallboard${detailSearch}` : "/wallboard";
  const clearHref = isDemoMode ? `/${detailSearch}` : "/";

  const activeFilters = [
    query.status ? `Status: ${query.status}` : null,
    query.agentType ? `Agent: ${query.agentType}` : null,
    query.label ? `Label: ${query.label}` : null,
    query.search ? `Search: ${query.search}` : null,
    selectedTimeRangeLabel ? `Window: ${selectedTimeRangeLabel}` : query.since ? `Since: ${formatDateTime(query.since)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="dashboard-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">AgentHarbor</p>
          <h1>Control tower visibility for AI agents spread across your fleet.</h1>
          <p className="hero-copy">
            {isDemoMode
              ? "This dashboard is running on the curated presentation fallback so the drilldown path stays intact when the control node is unavailable."
              : "The dashboard is now reading live fleet stats, analytics, and operator alerts from the control node so the view stays anchored to the same slice of sessions, runners, and telemetry throughout the screen."}
          </p>
          <div className="hero-filter-list">
            <Link className="tag" href={wallboardHref}>
              Open the presentation wallboard
            </Link>
            {filtered && !isDemoMode
              ? activeFilters.map((filter) => (
                  <span className="tag" key={filter}>
                    {filter}
                  </span>
                ))
              : null}
          </div>
        </div>
        <div className="hero-meta panel">
          <div className="hero-meta-block">
            <p className="eyebrow">Snapshot</p>
            <p>{data.runners.length} runners visible</p>
            <p>{data.sessions.length} sessions visible</p>
            <p>{data.events.length} events visible</p>
          </div>
          <div className="hero-meta-block">
            <p className="eyebrow">Filters</p>
            <p>{isDemoMode ? "Curated presentation fallback" : filtered ? "URL filters active" : "Viewing the full dashboard slice"}</p>
            {isDemoMode ? (
              <p>Drilldowns stay available without the control node.</p>
            ) : selectedTimeRangeLabel ? (
              <p>Rolling window: {selectedTimeRangeLabel}</p>
            ) : query.since ? (
              <p>Window starts {formatDateTime(query.since)}</p>
            ) : (
              <p>Using the default 24-hour analytics window</p>
            )}
          </div>
        </div>
      </section>

      <MetricsStrip hasActiveFilters={filtered} stats={data.stats} />
      <AlertRail alerts={data.alerts} linkSuffix={detailSearch} />
      <FilterBar filterOptions={filterOptions} isDemoMode={isDemoMode} query={query} />

      <section className="dashboard-main-grid">
        <FleetTable clearHref={clearHref} detailSearch={detailSearch} query={query} runnerGroups={data.runnerGroups} runners={data.runners} />
        <SessionList clearHref={clearHref} detailSearch={detailSearch} query={query} sessions={data.sessions} />
      </section>

      <section className="dashboard-lower-grid">
        <LiveEventFeed clearHref={clearHref} detailSearch={detailSearch} events={data.events} query={query} realtimeEnabled={!isDemoMode} />
        <AnalyticsPanel analytics={data.analytics} />
      </section>
    </div>
  );
}
