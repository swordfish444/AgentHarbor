"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  dashboardAgentTypes,
  dashboardQueryToSearchParams,
  dashboardSessionStatuses,
  type DashboardFilterOptions,
  type DashboardQuery,
} from "../lib/dashboard-query";

const readSelectValue = (value: string) => (value === "" ? undefined : value);

export function FilterBar({
  query,
  filterOptions,
}: {
  query: DashboardQuery;
  filterOptions: DashboardFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(query.search ?? "");

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
          <p className="eyebrow">Filters</p>
          <h2>URL-driven dashboard state</h2>
        </div>
        {query.since ? <span className="subtle-badge">Time window preserved from link</span> : null}
      </div>

      <form className="filter-layout" onSubmit={submitSearch}>
        <div className="filter-field">
          <label htmlFor="dashboard-status">Session status</label>
          <select
            id="dashboard-status"
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

        <div className="filter-field filter-search">
          <label htmlFor="dashboard-search">Search</label>
          <input
            id="dashboard-search"
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Session key, summary, runner, category"
            type="search"
            value={searchValue}
          />
        </div>

        <div className="filter-actions">
          <button className="button-primary" disabled={isPending} type="submit">
            {isPending ? "Updating..." : "Apply"}
          </button>
          <button
            className="button-secondary"
            disabled={isPending}
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
