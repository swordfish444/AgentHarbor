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

export const dashboardTimePresets = [
  { value: "", label: "All time" },
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
] as const;

type DashboardTimePresetValue = (typeof dashboardTimePresets)[number]["value"];

const presetDurationsMs: Record<Exclude<DashboardTimePresetValue, "">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

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

export const sinceIsoFromPreset = (preset: DashboardTimePresetValue) => {
  if (preset === "") {
    return undefined;
  }

  return new Date(Date.now() - presetDurationsMs[preset]).toISOString();
};

export const presetFromSince = (since: string | undefined): DashboardTimePresetValue => {
  if (!since) {
    return "";
  }

  const timestamp = new Date(since).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs <= presetDurationsMs["15m"]) {
    return "15m";
  }

  if (ageMs <= presetDurationsMs["1h"]) {
    return "1h";
  }

  if (ageMs <= presetDurationsMs["6h"]) {
    return "6h";
  }

  if (ageMs <= presetDurationsMs["24h"]) {
    return "24h";
  }

  return "";
};

export const dashboardTimePresetLabel = (since: string | undefined) => {
  const preset = presetFromSince(since);
  return dashboardTimePresets.find((option) => option.value === preset)?.label ?? "All time";
};
