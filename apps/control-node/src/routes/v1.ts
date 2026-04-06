import type { Prisma } from "@prisma/client";
import {
  agentTypes,
  analyticsResponseSchema,
  eventCategories,
  eventListItemSchema,
  eventListQuerySchema,
  heartbeatRequestSchema,
  runnerEnrollmentRequestSchema,
  runnerListQuerySchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionListQuerySchema,
  sessionStatuses,
  statsResponseSchema,
  streamEventEnvelopeSchema,
  telemetryEventPayloadSchema,
  telemetryIngestRequestSchema,
  type EventListItem,
  type SessionListItem,
} from "@agentharbor/shared";
import { z } from "zod";
import { env } from "../env.js";
import { authenticateRunner, issueRunnerToken } from "../lib/auth.js";
import { eventBroadcaster } from "../lib/event-broadcaster.js";
import { prisma } from "../lib/prisma.js";

const parseTimestamp = (value: string) => new Date(value);

const machineFingerprint = (hostname: string, os: string, architecture: string) =>
  `${hostname}:${os}:${architecture}`.toLowerCase();

const sessionStatusFromEvent = (eventType: string) => {
  if (eventType === "agent.session.completed") {
    return "completed";
  }

  if (eventType === "agent.session.failed") {
    return "failed";
  }

  return "running";
};

const isRunnerOnline = (lastSeenAt: Date | null) =>
  Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() <= env.runnerOnlineWindowMs);

const normalizeRunnerStatus = (runner: { status: string; lastSeenAt: Date | null }) => {
  if (isRunnerOnline(runner.lastSeenAt)) {
    return "online";
  }

  if (runner.status === "enrolled") {
    return "enrolled";
  }

  return "offline";
};

const includesSearch = (value: string | null | undefined, search: string) =>
  Boolean(value?.toLowerCase().includes(search.toLowerCase()));

const legacyTelemetryEventPayloadSchema = z
  .object({
    timestamp: z.string().optional(),
    agentType: z.string().optional(),
    sessionKey: z.string().optional(),
    summary: z.string().optional(),
    category: z.string().optional(),
    durationMs: z.number().optional(),
    tokenUsage: z.number().optional(),
    filesTouchedCount: z.number().optional(),
    status: z.string().optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .passthrough();

type RunnerListRecord = {
  id: string;
  name: string;
  machineName: string;
  status: string;
  labels: string[];
  environment: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  machine: {
    hostname: string;
    os: string;
    architecture: string;
  };
  _count: {
    sessions: number;
  };
};

type SessionListRecord = {
  id: string;
  runnerId: string;
  agentType: string;
  sessionKey: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
  tokenUsage: number | null;
  durationMs: number | null;
  filesTouchedCount: number | null;
  runner: {
    name: string;
  };
  _count: {
    telemetryEvents: number;
  };
};

type SessionDetailRecord = {
  id: string;
  runnerId: string;
  agentType: string;
  sessionKey: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
  tokenUsage: number | null;
  durationMs: number | null;
  filesTouchedCount: number | null;
  runner: {
    name: string;
  };
  telemetryEvents: Array<{
    id: string;
    runnerId: string;
    sessionId: string | null;
    eventType: string;
    payloadJson: unknown;
    createdAt: Date;
  }>;
};

type EventListRecord = {
  id: string;
  runnerId: string;
  sessionId: string | null;
  eventType: string;
  payloadJson: unknown;
  createdAt: Date;
  runner: {
    name: string;
  };
  session: {
    sessionKey: string;
  } | null;
};

const serializeRunner = (runner: RunnerListRecord) => ({
  id: runner.id,
  name: runner.name,
  machineName: runner.machineName,
  hostname: runner.machine.hostname,
  os: runner.machine.os,
  architecture: runner.machine.architecture,
  status: normalizeRunnerStatus(runner),
  labels: runner.labels,
  environment: runner.environment,
  createdAt: runner.createdAt.toISOString(),
  updatedAt: runner.updatedAt.toISOString(),
  lastSeenAt: runner.lastSeenAt?.toISOString() ?? null,
  isOnline: isRunnerOnline(runner.lastSeenAt),
  activeSessionCount: runner._count.sessions,
});

const serializeSession = (session: SessionListRecord) => ({
  id: session.id,
  runnerId: session.runnerId,
  runnerName: session.runner.name,
  agentType: session.agentType,
  sessionKey: session.sessionKey,
  status: session.status,
  startedAt: session.startedAt.toISOString(),
  endedAt: session.endedAt?.toISOString() ?? null,
  summary: session.summary,
  tokenUsage: session.tokenUsage,
  durationMs: session.durationMs,
  filesTouchedCount: session.filesTouchedCount,
  eventCount: session._count.telemetryEvents,
});

const serializeEvent = (event: EventListRecord) => ({
  id: event.id,
  runnerId: event.runnerId,
  runnerName: event.runner.name,
  sessionId: event.sessionId,
  sessionKey: event.session?.sessionKey ?? null,
  eventType: event.eventType,
  payload: normalizeStoredPayload(event.payloadJson, event.createdAt),
  createdAt: event.createdAt.toISOString(),
});

const normalizePositiveInteger = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }

  return value;
};

