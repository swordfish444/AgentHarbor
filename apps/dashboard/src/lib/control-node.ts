import { Agent } from "undici";
import { ensureTrailingSlashlessUrl, parseBoolean } from "@agentharbor/config";
import { z } from "zod";

const telemetryPayloadSchema = z.object({
  timestamp: z.string(),
  agentType: z.string(),
  sessionKey: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  durationMs: z.number().nullable().optional(),
  tokenUsage: z.number().nullable().optional(),
  filesTouchedCount: z.number().nullable().optional(),
  status: z.string().optional(),
});

const runnerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  machineName: z.string(),
  hostname: z.string(),
  os: z.string(),
  architecture: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string().nullable(),
  isOnline: z.boolean(),
  activeSessionCount: z.number(),
});

const sessionListItemSchema = z.object({
  id: z.string(),
  runnerId: z.string(),
  runnerName: z.string(),
  agentType: z.string(),
  sessionKey: z.string(),
  status: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  summary: z.string().nullable(),
  tokenUsage: z.number().nullable(),
  durationMs: z.number().nullable(),
  filesTouchedCount: z.number().nullable(),
  eventCount: z.number(),
});

const eventListItemSchema = z.object({
  id: z.string(),
  runnerId: z.string(),
  runnerName: z.string(),
  sessionId: z.string().nullable(),
  sessionKey: z.string().nullable(),
  eventType: z.string(),
  payload: telemetryPayloadSchema,
  createdAt: z.string(),
});

const sessionDetailSchema = sessionListItemSchema.extend({
  events: z.array(eventListItemSchema),
});

const statsResponseSchema = z.object({
  totalRunners: z.number(),
  onlineRunners: z.number(),
  activeSessions: z.number(),
  sessionsLast24h: z.number(),
  eventsLast24h: z.number(),
  failedSessionsLast24h: z.number(),
});

export type DashboardRunner = z.infer<typeof runnerListItemSchema>;
export type DashboardSession = z.infer<typeof sessionListItemSchema>;
export type DashboardEvent = z.infer<typeof eventListItemSchema>;
export type DashboardStats = z.infer<typeof statsResponseSchema>;
export type DashboardSnapshot = {
  stats: DashboardStats;
  runners: DashboardRunner[];
  sessions: DashboardSession[];
  events: DashboardEvent[];
};

const baseUrl = ensureTrailingSlashlessUrl(process.env.AGENTHARBOR_CONTROL_NODE_URL ?? "https://localhost:8443");
const allowSelfSigned = parseBoolean(process.env.AGENTHARBOR_ALLOW_SELF_SIGNED, true);
const dispatcher = allowSelfSigned ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

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

export const getDashboardData = async () => {
  const [stats, runners, sessions, events] = await Promise.all([
    getJson("/v1/stats", statsResponseSchema),
    getJson("/v1/runners?limit=12", runnerListItemSchema.array()),
    getJson("/v1/sessions?limit=10", sessionListItemSchema.array()),
    getJson("/v1/events?limit=12", eventListItemSchema.array()),
  ]);

  return { stats, runners, sessions, events };
};

export const getSessionDetail = async (id: string) => getJson(`/v1/sessions/${id}`, sessionDetailSchema);
