import { agentTypes, runnerLabelSchema, sessionStatuses, type AgentType, type SessionStatus } from "@agentharbor/shared";
import { z } from "zod";

export interface DashboardQuery {
  status?: SessionStatus;
  agentType?: AgentType;
  runnerId?: string;
  label?: string;
  search?: string;
  since?: string;
}

export interface DashboardFilterOptions {
  runners: Array<{
    value: string;
    label: string;
  }>;
  labels: Array<{
    value: string;
    label: string;
  }>;
}

export const dashboardTimeRangeOptions = [
  { value: "15m", label: "Last 15 minutes", durationMs: 15 * 60 * 1000 },
  { value: "1h", label: "Last hour", durationMs: 60 * 60 * 1000 },
  { value: "6h", label: "Last 6 hours", durationMs: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", durationMs: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: "all", label: "All time", durationMs: null },
] as const;

export type DashboardTimeRangeValue = (typeof dashboardTimeRangeOptions)[number]["value"];
export type DashboardTimeRangeSelection = DashboardTimeRangeValue | "custom";

const optionalTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalDateTimeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().datetime().optional(),
);

const sessionStatusSchema = z.enum(sessionStatuses);
const agentTypeSchema = z.enum(agentTypes);

const pickFirstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const parseOptionalValue = <T>(schema: z.ZodType<T>, value: string | undefined) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export const normalizeDashboardQuery = (searchParams: Record<string, string | string[] | undefined>): DashboardQuery => {
  const status = parseOptionalValue(sessionStatusSchema.optional(), pickFirstValue(searchParams.status));
  const agentType = parseOptionalValue(agentTypeSchema.optional(), pickFirstValue(searchParams.agentType));
  const runnerId = parseOptionalValue(optionalTextSchema, pickFirstValue(searchParams.runnerId));
  const label = parseOptionalValue(runnerLabelSchema.optional(), pickFirstValue(searchParams.label));
  const search = parseOptionalValue(optionalTextSchema, pickFirstValue(searchParams.search));
  const since = parseOptionalValue(optionalDateTimeSchema, pickFirstValue(searchParams.since));

  return {
    ...(status ? { status } : {}),
    ...(agentType ? { agentType } : {}),
    ...(runnerId ? { runnerId } : {}),
    ...(label ? { label } : {}),
    ...(search ? { search } : {}),
    ...(since ? { since } : {}),
  };
};

export const dashboardQueryToSearchParams = (query: DashboardQuery) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (!value) {
      continue;
    }

    searchParams.set(key, value);
  }

  return searchParams;
};

export const hasActiveDashboardFilters = (query: DashboardQuery) => Object.values(query).some(Boolean);

export const dashboardSessionStatuses = [...sessionStatuses];
export const dashboardAgentTypes = [...agentTypes];

export const dashboardTimeRangeValues = dashboardTimeRangeOptions.map((option) => option.value);

const customTimeRangeToleranceMs = 2 * 60 * 1000;

export const resolveSinceForTimeRange = (range: DashboardTimeRangeValue) => {
  const option = dashboardTimeRangeOptions.find((candidate) => candidate.value === range);

  if (!option || option.durationMs == null) {
    return undefined;
  }

  return new Date(Date.now() - option.durationMs).toISOString();
};

export const inferTimeRangeSelection = (since: string | undefined): DashboardTimeRangeSelection => {
  if (!since) {
    return "all";
  }

  const sinceTimestamp = new Date(since).getTime();

  if (Number.isNaN(sinceTimestamp)) {
    return "custom";
  }

  const deltaMs = Date.now() - sinceTimestamp;
  const matchingPreset = dashboardTimeRangeOptions.find((option) => {
    if (option.durationMs == null) {
      return false;
    }

    return Math.abs(deltaMs - option.durationMs) <= customTimeRangeToleranceMs;
  });

  return matchingPreset?.value ?? "custom";
};