const normalizeStoredPayload = (payloadJson: unknown, createdAt: Date) => {
  const parsed = telemetryEventPayloadSchema.safeParse(payloadJson);
  if (parsed.success) {
    return parsed.data;
  }

  const legacyPayload = legacyTelemetryEventPayloadSchema.safeParse(payloadJson);
  if (!legacyPayload.success) {
    return telemetryEventPayloadSchema.parse({
      timestamp: createdAt.toISOString(),
      agentType: "custom",
    });
  }

  const payload = legacyPayload.data;
  const timestamp = z.string().datetime().safeParse(payload.timestamp).success ? payload.timestamp : createdAt.toISOString();
  const agentType = agentTypes.includes(payload.agentType as (typeof agentTypes)[number])
    ? (payload.agentType as (typeof agentTypes)[number])
    : "custom";
  const category = eventCategories.includes(payload.category as (typeof eventCategories)[number])
    ? (payload.category as (typeof eventCategories)[number])
    : undefined;

  return telemetryEventPayloadSchema.parse({
    timestamp,
    agentType,
    ...(typeof payload.sessionKey === "string" && payload.sessionKey.length > 0 ? { sessionKey: payload.sessionKey } : {}),
    ...(typeof payload.summary === "string" ? { summary: payload.summary } : {}),
    ...(category ? { category } : {}),
    ...(typeof payload.status === "string" ? { status: payload.status } : {}),
    ...(normalizePositiveInteger(payload.durationMs) !== undefined ? { durationMs: normalizePositiveInteger(payload.durationMs) } : {}),
    ...(normalizePositiveInteger(payload.tokenUsage) !== undefined ? { tokenUsage: normalizePositiveInteger(payload.tokenUsage) } : {}),
    ...(normalizePositiveInteger(payload.filesTouchedCount) !== undefined
      ? { filesTouchedCount: normalizePositiveInteger(payload.filesTouchedCount) }
      : {}),
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
  });
};

const eventMatchesFilters = (
  event: ReturnType<typeof serializeEvent>,
  query: z.infer<typeof eventListQuerySchema>,
) => {
  if (query.agentType && event.payload.agentType !== query.agentType) {
    return false;
  }

  if (query.search) {
    return (
      includesSearch(event.eventType, query.search) ||
      includesSearch(event.runnerName, query.search) ||
      includesSearch(event.sessionKey, query.search) ||
      includesSearch(event.payload.summary, query.search) ||
      includesSearch(event.payload.category ?? null, query.search)
    );
  }

  return true;
};

const oneDayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

