import type { Prisma } from "@prisma/client";
import {
  alertResponseSchema,
  agentTypes,
  analyticsBreakdownResponseSchema,
  dashboardAggregateQuerySchema,
  eventCategories,
  eventTimeseriesResponseSchema,
  eventListQuerySchema,
  heartbeatRequestSchema,
  runnerActivityResponseSchema,
  runnerEnrollmentRequestSchema,
  runnerGroupListQuerySchema,
  runnerListQuerySchema,
  runnerTokenRevocationResponseSchema,
  sessionDetailSchema,
  sessionListQuerySchema,
  sessionStatuses,
  statsResponseSchema,
  telemetryEventPayloadSchema,
  telemetryIngestRequestSchema,
} from "@agentharbor/shared";
import { z } from "zod";
import { env } from "../env.js";
import { authenticateAdminRequest, authenticateRunner, issueRunnerToken } from "../lib/auth.js";
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

const analyticsWindowMs = 24 * 60 * 60 * 1000;
const eventTimeseriesBucketMs = 5 * 60 * 1000;
const runnerActivityLimit = 10;
const failureAnalyticsCategories = new Set<(typeof eventCategories)[number]>(["build", "test", "auth", "network", "failure"]);

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

type AggregateQuery = z.infer<typeof dashboardAggregateQuerySchema>;

type AggregateEventView = {
  runnerId: string;
  runnerName: string;
  sessionId: string | null;
  sessionKey: string | null;
  sessionStatus: string | null;
  sessionAgentType: string | null;
  eventType: string;
  payload: ReturnType<typeof normalizeStoredPayload>;
  createdAt: Date;
};

