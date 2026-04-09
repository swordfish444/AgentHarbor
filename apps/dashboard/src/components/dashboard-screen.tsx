import Link from "next/link";
import type { DashboardData } from "../lib/control-node";
import { formatDateTime, formatTime } from "../lib/formatters";
import {
  dashboardTimeRangeOptions,
  hasActiveDashboardFilters,
  type DashboardFilterOptions,
  type DashboardQuery,
} from "../lib/dashboard-query";
import { FilterBar } from "./filter-bar";
import { MetricCard } from "./metric-card";
import { OperatorConsole } from "./operator-console";

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
  const selectedTimeRangeLabel = query.timeRange
    ? dashboardTimeRangeOptions.find((option) => option.value === query.timeRange)?.label ?? query.timeRange
    : null;

  const activeFilters = [
    query.status ? `Status: ${query.status}` : null,
    query.agentType ? `Agent: ${query.agentType}` : null,
    query.label ? `Label: ${query.label}` : null,
    query.search ? `Search: ${query.search}` : null,
    selectedTimeRangeLabel ? `Window: ${selectedTimeRangeLabel}` : query.since ? `Since: ${formatDateTime(query.since)}` : null,
  ].filter(Boolean) as string[];
  const latestSignalAt =
    data.events[0]?.createdAt ??
    data.sessions[0]?.startedAt ??
    [...data.runners]
      .map((runner) => runner.lastSeenAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ??
    null;
  const attentionCount = Math.max(
    data.sessions.filter((session) => session.status === "failed").length,
    data.alerts.filter((alert) => alert.severity === "critical").length,
  );
  const heroAlerts = data.alerts.slice(0, 2);

  return (
    <div className="dashboard-stack dashboard-stack-focused">
      <section className="hero hero-briefing">
        <div>
          <p className="eyebrow">Live operator view</p>
          <h1>Monitor every coding agent from one screen.</h1>
          <p className="hero-copy">
            Built for a large demo monitor: fleet table first, spotlight second, full session drilldowns only when you
            click into the work that matters.
          </p>
          {filtered ? (
            <div className="hero-filter-list">
              {activeFilters.map((filter) => (
                <span className="tag" key={filter}>
                  {filter}
                </span>
              ))}
            </div>
          ) : (
            <div className="hero-filter-list">
              <span className="tag">Click an agent row to inspect it</span>
              <span className="tag">Presentation-first overview</span>
              <span className="tag">Single-screen control tower</span>
            </div>
          )}
        </div>
        <div className="hero-briefing-stack">
          <div className="hero-callout-grid">
            {heroAlerts.length > 0 ? (
              heroAlerts.map((alert) =>
                alert.href ? (
                  <Link className={`alert-card alert-card-interactive severity-${alert.severity}`} href={alert.href} key={alert.id}>
                    <span className="alert-severity">{alert.severity}</span>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </Link>
                ) : (
                  <article className={`alert-card severity-${alert.severity}`} key={alert.id}>
                    <span className="alert-severity">{alert.severity}</span>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </article>
                ),
              )
            ) : (
              <article className="alert-card severity-info">
                <span className="alert-severity">info</span>
                <strong>Fleet is quiet right now</strong>
                <p>Once new runner telemetry lands, operator attention items will surface here.</p>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="metrics-grid metrics-grid-focused">
        <MetricCard
          detail="Agents represented on this screen."
          label="Agents Visible"
          value={`${data.runners.length}`}
        />
        <MetricCard
          detail="Sessions still reported as actively running."
          label="Running Now"
          value={`${data.stats.activeSessions}`}
        />
        <MetricCard
          detail="Failures or critical states worth operator attention."
          label="Need Attention"
          value={`${attentionCount}`}
        />
        <MetricCard
          detail={latestSignalAt ? formatDateTime(latestSignalAt) : "Awaiting first telemetry signal."}
          label="Latest Signal"
          value={latestSignalAt ? formatTime(latestSignalAt) : "--"}
        />
      </section>

      <FilterBar filterOptions={filterOptions} query={query} />
      <OperatorConsole data={data} />
    </div>
  );
}
