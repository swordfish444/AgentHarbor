import { z } from "zod";

export const agentTypes = ["codex", "claude-code", "cursor", "automation", "custom"] as const;
export type AgentType = (typeof agentTypes)[number];

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

export const machineDescriptorSchema = z.object({
  hostname: z.string().min(1),
  os: z.string().min(1),
  architecture: z.string().min(1),
});

export const runnerEnrollmentRequestSchema = z.object({
  runnerName: z.string().min(2),
  machine: machineDescriptorSchema,
  labels: z.array(z.string()).optional(),
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
    createdAt: z.string(),
  }),
  credentials: runnerTokenResponseSchema,
});
export type RunnerEnrollmentResponse = z.infer<typeof runnerEnrollmentResponseSchema>;

export const telemetryEventPayloadSchema = z.object({
  timestamp: z.string().datetime(),
  agentType: z.enum(agentTypes),
  sessionKey: z.string().min(1).optional(),
  summary: z.string().max(2_000).optional(),
  category: z.string().max(120).optional(),
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

export const runnerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  machineName: z.string(),
  hostname: z.string(),
  os: z.string(),
  architecture: z.string(),
  status: z.enum(runnerStatuses),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string().nullable(),
  isOnline: z.boolean(),
  activeSessionCount: z.number().int().nonnegative(),
});
export type RunnerListItem = z.infer<typeof runnerListItemSchema>;

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

export const sessionDetailSchema = sessionListItemSchema.extend({
  events: z.array(eventListItemSchema),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
