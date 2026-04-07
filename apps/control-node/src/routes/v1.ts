import type { Prisma } from "@prisma/client";
import {
  agentTypes,
  eventCategories,
  eventListQuerySchema,
  heartbeatRequestSchema,
  runnerEnrollmentRequestSchema,
  runnerGroupListQuerySchema,
  runnerListQuerySchema,
  sessionDetailSchema,
  sessionListQuerySchema,
  sessionStatuses,
  statsResponseSchema,
  telemetryEventPayloadSchema,
  telemetryIngestRequestSchema,
} from "@agentharbor/shared";
import { z } from "zod";
import { env } from "../env.js";
import { authenticateRunner, issueRunnerToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { formatServerSentEvent, publishStreamEvent, subscribeStream } from "../lib/stream.js";

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

const runnerListInclude = {
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
} satisfies Prisma.RunnerInclude;

const buildRunnerListWhere = (query: {
  runnerId?: string;
  status?: string;
  label?: string;
  search?: string;
}) => {
  const onlineSince = new Date(Date.now() - env.runnerOnlineWindowMs);
  const notOnlineWhere: Prisma.RunnerWhereInput = {
    OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: onlineSince } }],
  };
  const runnerFilters: Prisma.RunnerWhereInput[] = [];

  if (query.status === "online") {
    runnerFilters.push({ lastSeenAt: { gte: onlineSince } });
  }

  if (query.status === "enrolled") {
    runnerFilters.push({
      ...notOnlineWhere,
      status: "enrolled",
    });
  }

  if (query.status === "offline") {
    runnerFilters.push({
      ...notOnlineWhere,
      status: { not: "enrolled" },
    });
  }

  if (query.search) {
    runnerFilters.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { machineName: { contains: query.search, mode: "insensitive" } },
        { environment: { contains: query.search, mode: "insensitive" } },
        { labels: { has: query.search } },
        {
          machine: {
            is: {
              OR: [
                { hostname: { contains: query.search, mode: "insensitive" } },
                { os: { contains: query.search, mode: "insensitive" } },
                { architecture: { contains: query.search, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  return {
    ...(query.runnerId ? { id: query.runnerId } : {}),
    ...(query.label ? { labels: { has: query.label } } : {}),
    ...(runnerFilters.length > 0 ? { AND: runnerFilters } : {}),
  } satisfies Prisma.RunnerWhereInput;
};

const sortGroupedRunners = (runners: ReturnType<typeof serializeRunner>[]) =>
  [...runners].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "online" ? -1 : right.status === "online" ? 1 : left.status.localeCompare(right.status);
    }

    if (left.activeSessionCount !== right.activeSessionCount) {
      return right.activeSessionCount - left.activeSessionCount;
    }

    return left.name.localeCompare(right.name);
  });

const groupRunnersByLabel = (
  runners: ReturnType<typeof serializeRunner>[],
  selectedLabel?: string,
) => {
  const groups = new Map<
    string,
    {
      label: string;
      runnerCount: number;
      onlineCount: number;
      activeSessionCount: number;
      runners: ReturnType<typeof serializeRunner>[];
    }
  >();

  for (const runner of runners) {
    const labels = selectedLabel ? [selectedLabel] : runner.labels.length > 0 ? runner.labels : ["unlabeled"];

    for (const label of labels) {
      const current =
        groups.get(label) ??
        {
          label,
          runnerCount: 0,
          onlineCount: 0,
          activeSessionCount: 0,
          runners: [],
        };

      current.runnerCount += 1;
      current.onlineCount += runner.isOnline ? 1 : 0;
      current.activeSessionCount += runner.activeSessionCount;
      current.runners.push(runner);
      groups.set(label, current);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      runners: sortGroupedRunners(group.runners),
    }))
    .sort((left, right) => {
      if (left.runnerCount !== right.runnerCount) {
        return right.runnerCount - left.runnerCount;
      }

      if (left.onlineCount !== right.onlineCount) {
        return right.onlineCount - left.onlineCount;
      }

      return left.label.localeCompare(right.label);
    });
};

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

const listFilteredRunners = async (query: {
  runnerId?: string;
  limit?: number;
  status?: string;
  label?: string;
  search?: string;
}) => {
  const runners = await prisma.runner.findMany({
    where: buildRunnerListWhere(query),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    ...(query.limit ? { take: query.limit } : {}),
    include: runnerListInclude,
  });

  return runners.map((runner) => serializeRunner(runner as RunnerListRecord));
};

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

const publishStatsRefresh = (reason: string, data: Record<string, unknown>) => {
  publishStreamEvent("stats.refresh", {
    ...data,
    reason,
  });
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

    publishStatsRefresh("runner.enrolled", { runnerId: runner.id });

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

    const { heartbeatEvent, updatedRunner } = await prisma.$transaction(async (tx) => {
      const updatedRunner = await tx.runner.update({
        where: { id: runner.id },
        data: {
          status: "online",
          lastSeenAt: now,
        },
        include: runnerListInclude,
      });

      const heartbeatEvent = await tx.telemetryEvent.create({
        data: {
          runnerId: runner.id,
          eventType: "runner.heartbeat",
          payloadJson: {
            ...body,
            agentType: "automation",
          },
          createdAt: now,
        },
        include: {
          runner: true,
          session: true,
        },
      });

      return { heartbeatEvent, updatedRunner };
    });

    const event = serializeEvent(heartbeatEvent as unknown as EventListRecord);
    const serializedRunner = serializeRunner(updatedRunner as unknown as RunnerListRecord);

    publishStreamEvent("runner.heartbeat", {
      event,
      runner: serializedRunner,
    });
    publishStreamEvent("telemetry.created", { event });
    publishStatsRefresh("runner.heartbeat", { runnerId: runner.id });

    return reply.send({ ok: true });
  });

  app.post("/v1/telemetry", async (request: any, reply: any) => {
    const runner = await authenticateRunner(request.headers.authorization);
    if (!runner) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const body = telemetryIngestRequestSchema.parse(request.body);

    const { telemetryEvents, updatedSessions } = await prisma.$transaction(async (tx) => {
      const telemetryEvents: EventListRecord[] = [];
      const updatedSessionIds = new Set<string>();

      for (const event of body.events) {
        const session = await syncSessionForEvent(tx, runner.id, event);
        const telemetryEvent = await tx.telemetryEvent.create({
          data: {
            runnerId: runner.id,
            sessionId: session?.id ?? null,
            eventType: event.eventType,
            payloadJson: event.payload,
            createdAt: parseTimestamp(event.payload.timestamp),
          },
          include: {
            runner: true,
            session: true,
          },
        });

        telemetryEvents.push(telemetryEvent as unknown as EventListRecord);

        if (session) {
          updatedSessionIds.add(session.id);
        }
      }

      await tx.runner.update({
        where: { id: runner.id },
        data: {
          status: "online",
          lastSeenAt: new Date(),
        },
      });

      const updatedSessions =
        updatedSessionIds.size > 0
          ? await tx.agentSession.findMany({
              where: {
                id: {
                  in: [...updatedSessionIds],
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
            })
          : [];

      return {
        telemetryEvents,
        updatedSessions: updatedSessions as unknown as SessionListRecord[],
      };
    });

    for (const event of telemetryEvents) {
      publishStreamEvent("telemetry.created", {
        event: serializeEvent(event),
      });
    }

    for (const session of updatedSessions) {
      publishStreamEvent("session.updated", {
        session: serializeSession(session),
      });
    }

    publishStatsRefresh("telemetry.ingested", {
      accepted: body.events.length,
      runnerId: runner.id,
    });

    return reply.send({ accepted: body.events.length });
  });

  app.get("/v1/runners", async (request: any) => {
    const query = runnerListQuerySchema.parse(request.query);
    return listFilteredRunners({
      runnerId: query.runnerId,
      limit: query.limit ?? 25,
      status: query.status,
      label: query.label,
      search: query.search,
    });
  });

  app.get("/v1/runners/groups", async (request: any) => {
    const query = runnerGroupListQuerySchema.parse(request.query);
    const runners = await listFilteredRunners({
      status: query.status,
      label: query.label,
      search: query.search,
    });

    return groupRunnersByLabel(runners, query.label).slice(0, query.limit ?? 12);
  });

  app.get("/v1/stream/events", async (request: any, reply: any) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");

    const unsubscribe = subscribeStream((event) => {
      reply.raw.write(formatServerSentEvent(event));
    });

    const keepAlive = setInterval(() => {
      reply.raw.write(": keep-alive\n\n");
    }, 25_000);
    keepAlive.unref?.();

    request.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.get("/v1/sessions", async (request: any) => {
    const query = sessionListQuerySchema.parse(request.query);
    const where: Prisma.AgentSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.agentType ? { agentType: query.agentType } : {}),
      ...(query.runnerId ? { runnerId: query.runnerId } : {}),
      ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
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
      ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
};
