import { Agent } from "undici";
import { ensureTrailingSlashlessUrl, parseBoolean } from "@agentharbor/config";
import {
  eventListItemSchema,
  eventListQuerySchema,
  runnerListItemSchema,
  runnerListQuerySchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionListQuerySchema,
  statsResponseSchema,
  type EventListItem,
  type RunnerListItem,
  type SessionDetail,
  type SessionListItem,
  type StatsResponse,
} from "@agentharbor/shared";
import type { DashboardFilterOptions, DashboardQuery } from "./dashboard-query";

export interface DashboardData {
  stats: StatsResponse;
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
}

const baseUrl = ensureTrailingSlashlessUrl(process.env.AGENTHARBOR_CONTROL_NODE_URL ?? "https://localhost:8443");
const allowSelfSigned = parseBoolean(process.env.AGENTHARBOR_ALLOW_SELF_SIGNED, true);
const dispatcher = allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

const dashboardListLimits = {
  runners: 12,
  sessions: 10,
  events: 12,
  filterRunners: 100,
} as const;

const toTimestamp = (value: string) => new Date(value).getTime();

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

const withQuery = (path: string, params: Record<string, string | number | undefined>) => `${path}${buildQueryString(params)}`;

async function getJson<T>(path: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    dispatcher,
  } as RequestInit & { dispatcher?: Agent });

  if (!response.ok) {
    throw new Error(`Control node request failed for ${path}: ${response.status}`);
  }

  return schema.parse(await response.json());
}

const buildRunnerFilterOptions = (allRunners: RunnerListItem[]): DashboardFilterOptions => {
  const labels = Array.from(new Set(allRunners.flatMap((runner) => runner.labels))).sort((left, right) =>
    left.localeCompare(right),
  );

  const runners = [...allRunners]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((runner) => ({
      value: runner.id,
      label: runner.environment ? `${runner.name} - ${runner.environment}` : runner.name,
    }));

  return {
    runners,
    labels: labels.map((label) => ({ value: label, label })),
  };
};

const includesSearch = (value: string | null | undefined, search: string) =>
  value?.toLowerCase().includes(search.toLowerCase()) ?? false;

const getLabelRunnerIds = (allRunners: RunnerListItem[], label: string | undefined) => {
  if (!label) {
    return null;
  }

  return new Set(allRunners.filter((runner) => runner.labels.includes(label)).map((runner) => runner.id));
};

const matchesRunnerSearch = (runner: RunnerListItem, search: string | undefined) => {
  if (!search) {
    return true;
  }

  return (
    includesSearch(runner.name, search) ||
    includesSearch(runner.machineName, search) ||
    includesSearch(runner.hostname, search) ||
    includesSearch(runner.os, search) ||
    includesSearch(runner.architecture, search) ||
    includesSearch(runner.environment, search) ||
    runner.labels.some((label) => includesSearch(label, search))
  );
};

const matchesRunnerSelection = (
  runner: RunnerListItem,
  query: DashboardQuery,
  labelRunnerIds: Set<string> | null,
) => {
  if (query.runnerId && runner.id !== query.runnerId) {
    return false;
  }

  if (labelRunnerIds && !labelRunnerIds.has(runner.id)) {
    return false;
  }

  return matchesRunnerSearch(runner, query.search);
};

const resolveScopedRunnerIds = (query: DashboardQuery, labelRunnerIds: Set<string> | null) => {
  if (query.runnerId) {
    if (labelRunnerIds && !labelRunnerIds.has(query.runnerId)) {
      return [];
    }

    return [query.runnerId];
  }

  if (labelRunnerIds) {
    return [...labelRunnerIds];
  }

  return null;
};

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
};

const mergeSessions = (sessionGroups: SessionListItem[][]) =>
  uniqueById(sessionGroups.flat())
    .sort((left, right) => toTimestamp(right.startedAt) - toTimestamp(left.startedAt))
    .slice(0, dashboardListLimits.sessions);

const mergeEvents = (eventGroups: EventListItem[][]) =>
  uniqueById(eventGroups.flat())
    .sort((left, right) => {
      const createdAtDelta = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
      return createdAtDelta !== 0 ? createdAtDelta : right.id.localeCompare(left.id);
    })
    .slice(0, dashboardListLimits.events);

