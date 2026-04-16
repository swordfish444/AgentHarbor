import { Agent } from "undici";
import { ensureTrailingSlashlessUrl, parseBoolean } from "@agentharbor/config";
import {
  alertResponseSchema,
  analyticsBreakdownResponseSchema,
  dashboardAggregateQuerySchema,
  eventListItemSchema,
  eventListQuerySchema,
  eventTimeseriesResponseSchema,
  runnerActivityResponseSchema,
  runnerGroupListQuerySchema,
  runnerLabelGroupSchema,
  runnerListItemSchema,
  runnerListQuerySchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionListQuerySchema,
  statsResponseSchema,
  type AlertItem,
  type AnalyticsBreakdownResponse,
  type EventListItem,
  type EventTimeseriesResponse,
  type RunnerActivityResponse,
  type RunnerLabelGroup,
  type RunnerListItem,
  type SessionDetail,
  type SessionListItem,
  type StatsResponse,
} from "@agentharbor/shared";
import type { DashboardFilterOptions, DashboardQuery } from "./dashboard-query";

export interface DashboardAnalytics {
  agentTypes: AnalyticsBreakdownResponse;
  failures: AnalyticsBreakdownResponse;
  runnerActivity: RunnerActivityResponse;
  eventTimeseries: EventTimeseriesResponse;
}

export interface DashboardData {
  stats: StatsResponse;
  runnerGroups: RunnerLabelGroup[];
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
  alerts: AlertItem[];
  analytics: DashboardAnalytics;
}

export class ControlNodeRequestError extends Error {
  readonly status: number;
  readonly path: string;
  readonly responseBody: string;

  constructor(path: string, status: number, responseBody = "") {
    super(`Control node request failed for ${path}: ${status}`);
    this.name = "ControlNodeRequestError";
    this.path = path;
    this.status = status;
    this.responseBody = responseBody;
  }
}

const baseUrl = ensureTrailingSlashlessUrl(process.env.AGENTHARBOR_CONTROL_NODE_URL ?? "https://localhost:8443");
const allowSelfSigned = parseBoolean(process.env.AGENTHARBOR_ALLOW_SELF_SIGNED, true);
const dispatcher = allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

const dashboardListLimits = {
  runners: 100,
  sessions: 100,
  events: 100,
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

const buildAggregateQuery = (query: DashboardQuery) =>
  dashboardAggregateQuerySchema.parse({
    status: query.status,
    agentType: query.agentType,
    runnerId: query.runnerId,
    label: query.label,
    since: query.since,
    search: query.search,
  });

async function getJson<T>(path: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    dispatcher,
  } as RequestInit & { dispatcher?: Agent });
  const responseText = await response.text();

  if (!response.ok) {
    throw new ControlNodeRequestError(path, response.status, responseText);
  }

  const payload = responseText === "" ? null : JSON.parse(responseText);
  return schema.parse(payload);
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

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
};

const narrowRunnerGroups = (runnerGroups: RunnerLabelGroup[], runnerId: string | undefined) => {
  if (!runnerId) {
    return runnerGroups;
  }

  return runnerGroups
    .map((group) => {
      const runners = group.runners.filter((runner) => runner.id === runnerId);

      return {
        ...group,
        runnerCount: runners.length,
        onlineCount: runners.filter((runner) => runner.isOnline).length,
        activeSessionCount: runners.reduce((total, runner) => total + runner.activeSessionCount, 0),
        runners,
      };
    })
    .filter((group) => group.runnerCount > 0);
};

const mergeEvents = (eventGroups: EventListItem[][]) =>
  uniqueById(eventGroups.flat())
    .sort((left, right) => {
      const createdAtDelta = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
      return createdAtDelta !== 0 ? createdAtDelta : right.id.localeCompare(left.id);
    })
    .slice(0, dashboardListLimits.events);

const fetchSessions = async (query: DashboardQuery) => {
  const sessionQuery = sessionListQuerySchema.parse({
    limit: dashboardListLimits.sessions,
    status: query.status,
    agentType: query.agentType,
    runnerId: query.runnerId,
    label: query.label,
    since: query.since,
    search: query.search,
  });

  return getJson(withQuery("/v1/sessions", sessionQuery), sessionListItemSchema.array());
};

const fetchEvents = async (query: DashboardQuery, sessionIdsForStatus: string[] | null) => {
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

  const eventQuery = eventListQuerySchema.parse({
    limit: dashboardListLimits.events,
    agentType: query.agentType,
    runnerId: query.runnerId,
    label: query.label,
    since: query.since,
    search: query.search,
  });

  return getJson(withQuery("/v1/events", eventQuery), eventListItemSchema.array());
};

const fetchAnalytics = async (query: DashboardQuery): Promise<DashboardAnalytics> => {
  const aggregateQuery = buildAggregateQuery(query);
  const [agentTypes, failures, runnerActivity, eventTimeseries] = await Promise.all([
    getJson(withQuery("/v1/analytics/agent-types", aggregateQuery), analyticsBreakdownResponseSchema),
    getJson(withQuery("/v1/analytics/failures", aggregateQuery), analyticsBreakdownResponseSchema),
    getJson(withQuery("/v1/analytics/runners/activity", aggregateQuery), runnerActivityResponseSchema),
    getJson(withQuery("/v1/analytics/events/timeseries", aggregateQuery), eventTimeseriesResponseSchema),
  ]);

  return {
    agentTypes,
    failures,
    runnerActivity,
    eventTimeseries,
  };
};

const fetchAlerts = async (query: DashboardQuery) => {
  const aggregateQuery = buildAggregateQuery(query);
  const response = await getJson(withQuery("/v1/alerts", aggregateQuery), alertResponseSchema);
  return response.items;
};

export const getDashboardData = async (
  query: DashboardQuery,
): Promise<{ data: DashboardData; filterOptions: DashboardFilterOptions }> => {
  const runnerQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.runners,
    runnerId: query.runnerId,
    label: query.label,
    search: query.search,
  });

  const runnerGroupQuery = runnerGroupListQuerySchema.parse({
    limit: dashboardListLimits.runners,
    status: undefined,
    label: query.label,
    search: query.search,
  });

  const filterOptionQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.filterRunners,
  });

  const aggregateQuery = buildAggregateQuery(query);

  const [stats, runnerResults, allRunners, runnerGroupResults, analytics, alerts] = await Promise.all([
    getJson(withQuery("/v1/stats", aggregateQuery), statsResponseSchema),
    getJson(withQuery("/v1/runners", runnerQuery), runnerListItemSchema.array()),
    getJson(withQuery("/v1/runners", filterOptionQuery), runnerListItemSchema.array()),
    getJson(withQuery("/v1/runners/groups", runnerGroupQuery), runnerLabelGroupSchema.array()),
    fetchAnalytics(query),
    fetchAlerts(query),
  ]);

  const sessions = await fetchSessions(query);
  const statusScopedSessionIds = query.status ? sessions.map((session) => session.id) : null;
  const events = await fetchEvents(query, statusScopedSessionIds);
  const runnerGroups = narrowRunnerGroups(runnerGroupResults, query.runnerId);

  return {
    data: {
      stats,
      runnerGroups,
      runners: runnerResults,
      sessions,
      events,
      alerts,
      analytics,
    },
    filterOptions: buildRunnerFilterOptions(allRunners),
  };
};

export const getSessionDetail = async (id: string): Promise<SessionDetail> => getJson(`/v1/sessions/${id}`, sessionDetailSchema);
