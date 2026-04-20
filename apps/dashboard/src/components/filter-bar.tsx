"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  dashboardAgentTypes,
  dashboardQueryToSearchParams,
  dashboardSessionStatuses,
  dashboardTimeRangeOptions,
  inferTimeRangeSelectionFromQuery,
  type DashboardTimeRangeValue,
  type DashboardFilterOptions,
  type DashboardQuery,
} from "../lib/dashboard-query";

const readSelectValue = (value: string) => (value === "" ? undefined : value);

export function FilterBar({
  query,
  filterOptions,
  isDemoMode = false,
}: {
  query: DashboardQuery;
  filterOptions: DashboardFilterOptions;
  isDemoMode?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(query.search ?? "");
  const timeRangeSelection = inferTimeRangeSelectionFromQuery(query);

  useEffect(() => {
    setSearchValue(query.search ?? "");
  }, [query.search]);

  const navigate = (nextQuery: DashboardQuery) => {
    const searchParams = dashboardQueryToSearchParams(nextQuery);
    const queryString = searchParams.toString();
    const href = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  const updateQuery = (patch: Partial<DashboardQuery>) => {
    navigate({
      ...query,
      ...patch,
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateQuery({
      search: searchValue.trim() === "" ? undefined : searchValue.trim(),
    });
  };

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">View controls</p>
          <h2>Focus the screen</h2>
        </div>
        {isDemoMode ? (
          <span className="subtle-badge">Curated fallback</span>
        ) : query.since ? (
          <span className="subtle-badge">Filtered view</span>
        ) : (
          <span className="subtle-badge">Default overview</span>
        )}
      </div>

      <form className="filter-layout" onSubmit={submitSearch}>
        <div className="filter-field">
          <label htmlFor="dashboard-status">Session status</label>
          <select
            id="dashboard-status"
            disabled={isDemoMode}
            onChange={(event) => updateQuery({ status: readSelectValue(event.target.value) as DashboardQuery["status"] })}
            value={query.status ?? ""}
          >
            <option value="">All statuses</option>
            {dashboardSessionStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="dashboard-agent">Agent type</label>
          <select
            id="dashboard-agent"
            disabled={isDemoMode}
            onChange={(event) =>
              updateQuery({ agentType: readSelectValue(event.target.value) as DashboardQuery["agentType"] })
            }
            value={query.agentType ?? ""}
          >
            <option value="">All agents</option>
            {dashboardAgentTypes.map((agentType) => (
              <option key={agentType} value={agentType}>
                {agentType}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="dashboard-runner">Runner</label>
          <select
            id="dashboard-runner"
            disabled={isDemoMode}
            onChange={(event) => updateQuery({ runnerId: readSelectValue(event.target.value) })}
            value={query.runnerId ?? ""}
          >
            <option value="">All runners</option>
            {filterOptions.runners.map((runner) => (
              <option key={runner.value} value={runner.value}>
                {runner.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="dashboard-label">Label</label>
          <select
            id="dashboard-label"
            disabled={isDemoMode}
            onChange={(event) => updateQuery({ label: readSelectValue(event.target.value) })}
            value={query.label ?? ""}
          >
            <option value="">All labels</option>
            {filterOptions.labels.map((label) => (
              <option key={label.value} value={label.value}>
                {label.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="dashboard-window">Time window</label>
          <select
            id="dashboard-window"
            disabled={isDemoMode}
            onChange={(event) => {
              const nextValue = event.target.value as DashboardTimeRangeValue | "custom";

              if (nextValue === "custom") {
                return;
              }

              updateQuery({
                since: undefined,
                timeRange: nextValue === "all" ? undefined : nextValue,
              });
            }}
            value={timeRangeSelection}
          >
            {dashboardTimeRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {timeRangeSelection === "custom" ? <option value="custom">Custom timestamp from link</option> : null}
          </select>
        </div>

        <div className="filter-field filter-search">
          <label htmlFor="dashboard-search">Search</label>
          <input
            id="dashboard-search"
            disabled={isDemoMode}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Session key, summary, runner, category"
            type="search"
            value={searchValue}
          />
        </div>

        <div className="filter-actions">
          <button className="button-primary" disabled={isPending || isDemoMode} type="submit">
            {isDemoMode ? "Locked" : isPending ? "Updating..." : "Apply"}
          </button>
          <button
            className="button-secondary"
            disabled={isPending || isDemoMode}
            onClick={() => {
              setSearchValue("");
              navigate({});
            }}
            type="button"
          >
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}
