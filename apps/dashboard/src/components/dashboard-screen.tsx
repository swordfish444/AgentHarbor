import type { DashboardData } from "../lib/control-node";
import { formatDateTime } from "../lib/formatters";
import { hasActiveDashboardFilters, type DashboardFilterOptions, type DashboardQuery } from "../lib/dashboard-query";
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
}: {
  data: DashboardData;
  query: DashboardQuery;
  filterOptions: DashboardFilterOptions;
}) {
  const filtered = hasActiveDashboardFilters(query);

  const activeFilters = [
    query.status ? `Status: ${query.status}` : null,
    query.agentType ? `Agent: ${query.agentType}` : null,
    query.label ? `Label: ${query.label}` : null,
    query.search ? `Search: ${query.search}` : null,
    query.since ? `Since: ${formatDateTime(query.since)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="dashboard-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">AgentHarbor</p>
          <h1>Control tower visibility for AI agents spread across your fleet.</h1>
          <p className="hero-copy">
            The dashboard is now reading live fleet stats, analytics, and operator alerts from the control node so the
            view stays anchored to the same slice of sessions, runners, and telemetry throughout the screen.
          </p>
          {filtered ? (
            <div className="hero-filter-list">
              {activeFilters.map((filter) => (
                <span className="tag" key={filter}>
                  {filter}
                </span>
              ))}
            </div>
          ) : null}
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
            <p>{filtered ? "URL filters active" : "Viewing the full dashboard slice"}</p>
            {query.since ? <p>Window starts {formatDateTime(query.since)}</p> : <p>Using the default 24-hour analytics window</p>}
          </div>
        </div>
      </section>

      <MetricsStrip hasActiveFilters={filtered} stats={data.stats} />
      <AlertRail alerts={data.alerts} />
      <FilterBar filterOptions={filterOptions} query={query} />

      <section className="dashboard-main-grid">
        <FleetTable query={query} runnerGroups={data.runnerGroups} runners={data.runners} />
        <SessionList query={query} sessions={data.sessions} />
      </section>

      <section className="dashboard-lower-grid">
        <LiveEventFeed events={data.events} query={query} />
        <AnalyticsPanel analytics={data.analytics} />
      </section>
    </div>
  );
}
