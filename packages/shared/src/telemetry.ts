import { z } from "zod";

export const agentTypes = ["codex", "claude-code", "cursor", "automation", "custom"] as const;
export type AgentType = (typeof agentTypes)[number];

export const eventCategories = [
  "session",
  "planning",
  "implementation",
  "build",
  "test",
  "network",
  "auth",
  "failure",
  "timeout",
  "human-approval",
  "unknown",
  "recovery",
] as const;
export type EventCategory = (typeof eventCategories)[number];

export const telemetryEventTypes = [
  "runner.heartbeat",
  "agent.session.started",
  "agent.prompt.executed",
  "agent.summary.updated",
  "agent.session.completed",
  "agent.session.failed",
] as const;
export type TelemetryEventType = (typeof telemetryEventTypes)[number];

export const runnerStatuses = ["enrolled", "online", "offline"] as const;
export type RunnerStatus = (typeof runnerStatuses)[number];

export const sessionStatuses = ["running", "completed", "failed"] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const runnerLabelSchema = z.string().trim().min(1).max(64);
export const runnerEnvironmentSchema = z.string().trim().min(1).max(64);

const limitQuerySchema = z.coerce.number().int().positive().max(100).optional();
const optionalQueryStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalDateTimeQuerySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().datetime().optional(),
);

export const machineDescriptorSchema = z.object({
  hostname: z.string().min(1),
  os: z.string().min(1),
  architecture: z.string().min(1),
});

export const runnerEnrollmentRequestSchema = z.object({
  runnerName: z.string().min(2),
  machine: machineDescriptorSchema,
  labels: z.array(runnerLabelSchema).optional(),
  environment: runnerEnvironmentSchema.optional(),
});
export type RunnerEnrollmentRequest = z.infer<typeof runnerEnrollmentRequestSchema>;

export const runnerTokenResponseSchema = z.object({
  runnerId: z.string(),
  token: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string().nullable(),
});

export const runnerEnrollmentResponseSchema = z.object({
  runner: z.object({
    id: z.string(),
    name: z.string(),
    machineName: z.string(),
    status: z.enum(runnerStatuses),
    labels: z.array(runnerLabelSchema),
    environment: runnerEnvironmentSchema.nullable(),
    createdAt: z.string(),
  }),
  credentials: runnerTokenResponseSchema,
});
export type RunnerEnrollmentResponse = z.infer<typeof runnerEnrollmentResponseSchema>;

export const runnerTokenRevocationResponseSchema = z.object({
  runnerId: z.string(),
  revokedCount: z.number().int().nonnegative(),
  revokedAt: z.string().datetime(),
});
export type RunnerTokenRevocationResponse = z.infer<typeof runnerTokenRevocationResponseSchema>;