const buildEventVolumePoints = (timestamps: Date[]) => {
  const bucketDurationMs = 15 * 60 * 1000;
  const bucketCount = 4;
  const now = Date.now();
  const bucketStarts = Array.from({ length: bucketCount }, (_, index) => now - bucketDurationMs * (bucketCount - index));
  const points = bucketStarts.map((bucketStart) => ({
    label: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(bucketStart)),
    value: 0,
  }));

  for (const timestamp of timestamps) {
    const createdAt = timestamp.getTime();

    if (createdAt < bucketStarts[0] || createdAt >= now) {
      continue;
    }

    const bucketIndex = Math.min(Math.floor((createdAt - bucketStarts[0]) / bucketDurationMs), bucketCount - 1);
    if (bucketIndex >= 0) {
      points[bucketIndex]!.value += 1;
    }
  }

  return points;
};

const buildFailureCategoryPoints = (
  events: Array<{
    payloadJson: unknown;
    createdAt: Date;
  }>,
) => {
  const allowedCategories = new Set(["build", "test", "network", "auth", "failure", "recovery"]);
  const counts = new Map<string, number>();

  for (const event of events) {
    const payload = normalizeStoredPayload(event.payloadJson, event.createdAt);
    const category = payload.category;

    if (!category || !allowedCategories.has(category)) {
      continue;
    }

    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label, value]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value,
    }));
};

const syncSessionForEvent = async (
  tx: Prisma.TransactionClient,
  runnerId: string,
  event: z.infer<typeof telemetryIngestRequestSchema>["events"][number],
) => {
  const sessionKey = event.payload.sessionKey;

  if (!sessionKey) {
    return null;
  }

  const timestamp = parseTimestamp(event.payload.timestamp);
  const commonData = {
    runnerId,
    agentType: event.payload.agentType,
    sessionKey,
    summary: event.payload.summary,
    tokenUsage: event.payload.tokenUsage,
    durationMs: event.payload.durationMs,
    filesTouchedCount: event.payload.filesTouchedCount,
  };

  const current = await tx.agentSession.findUnique({
    where: { sessionKey },
  });

  if (!current) {
    return tx.agentSession.create({
      data: {
        ...commonData,
        startedAt: timestamp,
        endedAt: event.eventType === "agent.session.started" ? null : timestamp,
        status: sessionStatusFromEvent(event.eventType),
      },
    });
  }

  return tx.agentSession.update({
    where: { id: current.id },
    data: {
      agentType: event.payload.agentType,
      summary: event.payload.summary ?? current.summary,
      tokenUsage: event.payload.tokenUsage ?? current.tokenUsage,
      durationMs: event.payload.durationMs ?? current.durationMs,
      filesTouchedCount: event.payload.filesTouchedCount ?? current.filesTouchedCount,
      status: sessionStatusFromEvent(event.eventType) as (typeof sessionStatuses)[number],
      endedAt:
        event.eventType === "agent.session.completed" || event.eventType === "agent.session.failed"
          ? timestamp
          : current.endedAt,
    },
  });
};

