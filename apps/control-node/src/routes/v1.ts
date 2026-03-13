import type { Prisma } from "@prisma/client";
import {
  heartbeatRequestSchema,
  runnerEnrollmentRequestSchema,
  sessionDetailSchema,
  sessionStatuses,
  statsResponseSchema,
  telemetryIngestRequestSchema,
} from "@agentharbor/shared";
import { z } from "zod";
import { env } from "../env.js";
import { authenticateRunner, issueRunnerToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

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

    return reply.send({ ok: true });
  });

  app.post("/v1/telemetry", async (request: any, reply: any) => {
    const runner = await authenticateRunner(request.headers.authorization);
    if (!runner) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const body = telemetryIngestRequestSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      for (const event of body.events) {
        const session = await syncSessionForEvent(tx, runner.id, event);
        await tx.telemetryEvent.create({
          data: {
            runnerId: runner.id,
            sessionId: session?.id ?? null,
            eventType: event.eventType,
            payloadJson: event.payload,
            createdAt: parseTimestamp(event.payload.timestamp),
          },
        });
      }

      await tx.runner.update({
        where: { id: runner.id },
        data: {
          status: "online",
          lastSeenAt: new Date(),
        },
      });
    });

    return reply.send({ accepted: body.events.length });
  });

  app.get("/v1/runners", async (request: any) => {
    const query = listQuerySchema.parse(request.query);
    const runners = await prisma.runner.findMany({
      orderBy: { updatedAt: "desc" },
      take: query.limit ?? 25,
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

    return runners.map((runner) => ({
      id: runner.id,
      name: runner.name,
      machineName: runner.machineName,
      hostname: runner.machine.hostname,
      os: runner.machine.os,
      architecture: runner.machine.architecture,
      status: isRunnerOnline(runner.lastSeenAt) ? "online" : runner.status === "enrolled" ? "enrolled" : "offline",
      createdAt: runner.createdAt.toISOString(),
      updatedAt: runner.updatedAt.toISOString(),
      lastSeenAt: runner.lastSeenAt?.toISOString() ?? null,
      isOnline: isRunnerOnline(runner.lastSeenAt),
      activeSessionCount: runner._count.sessions,
    }));
  });

  app.get("/v1/sessions", async (request: any) => {
    const query = listQuerySchema.parse(request.query);
    const sessions = await prisma.agentSession.findMany({
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

    return sessions.map((session) => ({
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
    }));
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

    const payload = {
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
      eventCount: session.telemetryEvents.length,
      events: session.telemetryEvents.map((event) => ({
        id: event.id,
        runnerId: event.runnerId,
        runnerName: session.runner.name,
        sessionId: event.sessionId,
        sessionKey: session.sessionKey,
        eventType: event.eventType,
        payload: event.payloadJson,
        createdAt: event.createdAt.toISOString(),
      })),
    };

    return reply.send(sessionDetailSchema.parse(payload));
  });

  app.get("/v1/events", async (request: any) => {
    const query = listQuerySchema.parse(request.query);
    const events = await prisma.telemetryEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 50,
      include: {
        runner: true,
        session: true,
      },
    });

    return events.map((event) => ({
      id: event.id,
      runnerId: event.runnerId,
      runnerName: event.runner.name,
      sessionId: event.sessionId,
      sessionKey: event.session?.sessionKey ?? null,
      eventType: event.eventType,
      payload: event.payloadJson,
      createdAt: event.createdAt.toISOString(),
    }));
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
