import Link from "next/link";
import type { RunnerLabelGroup, RunnerListItem } from "@agentharbor/shared";
import { formatDateTime } from "../lib/formatters";
import { hasActiveDashboardFilters, type DashboardQuery } from "../lib/dashboard-query";
import { StatusPill } from "./status-pill";

export function FleetTable({
  runners,
  query,
  runnerGroups,
}: {
  runners: RunnerListItem[];
  query: DashboardQuery;
  runnerGroups: RunnerLabelGroup[];
}) {
  const filtered = hasActiveDashboardFilters(query);

  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Runner Fleet</p>
          <h2>Connected machines</h2>
        </div>
        <span className="subtle-badge">{runners.length} visible</span>
      </div>

      {runnerGroups.length > 0 ? (
        <div className="runner-group-grid">
          {runnerGroups.map((group) => (
            <section className="runner-group-card" key={group.label}>
              <div className="runner-group-header">
                <div>
                  <p className="eyebrow">Label Group</p>
                  <h3>{group.label}</h3>
                </div>
                <span className="subtle-badge">{group.runnerCount} runners</span>
              </div>
              <div className="runner-group-metrics">
                <span>{group.onlineCount} online</span>
                <span>{group.activeSessionCount} active sessions</span>
              </div>
              <div className="tag-list">
                {group.runners.slice(0, 4).map((runner) => (
                  <span className="tag" key={`${group.label}-${runner.id}`}>
                    {runner.name}
                  </span>
                ))}
                {group.runners.length > 4 ? <span className="tag">+{group.runners.length - 4} more</span> : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {runners.length === 0 ? (
        <div className="empty-state">
          <strong>{filtered ? "No runners match the current filters." : "No runners enrolled yet."}</strong>
          <p>
            {filtered
              ? "Try broadening the runner, label, or search filters to widen the fleet view."
              : "Once demo runners enroll and heartbeat, the fleet table will populate here."}
          </p>
          {filtered ? <Link href="/">Clear filters</Link> : null}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Runner</th>
                <th>Machine</th>
                <th>Labels</th>
                <th>Status</th>
                <th>Active Sessions</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {runners.map((runner) => (
                <tr key={runner.id}>
                  <td>
                    <strong>
                      <Link className="agent-detail-link" href={`/agents/${runner.id}`}>
                        {runner.name}
                      </Link>
                    </strong>
                    <span className="row-meta">{runner.id}</span>
                  </td>
                  <td>
                    {runner.hostname}
                    <span className="row-meta">
                      {runner.os} / {runner.architecture}
                    </span>
                  </td>
                  <td>
                    <div className="tag-list">
                      {runner.environment ? <span className="tag tag-environment">env:{runner.environment}</span> : null}
                      {runner.labels.map((label) => (
                        <span className="tag" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={runner.status} />
                  </td>
                  <td>{runner.activeSessionCount}</td>
                  <td>{formatDateTime(runner.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
