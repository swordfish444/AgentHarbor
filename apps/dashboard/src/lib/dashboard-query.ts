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