type AggregateSessionView = {
  id: string;
  runnerId: string;
  runnerName: string;
  agentType: string;
  sessionKey: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
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

const matchesRunnerSearch = (runner: ReturnType<typeof serializeRunner>, search: string | undefined) => {
  if (!search) {
    return true;
  }

  return (
    includesSearch(runner.name, search) ||
    includesSearch(runner.machineName, search) ||
    includesSearch(runner.hostname, search) ||
    includesSearch(runner.os, search) ||
    includesSearch(runner.architecture, search) ||
    includesSearch(runner.environment, search) ||
    runner.labels.some((label) => includesSearch(label, search))
  );
};

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

const serializeAggregateSession = (session: {
  id: string;
  runnerId: string;
  agentType: string;
  sessionKey: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
  runner: {
    name: string;
  };
}): AggregateSessionView => ({
  id: session.id,
  runnerId: session.runnerId,
  runnerName: session.runner.name,
  agentType: session.agentType,
  sessionKey: session.sessionKey,
  status: session.status,
  startedAt: session.startedAt,
  endedAt: session.endedAt,
  summary: session.summary,
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
    ...(query.limit && !query.search ? { take: query.limit } : {}),
    include: runnerListInclude,
  });

  const serializedRunners = runners.map((runner) => serializeRunner(runner as RunnerListRecord));

  return serializedRunners
    .filter((runner) => matchesRunnerSearch(runner, query.search))
    .slice(0, query.limit ?? serializedRunners.length);
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

const resolveAnalyticsSince = (query: { since?: string }) =>
  new Date(query.since ?? Date.now() - analyticsWindowMs);

const sessionOverlapsSince = (
  session: { startedAt: Date; endedAt: Date | null; status: string },
  since: Date,
) =>
  session.startedAt >= since ||
  (session.endedAt != null && session.endedAt >= since) ||
  (session.endedAt == null && session.status === "running");

const matchesSessionSearch = (session: AggregateSessionView, search: string | undefined) => {
  if (!search) {
    return true;
  }

  return (
    includesSearch(session.sessionKey, search) ||
    includesSearch(session.summary, search) ||
    includesSearch(session.runnerName, search)
  );
};

const buildSessionWhere = (
  query: {
    status?: (typeof sessionStatuses)[number];
    agentType?: (typeof agentTypes)[number];
    runnerId?: string;
    label?: string;
    since?: string;
    search?: string;
  },
  options: {
    ignoreStatus?: boolean;
    ignoreSince?: boolean;
    overrideStatus?: (typeof sessionStatuses)[number];
    since?: Date;
    sinceMode?: "started" | "activity";
  } = {},
) => {
  const effectiveStatus = options.overrideStatus ?? (options.ignoreStatus ? undefined : query.status);
  const effectiveSince = options.ignoreSince ? undefined : options.since ?? (query.since ? new Date(query.since) : undefined);
  const filters: Prisma.AgentSessionWhereInput[] = [];

  if (effectiveStatus) {
    filters.push({ status: effectiveStatus });
  }

  if (query.agentType) {
    filters.push({ agentType: query.agentType });
  }

  if (query.runnerId) {
    filters.push({ runnerId: query.runnerId });
  }

  if (query.label) {
    filters.push({ runner: { is: { labels: { has: query.label } } } });
  }

  if (effectiveSince) {
    if (options.sinceMode === "started") {
      filters.push({ startedAt: { gte: effectiveSince } });
    } else {
      filters.push({
        OR: [
          { startedAt: { gte: effectiveSince } },
          { endedAt: { gte: effectiveSince } },
          { AND: [{ endedAt: null }, { status: "running" }] },
        ],
      });
    }
  }

  if (query.search) {
    filters.push({
      OR: [
        { sessionKey: { contains: query.search, mode: "insensitive" } },
        { summary: { contains: query.search, mode: "insensitive" } },
        { runner: { is: { name: { contains: query.search, mode: "insensitive" } } } },
      ],
    });
  }

  return (filters.length > 0 ? { AND: filters } : {}) satisfies Prisma.AgentSessionWhereInput;
};

const buildAggregateEventWhere = (query: AggregateQuery, since: Date) => {
  return {
    ...(query.runnerId ? { runnerId: query.runnerId } : {}),
    ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
    createdAt: { gte: since },
  } satisfies Prisma.TelemetryEventWhereInput;
};

const matchesAggregateEventQuery = (
  event: AggregateEventView,
  query: AggregateQuery,
  options: {
    ignoreStatus?: boolean;
    overrideStatus?: (typeof sessionStatuses)[number];
    ignoreSearch?: boolean;
  } = {},
) => {
  const effectiveStatus = options.overrideStatus ?? (options.ignoreStatus ? undefined : query.status);

  if (effectiveStatus && event.sessionStatus !== effectiveStatus) {
    return false;
  }

  if (
    query.agentType &&
    event.sessionAgentType !== query.agentType &&
    event.payload.agentType !== query.agentType
  ) {
    return false;
  }

  if (options.ignoreSearch || !query.search) {
    return true;
  }

  return (
    includesSearch(event.eventType, query.search) ||
    includesSearch(event.runnerName, query.search) ||
    includesSearch(event.sessionKey, query.search) ||
    includesSearch(event.payload.summary, query.search) ||
    includesSearch(event.payload.category ?? null, query.search) ||
    includesSearch(event.payload.status ?? null, query.search)
  );
};

const listAggregateEvents = async (
  query: AggregateQuery,
  options: {
    ignoreStatus?: boolean;
    overrideStatus?: (typeof sessionStatuses)[number];
    ignoreSearch?: boolean;
    since?: Date;
  } = {},
) => {
  const since = options.since ?? resolveAnalyticsSince(query);
  const events = await prisma.telemetryEvent.findMany({
    where: buildAggregateEventWhere(query, since),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      runner: {
        select: {
          name: true,
        },
      },
      session: {
        select: {
          id: true,
          sessionKey: true,
          status: true,
          agentType: true,
        },
      },
    },
  });

  return events
    .map((event) => ({
      runnerId: event.runnerId,
      runnerName: event.runner.name,
      sessionId: event.session?.id ?? null,
      sessionKey: event.session?.sessionKey ?? null,
      sessionStatus: event.session?.status ?? null,
      sessionAgentType: event.session?.agentType ?? null,
      eventType: event.eventType,
      payload: normalizeStoredPayload(event.payloadJson, event.createdAt),
      createdAt: event.createdAt,
    }))
    .filter((event) => matchesAggregateEventQuery(event, query, options));
};