export const registerV1Routes = async (app: any) => {
  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      service: "agentharbor-control-node",
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/v1/enroll", async (request: any, reply: any) => {
    const body = runnerEnrollmentRequestSchema.parse(request.body);
    const fingerprint = machineFingerprint(body.machine.hostname, body.machine.os, body.machine.architecture);
    const machine = await prisma.machine.upsert({
      where: { fingerprint },
      update: {
        hostname: body.machine.hostname,
        os: body.machine.os,
        architecture: body.machine.architecture,
      },
      create: {
        hostname: body.machine.hostname,
        os: body.machine.os,
        architecture: body.machine.architecture,
        fingerprint,
      },
    });

    const token = issueRunnerToken(env.tokenTtlDays);
    const runner = await prisma.runner.create({
      data: {
        name: body.runnerName,
        machineName: machine.hostname,
        machineId: machine.id,
        status: "enrolled",
        labels: body.labels ?? [],
        environment: body.environment ?? null,
        tokens: {
          create: {
            tokenHash: token.tokenHash,
            expiresAt: token.expiresAt,
          },
        },
      },
    });

    return reply.send({
      runner: {
        id: runner.id,
        name: runner.name,
        machineName: runner.machineName,
        status: runner.status,
        labels: runner.labels,
        environment: runner.environment,
        createdAt: runner.createdAt.toISOString(),
      },
      credentials: {
        runnerId: runner.id,
        token: token.token,
        issuedAt: runner.createdAt.toISOString(),
        expiresAt: token.expiresAt?.toISOString() ?? null,
      },
    });
  });

  app.post("/v1/heartbeat", async (request: any, reply: any) => {
    const runner = await authenticateRunner(request.headers.authorization);
    if (!runner) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const body = heartbeatRequestSchema.parse(request.body);
    const now = parseTimestamp(body.timestamp);

    await prisma.$transaction(async (tx) => {
      await tx.runner.update({
        where: { id: runner.id },
        data: {
          status: "online",
          lastSeenAt: now,
        },
      });

      await tx.telemetryEvent.create({
        data: {
          runnerId: runner.id,
          eventType: "runner.heartbeat",
          payloadJson: {
            ...body,
            agentType: "automation",
          },
          createdAt: now,
        },
      });
    });

    eventBroadcaster.publish({
      type: "runner.heartbeat.recorded",
      occurredAt: now.toISOString(),
      payload: {
        runnerId: runner.id,
        runnerName: runner.name,
        activeSessionCount: body.activeSessionCount ?? 0,
        timestamp: now.toISOString(),
      },
    });

    eventBroadcaster.publish({
      type: "stats.hint",
      occurredAt: now.toISOString(),
      payload: {
        reason: "heartbeat",
        timestamp: now.toISOString(),
        runnerId: runner.id,
      },
    });

    return reply.send({ ok: true });
  });

  app.post("/v1/telemetry", async (request: any, reply: any) => {
    const runner = await authenticateRunner(request.headers.authorization);
    if (!runner) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const body = telemetryIngestRequestSchema.parse(request.body);
    const touchedSessionIds = new Set<string>();
    const createdStreamEvents: EventListItem[] = [];

    await prisma.$transaction(async (tx) => {
      for (const event of body.events) {
        const session = await syncSessionForEvent(tx, runner.id, event);
        const createdEvent = await tx.telemetryEvent.create({
          data: {
            runnerId: runner.id,
            sessionId: session?.id ?? null,
            eventType: event.eventType,
            payloadJson: event.payload,
            createdAt: parseTimestamp(event.payload.timestamp),
          },
        });

        if (session?.id) {
          touchedSessionIds.add(session.id);
        }

        createdStreamEvents.push(
          eventListItemSchema.parse({
          id: createdEvent.id,
          runnerId: runner.id,
          runnerName: runner.name,
          sessionId: session?.id ?? null,
          sessionKey: event.payload.sessionKey ?? null,
          eventType: event.eventType,
          payload: telemetryEventPayloadSchema.parse(event.payload),
          createdAt: createdEvent.createdAt.toISOString(),
          }),
        );
      }

      await tx.runner.update({
        where: { id: runner.id },
        data: {
          status: "online",
          lastSeenAt: new Date(),
        },
      });
    });

    const updatedSessions =
      touchedSessionIds.size === 0
        ? []
        : await prisma.agentSession.findMany({
            where: {
              id: {
                in: [...touchedSessionIds],
              },
            },
            include: {
              runner: true,
              _count: {
                select: {
                  telemetryEvents: true,
                },
              },
            },
          });

    for (const event of createdStreamEvents) {
      eventBroadcaster.publish({
        type: "telemetry.event.created",
        occurredAt: event.createdAt,
        payload: event,
      });
    }

    for (const session of updatedSessions) {
      const payload: SessionListItem = sessionListItemSchema.parse(serializeSession(session as SessionListRecord));
      eventBroadcaster.publish({
        type: "session.updated",
        occurredAt: payload.endedAt ?? payload.startedAt,
        payload,
      });
    }

    eventBroadcaster.publish({
      type: "stats.hint",
      occurredAt: new Date().toISOString(),
      payload: {
        reason: "telemetry",
        timestamp: new Date().toISOString(),
        runnerId: runner.id,
        eventType: body.events[body.events.length - 1]?.eventType,
        sessionId: updatedSessions[updatedSessions.length - 1]?.id,
      },
    });

    return reply.send({ accepted: body.events.length });
  });

  app.get("/v1/stream", async (request: any, reply: any) => {
    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    reply.raw.write("retry: 3000\n");
    reply.raw.write(": connected\n\n");

    const unsubscribe = eventBroadcaster.subscribe((event) => {
      const payload = streamEventEnvelopeSchema.parse(event);
      reply.raw.write(`event: ${payload.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      reply.raw.write(`: keep-alive ${Date.now()}\n\n`);
    }, 15_000);

    request.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      reply.raw.end();
    });
  });

  app.get("/v1/runners", async (request: any) => {
    const query = runnerListQuerySchema.parse(request.query);
    const runnerSearch = query.search;
    const runners = await prisma.runner.findMany({
      where: {
        ...(query.label
          ? {
              labels: {
                has: query.label,
              },
            }
          : {}),
        ...(runnerSearch
          ? {
              OR: [
                { name: { contains: runnerSearch, mode: "insensitive" } },
                { machineName: { contains: runnerSearch, mode: "insensitive" } },
                { environment: { contains: runnerSearch, mode: "insensitive" } },
                {
                  machine: {
                    is: {
                      OR: [
                        { hostname: { contains: runnerSearch, mode: "insensitive" } },
                        { os: { contains: runnerSearch, mode: "insensitive" } },
                        { architecture: { contains: runnerSearch, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        machine: true,
        _count: {
          select: {
            sessions: {
              where: {
                status: "running",
              },
            },
          },
        },
      },
    });

    const filteredRunners = runners
      .map((runner) => serializeRunner(runner as RunnerListRecord))
      .filter((runner) => {
        // Online/offline is derived from lastSeenAt, so status filtering stays post-query.
        if (query.status && runner.status !== query.status) {
          return false;
        }

        if (runnerSearch) {
          return runner.labels.some((label) => includesSearch(label, runnerSearch));
        }

        return true;
      });

    return filteredRunners.slice(0, query.limit ?? 25);
  });

  app.get("/v1/sessions", async (request: any) => {
    const query = sessionListQuerySchema.parse(request.query);
    const where: Prisma.AgentSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.agentType ? { agentType: query.agentType } : {}),
      ...(query.runnerId ? { runnerId: query.runnerId } : {}),
      ...(query.since ? { startedAt: { gte: new Date(query.since) } } : {}),
      ...(query.search
        ? {
            OR: [
              { sessionKey: { contains: query.search, mode: "insensitive" } },
              { summary: { contains: query.search, mode: "insensitive" } },
              { runner: { is: { name: { contains: query.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const sessions = await prisma.agentSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: query.limit ?? 25,
      include: {
        runner: true,
        _count: {
          select: {
            telemetryEvents: true,
          },
        },
      },
    });

    return sessions.map((session) => serializeSession(session as SessionListRecord));
  });

  app.get("/v1/sessions/:id", async (request: any, reply: any) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const session = await prisma.agentSession.findUnique({
      where: { id: params.id },
      include: {
        runner: true,
        telemetryEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const detail = session as unknown as SessionDetailRecord;
    const payload = {
      id: detail.id,
      runnerId: detail.runnerId,
      runnerName: detail.runner.name,
      agentType: detail.agentType,
      sessionKey: detail.sessionKey,
      status: detail.status,
      startedAt: detail.startedAt.toISOString(),
      endedAt: detail.endedAt?.toISOString() ?? null,
      summary: detail.summary,
      tokenUsage: detail.tokenUsage,
      durationMs: detail.durationMs,
      filesTouchedCount: detail.filesTouchedCount,
      eventCount: detail.telemetryEvents.length,
      events: detail.telemetryEvents.map((event) => ({
        id: event.id,
        runnerId: event.runnerId,
        runnerName: detail.runner.name,
        sessionId: event.sessionId,
        sessionKey: detail.sessionKey,
        eventType: event.eventType,
        payload: normalizeStoredPayload(event.payloadJson, event.createdAt),
        createdAt: event.createdAt.toISOString(),
      })),
    };

    return reply.send(sessionDetailSchema.parse(payload));
  });

  app.get("/v1/events", async (request: any) => {
    const query = eventListQuerySchema.parse(request.query);
    const limit = query.limit ?? 50;
    const batchSize = query.search || query.agentType ? 200 : limit;
    const where: Prisma.TelemetryEventWhereInput = {
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.runnerId ? { runnerId: query.runnerId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.since ? { createdAt: { gte: new Date(query.since) } } : {}),
    };
    const filteredEvents: Array<ReturnType<typeof serializeEvent>> = [];
    let skip = 0;

    while (filteredEvents.length < limit) {
      const events = await prisma.telemetryEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: batchSize,
        include: {
          runner: true,
          session: true,
        },
      });

      if (events.length === 0) {
        break;
      }

      const matchingEvents = events
        .map((event) => serializeEvent(event as unknown as EventListRecord))
        .filter((event) => eventMatchesFilters(event, query));

      filteredEvents.push(...matchingEvents);
      skip += events.length;

      if (events.length < batchSize) {
        break;
      }
    }

    return filteredEvents.slice(0, limit);
  });

  app.get("/v1/stats", async () => {
    const since = oneDayAgo();

    const [totalRunners, activeSessions, sessionsLast24h, eventsLast24h, failedSessionsLast24h, runners] = await Promise.all([
      prisma.runner.count(),
      prisma.agentSession.count({ where: { status: "running" } }),
      prisma.agentSession.count({ where: { startedAt: { gte: since } } }),
      prisma.telemetryEvent.count({ where: { createdAt: { gte: since } } }),
      prisma.agentSession.count({ where: { status: "failed", startedAt: { gte: since } } }),
      prisma.runner.findMany({ select: { lastSeenAt: true } }),
    ]);

    return statsResponseSchema.parse({
      totalRunners,
      onlineRunners: runners.filter((runner) => isRunnerOnline(runner.lastSeenAt)).length,
      activeSessions,
      sessionsLast24h,
      eventsLast24h,
      failedSessionsLast24h,
    });
  });

  app.get("/v1/analytics", async () => {
    const since = oneDayAgo();
    const eventVolumeSince = new Date(Date.now() - 60 * 60 * 1000);

    const [agentTypeDistribution, runnerActivityRecords, failureCategoryRecords, recentEventTimestamps] = await Promise.all([
      prisma.agentSession.groupBy({
        by: ["agentType"],
        where: {
          startedAt: {
            gte: since,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.runner.findMany({
        include: {
          _count: {
            select: {
              telemetryEvents: {
                where: {
                  createdAt: {
                    gte: since,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.telemetryEvent.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          payloadJson: true,
          createdAt: true,
        },
      }),
      prisma.telemetryEvent.findMany({
        where: {
          createdAt: {
            gte: eventVolumeSince,
          },
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    return analyticsResponseSchema.parse({
      sections: [
        {
          id: "agent-type-distribution",
          title: "Sessions by agent type",
          description: "24-hour session distribution across the agent fleet.",
          points: agentTypeDistribution
            .sort((left, right) => right._count._all - left._count._all || left.agentType.localeCompare(right.agentType))
            .map((entry) => ({
              label: entry.agentType,
              value: entry._count._all,
            })),
        },
        {
          id: "event-volume",
          title: "Recent event volume",
          description: "Telemetry events recorded across the last hour in 15-minute buckets.",
          points: buildEventVolumePoints(recentEventTimestamps.map((entry) => entry.createdAt)),
        },
        {
          id: "runner-activity",
          title: "Runner activity",
          description: "Most active runners over the last 24 hours by event count.",
          points: runnerActivityRecords
            .map((runner) => ({
              label: runner.name,
              value: runner._count.telemetryEvents,
            }))
            .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
            .slice(0, 5),
        },
        {
          id: "failure-categories",
          title: "Failure categories",
          description: "Recent failure-oriented categories extracted from structured telemetry.",
          points: buildFailureCategoryPoints(failureCategoryRecords),
        },
      ],
    });
  });
};