export const telemetryEventPayloadSchema = z.object({
  timestamp: z.string().datetime(),
  agentType: z.enum(agentTypes),
  sessionKey: z.string().min(1).optional(),
  summary: z.string().max(2_000).optional(),
  category: z.enum(eventCategories).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  tokenUsage: z.number().int().nonnegative().optional(),
  filesTouchedCount: z.number().int().nonnegative().optional(),
  status: z.string().max(64).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type TelemetryEventPayload = z.infer<typeof telemetryEventPayloadSchema>;

export const telemetryEventEnvelopeSchema = z.object({
  eventType: z.enum(telemetryEventTypes),
  payload: telemetryEventPayloadSchema,
});
export type TelemetryEventEnvelope = z.infer<typeof telemetryEventEnvelopeSchema>;

export const telemetryIngestRequestSchema = z.object({
  events: z.array(telemetryEventEnvelopeSchema).min(1),
});
export type TelemetryIngestRequest = z.infer<typeof telemetryIngestRequestSchema>;

export const heartbeatRequestSchema = z.object({
  timestamp: z.string().datetime(),
  activeSessionCount: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;

export const statsResponseSchema = z.object({
  totalRunners: z.number().int().nonnegative(),
  onlineRunners: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  sessionsLast24h: z.number().int().nonnegative(),
  eventsLast24h: z.number().int().nonnegative(),
  failedSessionsLast24h: z.number().int().nonnegative(),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

export const analyticsBreakdownResponseSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type AnalyticsBreakdownResponse = z.infer<typeof analyticsBreakdownResponseSchema>;

export const runnerActivityResponseSchema = z.object({
  items: z.array(
    z.object({
      runnerId: z.string(),
      runnerName: z.string(),
      sessionCount: z.number().int().nonnegative(),
    }),
  ),
});
export type RunnerActivityResponse = z.infer<typeof runnerActivityResponseSchema>;

export const eventTimeseriesResponseSchema = z.object({
  points: z.array(
    z.object({
      bucketStart: z.string().datetime(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type EventTimeseriesResponse = z.infer<typeof eventTimeseriesResponseSchema>;

export const runnerListQuerySchema = z.object({
  limit: limitQuerySchema,
  runnerId: optionalQueryStringSchema,
  status: z.enum(runnerStatuses).optional(),
  label: runnerLabelSchema.optional(),
  search: optionalQueryStringSchema,
});
export type RunnerListQuery = z.infer<typeof runnerListQuerySchema>;

export const runnerGroupListQuerySchema = z.object({
  limit: limitQuerySchema,
  status: z.enum(runnerStatuses).optional(),
  label: runnerLabelSchema.optional(),
  search: optionalQueryStringSchema,
});
export type RunnerGroupListQuery = z.infer<typeof runnerGroupListQuerySchema>;

export const sessionListQuerySchema = z.object({
  limit: limitQuerySchema,
  status: z.enum(sessionStatuses).optional(),
  agentType: z.enum(agentTypes).optional(),
  runnerId: optionalQueryStringSchema,
  label: runnerLabelSchema.optional(),
  since: optionalDateTimeQuerySchema,
  search: optionalQueryStringSchema,
});
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

export const eventListQuerySchema = z.object({
  limit: limitQuerySchema,
  eventType: z.enum(telemetryEventTypes).optional(),
  agentType: z.enum(agentTypes).optional(),
  runnerId: optionalQueryStringSchema,
  sessionId: optionalQueryStringSchema,
  label: runnerLabelSchema.optional(),
  since: optionalDateTimeQuerySchema,
  search: optionalQueryStringSchema,
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const runnerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  machineName: z.string(),
  hostname: z.string(),
  os: z.string(),
  architecture: z.string(),
  status: z.enum(runnerStatuses),
  labels: z.array(runnerLabelSchema),
  environment: runnerEnvironmentSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string().nullable(),
  isOnline: z.boolean(),
  activeSessionCount: z.number().int().nonnegative(),
});
export type RunnerListItem = z.infer<typeof runnerListItemSchema>;

export const runnerLabelGroupSchema = z.object({
  label: runnerLabelSchema,
  runnerCount: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
  activeSessionCount: z.number().int().nonnegative(),
  runners: z.array(runnerListItemSchema),
});
export type RunnerLabelGroup = z.infer<typeof runnerLabelGroupSchema>;

export const sessionListItemSchema = z.object({
  id: z.string(),
  runnerId: z.string(),
  runnerName: z.string(),
  agentType: z.enum(agentTypes),
  sessionKey: z.string(),
  status: z.enum(sessionStatuses),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  summary: z.string().nullable(),
  tokenUsage: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  filesTouchedCount: z.number().int().nullable(),
  eventCount: z.number().int().nonnegative(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const eventListItemSchema = z.object({
  id: z.string(),
  runnerId: z.string(),
  runnerName: z.string(),
  sessionId: z.string().nullable(),
  sessionKey: z.string().nullable(),
  eventType: z.enum(telemetryEventTypes),
  payload: telemetryEventPayloadSchema,
  createdAt: z.string(),
});
export type EventListItem = z.infer<typeof eventListItemSchema>;

export const streamEventTypes = ["runner.heartbeat", "telemetry.created", "session.updated", "stats.refresh"] as const;
export type StreamEventType = (typeof streamEventTypes)[number];

export const streamEventSchema = z.object({
  id: z.string(),
  type: z.enum(streamEventTypes),
  emittedAt: z.string().datetime(),
  data: z.unknown(),
});
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const sessionDetailSchema = sessionListItemSchema.extend({
  events: z.array(eventListItemSchema),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