const getAggregateScope = async (
  query: AggregateQuery,
  options: {
    ignoreStatus?: boolean;
    overrideStatus?: (typeof sessionStatuses)[number];
    ignoreSearch?: boolean;
  } = {},
) => {
  const since = resolveAnalyticsSince(query);
  const effectiveStatus = options.overrideStatus ?? (options.ignoreStatus ? undefined : query.status);
  const [runners, events, sessions] = await Promise.all([
    listFilteredRunners({
      runnerId: query.runnerId,
      label: query.label,
    }),
    listAggregateEvents(query, {
      ignoreStatus: options.ignoreStatus,
      overrideStatus: options.overrideStatus,
      ignoreSearch: options.ignoreSearch,
      since,
    }),
    prisma.agentSession.findMany({
      where: {
        ...(query.runnerId ? { runnerId: query.runnerId } : {}),
        ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
      },
      orderBy: [{ endedAt: "desc" }, { startedAt: "desc" }],
      include: {
        runner: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const aggregateSessions = sessions
    .map((session) => serializeAggregateSession(session))
    .filter((session) => {
      if (!sessionOverlapsSince(session, since)) {
        return false;
      }

      if (query.agentType && session.agentType !== query.agentType) {
        return false;
      }

      if (effectiveStatus && session.status !== effectiveStatus) {
        return false;
      }

      return true;
    });

  if (!options.ignoreSearch && query.search) {
    const matchingEventSessionIds = new Set(events.flatMap((event) => (event.sessionId ? [event.sessionId] : [])));
    const filteredSessions = aggregateSessions.filter(
      (session) => matchesSessionSearch(session, query.search) || matchingEventSessionIds.has(session.id),
    );
    const activityRunnerIds = new Set<string>([
      ...filteredSessions.map((session) => session.runnerId),
      ...events.map((event) => event.runnerId),
    ]);
    const runnerSearchIds = new Set(runners.filter((runner) => matchesRunnerSearch(runner, query.search)).map((runner) => runner.id));
    const requireActivityMatch = Boolean(query.agentType || effectiveStatus || query.since);
    const matchingRunnerIds = new Set(activityRunnerIds);

    if (!requireActivityMatch) {
      for (const runnerId of runnerSearchIds) {
        matchingRunnerIds.add(runnerId);
      }
    } else {
      for (const runnerId of runnerSearchIds) {
        if (activityRunnerIds.has(runnerId)) {
          matchingRunnerIds.add(runnerId);
        }
      }
    }

    return {
      since,
      events,
      sessions: filteredSessions,
      runners: runners.filter((runner) => matchingRunnerIds.has(runner.id)),
    };
  }

  if (!query.agentType && !effectiveStatus && !query.since) {
    return {
      since,
      events,
      sessions: aggregateSessions,
      runners,
    };
  }

  const activityRunnerIds = new Set<string>([
    ...aggregateSessions.map((session) => session.runnerId),
    ...events.map((event) => event.runnerId),
  ]);

  return {
    since,
    events,
    sessions: aggregateSessions,
    runners: runners.filter((runner) => activityRunnerIds.has(runner.id)),
  };
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const toAnalyticsBreakdown = (counts: Map<string, number>) =>
  [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
    }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.key.localeCompare(right.key);
    });

const isFailureAnalyticsEvent = (
  eventType: string,
  payload: ReturnType<typeof normalizeStoredPayload>,
) =>
  eventType === "agent.session.failed" ||
  payload.status === "failed" ||
  payload.status === "blocked" ||
  Boolean(payload.status == null && payload.category && failureAnalyticsCategories.has(payload.category));

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

  app.post("/v1/runners/:id/revoke-tokens", async (request: any, reply: any) => {
    const adminAuth = authenticateAdminRequest(request.headers.authorization);
    if (adminAuth === "unconfigured") {
      return reply.code(503).send({ error: "Control node admin token is not configured" });
    }

    if (adminAuth !== "ok") {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const revokedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const runner = await tx.runner.findUnique({
        where: { id: params.id },
        select: { id: true },
      });

      if (!runner) {
        return null;
      }

      const update = await tx.runnerToken.updateMany({
        where: {
          runnerId: runner.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: revokedAt } }],
        },
        data: { revokedAt },
      });

      return {
        runnerId: runner.id,
        revokedCount: update.count,
        revokedAt: revokedAt.toISOString(),
      };
    });

    if (!result) {
      return reply.code(404).send({ error: "Runner not found" });
    }

    return runnerTokenRevocationResponseSchema.parse(result);
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
    const sessions = await prisma.agentSession.findMany({
      where: buildSessionWhere(query),
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

  app.get("/v1/analytics/agent-types", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const { sessions } = await getAggregateScope(query);
    const counts = new Map<string, number>();

    for (const session of sessions) {
      counts.set(session.agentType, (counts.get(session.agentType) ?? 0) + 1);
    }

    return analyticsBreakdownResponseSchema.parse({
      items: toAnalyticsBreakdown(counts),
    });
  });

  app.get("/v1/analytics/failures", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const { events } = await getAggregateScope(query);
    const counts = new Map<string, number>();

    for (const event of events) {
      if (!isFailureAnalyticsEvent(event.eventType, event.payload)) {
        continue;
      }

      const key = event.payload.category ?? "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return analyticsBreakdownResponseSchema.parse({
      items: toAnalyticsBreakdown(counts),
    });
  });

  app.get("/v1/analytics/runners/activity", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const { sessions } = await getAggregateScope(query);
    const counts = new Map<string, { runnerName: string; sessionCount: number }>();

    for (const session of sessions) {
      const current = counts.get(session.runnerId) ?? {
        runnerName: session.runnerName,
        sessionCount: 0,
      };
      current.sessionCount += 1;
      counts.set(session.runnerId, current);
    }

    return runnerActivityResponseSchema.parse({
      items: [...counts.entries()]
        .map(([runnerId, value]) => ({
          runnerId,
          runnerName: value.runnerName,
          sessionCount: value.sessionCount,
        }))
        .sort((left, right) => {
          if (left.sessionCount !== right.sessionCount) {
            return right.sessionCount - left.sessionCount;
          }

          return left.runnerName.localeCompare(right.runnerName);
        })
        .slice(0, runnerActivityLimit),
    });
  });

  app.get("/v1/analytics/events/timeseries", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const { events } = await getAggregateScope(query);
    const counts = new Map<number, number>();

    for (const event of events) {
      const bucketStart = Math.floor(event.createdAt.getTime() / eventTimeseriesBucketMs) * eventTimeseriesBucketMs;
      counts.set(bucketStart, (counts.get(bucketStart) ?? 0) + 1);
    }

    return eventTimeseriesResponseSchema.parse({
      points: [...counts.entries()]
        .map(([bucketStart, count]) => ({
          bucketStart: new Date(bucketStart).toISOString(),
          count,
        }))
        .sort((left, right) => left.bucketStart.localeCompare(right.bucketStart)),
    });
  });

  app.get("/v1/alerts", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const [baseScope, runningScope, failedScope] = await Promise.all([
      getAggregateScope(query),
      getAggregateScope(query, {
        ignoreStatus: true,
        overrideStatus: "running",
      }),
      getAggregateScope(query, {
        ignoreStatus: true,
        overrideStatus: "failed",
      }),
    ]);

    const visibleRunners = baseScope.runners;
    const aggregateEvents = baseScope.events;
    const activeSessions = runningScope.sessions.length;
    const failedSessionCount = failedScope.sessions.length;
    const latestFailedSession = [...failedScope.sessions].sort((left, right) => {
      const leftTimestamp = (left.endedAt ?? left.startedAt).getTime();
      const rightTimestamp = (right.endedAt ?? right.startedAt).getTime();
      return rightTimestamp - leftTimestamp;
    })[0];

    const offlineRunners = visibleRunners.filter((runner) => !runner.isOnline);
    const alerts: Array<{
      id: string;
      severity: "critical" | "warning" | "info";
      title: string;
      detail: string;
      count?: number;
      href?: string;
    }> = [];

    if (failedSessionCount > 0) {
      alerts.push({
        id: "failed-sessions",
        severity: "critical",
        title: `${failedSessionCount} failed ${pluralize(failedSessionCount, "session")} in the active window`,
        detail:
          latestFailedSession?.summary ??
          (latestFailedSession
            ? `${latestFailedSession.runnerName} most recently failed on ${latestFailedSession.sessionKey}.`
            : "One or more sessions have failed in the current fleet slice."),
        count: failedSessionCount,
        ...(latestFailedSession ? { href: `/session/${latestFailedSession.id}` } : {}),
      });
    }

    if (offlineRunners.length > 0) {
      const primaryOfflineRunner = offlineRunners[0];
      const sampleNames = offlineRunners
        .slice(0, 2)
        .map((runner) => runner.name)
        .join(", ");
      const overflow = offlineRunners.length - Math.min(offlineRunners.length, 2);

      alerts.push({
        id: "runner-heartbeats",
        severity: "warning",
        title: `${offlineRunners.length} ${pluralize(offlineRunners.length, "runner")} awaiting heartbeat`,
        detail:
          overflow > 0
            ? `${sampleNames}, plus ${overflow} more runner${overflow === 1 ? "" : "s"}, are currently offline or idle.`
            : `${sampleNames} ${offlineRunners.length === 1 ? "is" : "are"} currently offline or idle.`,
        count: offlineRunners.length,
        ...(offlineRunners.length === 1 && primaryOfflineRunner ? { href: `/?runnerId=${primaryOfflineRunner.id}` } : {}),
      });
    }

    if (activeSessions > 0) {
      alerts.push({
        id: "live-activity",
        severity: "info",
        title: `${activeSessions} running ${pluralize(activeSessions, "session")}`,
        detail: "Live work is still progressing in the current dashboard slice.",
        count: activeSessions,
      });
    }

    if (alerts.length === 0) {
      alerts.push(
        aggregateEvents.length === 0
          ? {
              id: "awaiting-activity",
              severity: "info",
              title: "Awaiting fresh telemetry",
              detail: "No telemetry has landed for the current dashboard slice yet.",
            }
          : {
              id: "healthy-window",
              severity: "info",
              title: "No active operator escalations",
              detail: "The current dashboard slice has telemetry, but no failures or heartbeat gaps need escalation.",
            },
      );
    }

    return alertResponseSchema.parse({
      items: alerts.slice(0, 3),
    });
  });

  app.get("/v1/stats", async (request: any) => {
    const query = dashboardAggregateQuerySchema.parse(request.query);
    const [baseScope, runningScope, failedScope] = await Promise.all([
      getAggregateScope(query),
      getAggregateScope(query, {
        ignoreStatus: true,
        overrideStatus: "running",
      }),
      getAggregateScope(query, {
        ignoreStatus: true,
        overrideStatus: "failed",
      }),
    ]);
    const visibleRunners = baseScope.runners;
    const aggregateEvents = baseScope.events;

    return statsResponseSchema.parse({
      totalRunners: visibleRunners.length,
      onlineRunners: visibleRunners.filter((runner) => runner.isOnline).length,
      activeSessions: runningScope.sessions.length,
      sessionsLast24h: baseScope.sessions.length,
      eventsLast24h: aggregateEvents.length,
      failedSessionsLast24h: failedScope.sessions.length,
    });
  });
};
