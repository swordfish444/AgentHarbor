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

const getLabelRunnerIds = (allRunners: RunnerListItem[], label: string | undefined) => {
  if (!label) {
    return null;
  }

  return new Set(allRunners.filter((runner) => runner.labels.includes(label)).map((runner) => runner.id));
};

const matchesRunnerSelection = (
  runnerId: string,
  query: DashboardQuery,
  labelRunnerIds: Set<string> | null,
) => {
  if (query.runnerId && runnerId !== query.runnerId) {
    return false;
  }

  if (labelRunnerIds && !labelRunnerIds.has(runnerId)) {
    return false;
  }

  return true;
};

export const getDashboardData = async (
  query: DashboardQuery,
): Promise<{ data: DashboardData; filterOptions: DashboardFilterOptions }> => {
  const runnerQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.runners,
    label: query.label,
    search: query.search,
  });

  const sessionQuery = sessionListQuerySchema.parse({
    limit: dashboardListLimits.sessions,
    status: query.status,
    agentType: query.agentType,
    runnerId: query.runnerId,
    since: query.since,
    search: query.search,
  });

  const eventQuery = eventListQuerySchema.parse({
    limit: dashboardListLimits.events,
    eventType:
      query.status === "failed"
        ? "agent.session.failed"
        : query.status === "completed"
          ? "agent.session.completed"
          : undefined,
    agentType: query.agentType,
    runnerId: query.runnerId,
    since: query.since,
    search: query.search,
  });

  const filterOptionQuery = runnerListQuerySchema.parse({
    limit: dashboardListLimits.filterRunners,
  });

  const [stats, runnerResults, sessionResults, eventResults, allRunners] = await Promise.all([
    getJson("/v1/stats", statsResponseSchema),
    getJson(withQuery("/v1/runners", runnerQuery), runnerListItemSchema.array()),
    getJson(withQuery("/v1/sessions", sessionQuery), sessionListItemSchema.array()),
    getJson(withQuery("/v1/events", eventQuery), eventListItemSchema.array()),
    getJson(withQuery("/v1/runners", filterOptionQuery), runnerListItemSchema.array()),
  ]);

  const labelRunnerIds = getLabelRunnerIds(allRunners, query.label);

  const runners = runnerResults.filter((runner) => matchesRunnerSelection(runner.id, query, labelRunnerIds));
  const sessions = sessionResults.filter((session) => matchesRunnerSelection(session.runnerId, query, labelRunnerIds));
  const events = eventResults.filter((event) => matchesRunnerSelection(event.runnerId, query, labelRunnerIds));

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