const fetchSessions = async (query: DashboardQuery, scopedRunnerIds: string[] | null) => {
  if (scopedRunnerIds && scopedRunnerIds.length === 0) {
    return [];
  }

  if (scopedRunnerIds) {
    const sessionGroups = await Promise.all(
      scopedRunnerIds.map((runnerId) =>
        getJson(
          withQuery(
            "/v1/sessions",
            sessionListQuerySchema.parse({
              limit: dashboardListLimits.sessions,
              status: query.status,
              agentType: query.agentType,
              runnerId,
              since: query.since,
              search: query.search,
            }),
          ),
          sessionListItemSchema.array(),
        ),
      ),
    );

    return mergeSessions(sessionGroups);
  }

  const sessionQuery = sessionListQuerySchema.parse({
    limit: dashboardListLimits.sessions,
    status: query.status,
    agentType: query.agentType,
    since: query.since,
    search: query.search,
  });

  return getJson(withQuery("/v1/sessions", sessionQuery), sessionListItemSchema.array());
};

const fetchEvents = async (
  query: DashboardQuery,
  scopedRunnerIds: string[] | null,
  sessionIdsForStatus: string[] | null,
) => {
  if (sessionIdsForStatus && sessionIdsForStatus.length === 0) {
    return [];
  }

  if (sessionIdsForStatus) {
    const eventGroups = await Promise.all(
      sessionIdsForStatus.map((sessionId) =>
        getJson(
          withQuery(
            "/v1/events",
            eventListQuerySchema.parse({
              limit: dashboardListLimits.events,
              agentType: query.agentType,
              sessionId,
              since: query.since,
              search: query.search,
            }),
          ),
          eventListItemSchema.array(),
        ),
      ),
    );

    return mergeEvents(eventGroups);
  }

  if (scopedRunnerIds && scopedRunnerIds.length === 0) {
    return [];
  }

  if (scopedRunnerIds) {
    const eventGroups = await Promise.all(
      scopedRunnerIds.map((runnerId) =>
        getJson(
          withQuery(
            "/v1/events",
            eventListQuerySchema.parse({
              limit: dashboardListLimits.events,
              agentType: query.agentType,
              runnerId,
              since: query.since,
              search: query.search,
            }),
          ),
          eventListItemSchema.array(),
        ),
      ),
    );

    return mergeEvents(eventGroups);
  }

  const eventQuery = eventListQuerySchema.parse({
    limit: dashboardListLimits.events,
    agentType: query.agentType,
    since: query.since,
    search: query.search,
  });

  return getJson(withQuery("/v1/events", eventQuery), eventListItemSchema.array());
};

export const getDashboardData = async (
  query: DashboardQuery,
): Promise<{ data: DashboardData; filterOptions: DashboardFilterOptions }> => {
  const runnerQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.runners,
    label: query.label,
    search: query.search,
  });

  const filterOptionQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.filterRunners,
  });

  const [stats, runnerResults, allRunners] = await Promise.all([
    getJson("/v1/stats", statsResponseSchema),
    getJson(withQuery("/v1/runners", runnerQuery), runnerListItemSchema.array()),
    getJson(withQuery("/v1/runners", filterOptionQuery), runnerListItemSchema.array()),
  ]);

  const labelRunnerIds = getLabelRunnerIds(allRunners, query.label);
  const scopedRunnerIds = resolveScopedRunnerIds(query, labelRunnerIds);

  const sessions = await fetchSessions(query, scopedRunnerIds);
  const statusScopedSessionIds = query.status ? sessions.map((session) => session.id) : null;
  const events = await fetchEvents(query, scopedRunnerIds, statusScopedSessionIds);

  const runnerSource = query.runnerId ? allRunners : runnerResults;
  const runners = runnerSource
    .filter((runner) => matchesRunnerSelection(runner, query, labelRunnerIds))
    .slice(0, dashboardListLimits.runners);

  return {
    data: {
      stats,
      runners,
      sessions,
      events,
    },
    filterOptions: buildRunnerFilterOptions(allRunners),
  };
};

export const getSessionDetail = async (id: string): Promise<SessionDetail> =>
  getJson(`/v1/sessions/${id}`, sessionDetailSchema);
