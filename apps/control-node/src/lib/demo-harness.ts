import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureTrailingSlashlessUrl } from "@agentharbor/config";
import { AgentHarborClient } from "@agentharbor/sdk";
import type { AgentType, TelemetryEventEnvelope, TelemetryEventPayload } from "@agentharbor/shared";
import { buildDemoReplayPlan, createDemoStartValue } from "@agentharbor/shared";
import { prisma } from "./prisma.js";

const demoMachineDescriptor = {
  os: "macOS 15.4",
  architecture: "arm64",
} as const;

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const demoRunnerWhere = {
  OR: [{ environment: "demo" }, { labels: { has: "demo" } }],
};

const buildClient = (baseUrl: string, allowSelfSigned: boolean, runnerToken?: string) =>
  new AgentHarborClient({
    baseUrl: ensureTrailingSlashlessUrl(baseUrl),
    allowSelfSigned,
    ...(runnerToken ? { runnerToken } : {}),
  });

const buildBurstEvent = ({
  eventType,
  agentType,
  timestamp,
  sessionKey,
  summary,
  category,
  status,
  tokenUsage,
  filesTouchedCount,
  metadata,
}: {
  eventType: TelemetryEventEnvelope["eventType"];
  agentType: AgentType;
  timestamp: string;
  sessionKey?: string;
  summary: string;
  category: "session" | "planning" | "implementation" | "build" | "test" | "network" | "auth" | "failure" | "timeout" | "human-approval" | "unknown" | "recovery";
  status?: string;
  tokenUsage?: number;
  filesTouchedCount?: number;
  metadata?: TelemetryEventPayload["metadata"];
}): TelemetryEventEnvelope => ({
  eventType,
  payload: {
    timestamp,
    agentType,
    ...(sessionKey ? { sessionKey } : {}),
    summary,
    category,
    ...(status ? { status } : {}),
    ...(tokenUsage != null ? { tokenUsage } : {}),
    ...(filesTouchedCount != null ? { filesTouchedCount } : {}),
    ...(metadata ? { metadata } : {}),
  },
});

export interface DemoResetResult {
  runnerCount: number;
  sessionCount: number;
  eventCount: number;
  machineCount: number;
}

export interface DemoSeedOptions {
  baseUrl: string;
  allowSelfSigned: boolean;
  demoStartMs?: number;
  nowMs?: number;
}

export interface DemoSeedResult {
  demoStartMs: number;
  runnerCount: number;
  sessionCount: number;
  eventCount: number;
  heartbeatCount: number;
  failedSessionCount: number;
  runningSessionCount: number;
}

export interface DemoBurstOptions {
  baseUrl: string;
  allowSelfSigned: boolean;
  stepDelayMs?: number;
}

export interface DemoBurstResult {
  runnerCount: number;
  eventCount: number;
}

const burstFailureSessionKey = "RR-808";
const burstRecoverySessionKey = "RR-809";

type TelemetryMetadata = NonNullable<TelemetryEventPayload["metadata"]>;

const burstSocketFailureMetadataBase = {
  failureCode: "STREAM-CHECKPOINT-DRIFT",
  rootCause: "The reconnect path advanced the replay cursor before the checkpoint acknowledgement was persisted.",
  trigger: "Live burst rollback drill hit a staging socket reset at the first reconnect boundary.",
  impact: "The rollback drill result is blocked until the checkpoint guard is replayed cleanly.",
  affectedComponent: "control-node event stream",
  traceId: "demo-burst-rr-808",
  evidence: [
    "Socket reset occurred before checkpoint acknowledgement was written.",
    "Replay cursor advanced without a matching persisted telemetry event.",
    "Heartbeat stayed healthy, isolating the issue to stream fan-out instead of runner liveness.",
  ],
  nextActions: [
    "Pause the rollback drill before presenting the replay as valid.",
    "Apply the persisted cursor guard and replay the checkpoint window.",
    "Inspect socket fan-out logs using trace demo-burst-rr-808.",
  ],
} satisfies TelemetryMetadata;

export const buildBurstSocketFailureMetadata = (
  recoverySession?: { id: string; sessionKey: string },
): TelemetryMetadata => ({
  ...burstSocketFailureMetadataBase,
  ...(recoverySession
    ? {
        recoveredFromSessionKey: burstFailureSessionKey,
        remedyActionLabel: "Apply checkpoint guard",
        remedySessionId: recoverySession.id,
        remedySessionKey: recoverySession.sessionKey,
        remedyOutcome: "Recovery replay verifies the checkpoint guard and gets Rollback Raven moving again.",
      }
    : {}),
});

const burstSocketRecoveryMetadata = {
  recoveredFromSessionKey: burstFailureSessionKey,
  failureCode: "STREAM-CHECKPOINT-DRIFT",
  rootCause: "Persisted cursor guard now blocks replay cursor advancement until the checkpoint acknowledgement lands.",
  trigger: "Follow-up replay started after the operator reviewed trace demo-burst-rr-808.",
  impact: "Rollback replay can continue with a verifiable checkpoint trail.",
  affectedComponent: "control-node event stream",
  traceId: "demo-burst-rr-809",
  evidence: [
    "Checkpoint acknowledgement persisted before replay cursor advanced.",
    "Replay window 17 was reprocessed without duplicate fan-out events.",
    "Rollback Raven heartbeat stayed healthy through the guarded retry.",
  ],
  nextActions: [
    "Resume the rollback drill with the persisted cursor guard enabled.",
    "Keep the recovery trace pinned beside the original failure trace.",
  ],
} satisfies TelemetryMetadata;

const attachBurstFailureRemedy = async () => {
  const recoverySession = await prisma.agentSession.findUnique({
    where: {
      sessionKey: burstRecoverySessionKey,
    },
    select: {
      id: true,
      sessionKey: true,
    },
  });

  if (!recoverySession) {
    return;
  }

  const failedEvent = await prisma.telemetryEvent.findFirst({
    where: {
      eventType: "agent.session.failed",
      session: {
        sessionKey: burstFailureSessionKey,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      payloadJson: true,
    },
  });

  if (
    !failedEvent ||
    typeof failedEvent.payloadJson !== "object" ||
    failedEvent.payloadJson === null ||
    Array.isArray(failedEvent.payloadJson)
  ) {
    return;
  }

  await prisma.telemetryEvent.update({
    where: {
      id: failedEvent.id,
    },
    data: {
      payloadJson: {
        ...(failedEvent.payloadJson as Record<string, unknown>),
        metadata: buildBurstSocketFailureMetadata(recoverySession),
      } as Prisma.InputJsonValue,
    },
  });
};

export const resetDemoData = async (client: PrismaClient = prisma): Promise<DemoResetResult> => {
  const demoRunners = await client.runner.findMany({
    where: demoRunnerWhere,
    select: {
      id: true,
    },
  });

  if (demoRunners.length === 0) {
    const machineCleanup = await client.machine.deleteMany({
      where: {
        runners: {
          none: {},
        },
      },
    });

    return {
      runnerCount: 0,
      sessionCount: 0,
      eventCount: 0,
      machineCount: machineCleanup.count,
    };
  }

  const runnerIds = demoRunners.map((runner) => runner.id);
  const [eventCount, sessionCount] = await Promise.all([
    client.telemetryEvent.count({
      where: {
        runnerId: {
          in: runnerIds,
        },
      },
    }),
    client.agentSession.count({
      where: {
        runnerId: {
          in: runnerIds,
        },
      },
    }),
  ]);

  const deletedRunners = await client.runner.deleteMany({
    where: {
      id: {
        in: runnerIds,
      },
    },
  });

  const deletedMachines = await client.machine.deleteMany({
    where: {
      runners: {
        none: {},
      },
    },
  });

  return {
    runnerCount: deletedRunners.count,
    sessionCount,
    eventCount,
    machineCount: deletedMachines.count,
  };
};

export const seedDemoData = async ({
  baseUrl,
  allowSelfSigned,
  demoStartMs,
  nowMs = Date.now(),
}: DemoSeedOptions): Promise<DemoSeedResult> => {
  const effectiveDemoStartMs = demoStartMs ?? createDemoStartValue(nowMs);
  const replayPlan = buildDemoReplayPlan(nowMs, effectiveDemoStartMs);
  const bootstrapClient = buildClient(baseUrl, allowSelfSigned);
  const enrolledRunners = new Map<
    string,
    {
      token: string;
    }
  >();

  for (const runnerPlan of replayPlan.runners) {
    const enrollment = await bootstrapClient.enrollRunner({
      runnerName: runnerPlan.seed.name,
      labels: runnerPlan.seed.labels,
      environment: runnerPlan.seed.environment,
      machine: {
        hostname: runnerPlan.seed.hostname,
        ...demoMachineDescriptor,
      },
    });

    enrolledRunners.set(runnerPlan.seed.id, {
      token: enrollment.credentials.token,
    });
  }

  let heartbeatCount = 0;

  for (const runnerPlan of replayPlan.runners) {
    const enrollment = enrolledRunners.get(runnerPlan.seed.id);

    if (!enrollment) {
      continue;
    }

    const client = buildClient(baseUrl, allowSelfSigned, enrollment.token);

    if (runnerPlan.telemetryEvents.length > 0) {
      await client.sendTelemetryBatch(runnerPlan.telemetryEvents);
    }

    if (runnerPlan.lastSeenAt) {
      await client.sendHeartbeat({
        timestamp: runnerPlan.lastSeenAt,
        activeSessionCount: runnerPlan.activeSessionCount,
        metadata: {
          mode: "demo-seed",
        },
      });
      heartbeatCount += 1;
    }
  }

  return {
    demoStartMs: effectiveDemoStartMs,
    runnerCount: replayPlan.snapshot.runners.length,
    sessionCount: replayPlan.snapshot.sessions.length,
    eventCount: replayPlan.snapshot.events.length + heartbeatCount,
    heartbeatCount,
    failedSessionCount: replayPlan.snapshot.sessions.filter((session) => session.status === "failed").length,
    runningSessionCount: replayPlan.snapshot.sessions.filter((session) => session.status === "running").length,
  };
};

export const runDemoBurst = async ({
  baseUrl,
  allowSelfSigned,
  stepDelayMs = 700,
}: DemoBurstOptions): Promise<DemoBurstResult> => {
  const bootstrapClient = buildClient(baseUrl, allowSelfSigned);
  const burstRunners = [
    {
      name: "Latency Lynx",
      hostname: "latency-lynx.local",
      agentType: "cursor" as const,
      labels: ["demo", "presentation", "burst", "ops"],
      successSessionKey: "LL-601",
    },
    {
      name: "Rollback Raven",
      hostname: "rollback-raven.local",
      agentType: "codex" as const,
      labels: ["demo", "presentation", "burst", "incident"],
      successSessionKey: burstFailureSessionKey,
    },
  ];

  const enrolled = await Promise.all(
    burstRunners.map(async (runner) => {
      const enrollment = await bootstrapClient.enrollRunner({
        runnerName: runner.name,
        labels: runner.labels,
        environment: "demo",
        machine: {
          hostname: runner.hostname,
          ...demoMachineDescriptor,
        },
      });

      return {
        ...runner,
        client: buildClient(baseUrl, allowSelfSigned, enrollment.credentials.token),
      };
    }),
  );

  let eventCount = 0;

  for (const runner of enrolled) {
    await runner.client.sendHeartbeat({
      timestamp: new Date().toISOString(),
      activeSessionCount: 1,
      metadata: {
        mode: "demo-burst",
      },
    });
    eventCount += 1;
  }

  const [successRunner, failureRunner] = enrolled;

  if (!successRunner || !failureRunner) {
    return {
      runnerCount: enrolled.length,
      eventCount,
    };
  }

  const emit = async (client: AgentHarborClient, event: TelemetryEventEnvelope) => {
    await client.sendTelemetryEvent(event);
    eventCount += 1;
    await sleep(stepDelayMs);
  };

  await emit(
    successRunner.client,
    buildBurstEvent({
      eventType: "agent.summary.updated",
      agentType: successRunner.agentType,
      timestamp: new Date().toISOString(),
      summary: "Joined the burst lane and started tracing a latency regression across the live feed.",
      category: "session",
      status: "running",
      tokenUsage: 1_100,
      filesTouchedCount: 1,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.summary.updated",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      summary: "Joined the burst lane and opened a rollback drill for the staging socket path.",
      category: "session",
      status: "running",
      tokenUsage: 1_000,
      filesTouchedCount: 1,
    }),
  );

  await emit(
    successRunner.client,
    buildBurstEvent({
      eventType: "agent.session.started",
      agentType: successRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: successRunner.successSessionKey,
      summary: "Started the live latency investigation and loaded the streaming checkpoints.",
      category: "session",
      status: "running",
      tokenUsage: 2_800,
      filesTouchedCount: 2,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.session.started",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: failureRunner.successSessionKey,
      summary: "Started the rollback drill and reopened the socket replay checkpoint.",
      category: "session",
      status: "running",
      tokenUsage: 2_700,
      filesTouchedCount: 2,
    }),
  );

  await emit(
    successRunner.client,
    buildBurstEvent({
      eventType: "agent.prompt.executed",
      agentType: successRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: successRunner.successSessionKey,
      summary: "Compared burst latency across the last three fan-out windows and isolated the noisy queue edge.",
      category: "network",
      status: "running",
      tokenUsage: 6_400,
      filesTouchedCount: 3,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.prompt.executed",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: failureRunner.successSessionKey,
      summary: "Replayed the staging socket path and hit the same rollback boundary after the first reconnect.",
      category: "network",
      status: "warning",
      tokenUsage: 6_100,
      filesTouchedCount: 3,
      metadata: buildBurstSocketFailureMetadata(),
    }),
  );

  await emit(
    successRunner.client,
    buildBurstEvent({
      eventType: "agent.session.completed",
      agentType: successRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: successRunner.successSessionKey,
      summary: "Closed the latency investigation and handed the narrowed queue edge back to the operator.",
      category: "session",
      status: "completed",
      tokenUsage: 9_200,
      filesTouchedCount: 4,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.session.failed",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: failureRunner.successSessionKey,
      summary: "Rollback drill failed after the staging socket reset before the checkpoint landed cleanly.",
      category: "network",
      status: "failed",
      tokenUsage: 8_800,
      filesTouchedCount: 4,
      metadata: buildBurstSocketFailureMetadata(),
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.session.started",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: burstRecoverySessionKey,
      summary: "Started a guarded retry for the rollback checkpoint window.",
      category: "recovery",
      status: "running",
      tokenUsage: 3_200,
      filesTouchedCount: 2,
      metadata: burstSocketRecoveryMetadata,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.prompt.executed",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: burstRecoverySessionKey,
      summary: "Applied the persisted cursor guard before advancing the replay cursor.",
      category: "recovery",
      status: "running",
      tokenUsage: 5_900,
      filesTouchedCount: 3,
      metadata: burstSocketRecoveryMetadata,
    }),
  );

  await emit(
    failureRunner.client,
    buildBurstEvent({
      eventType: "agent.session.completed",
      agentType: failureRunner.agentType,
      timestamp: new Date().toISOString(),
      sessionKey: burstRecoverySessionKey,
      summary: "Recovery replay completed with the checkpoint guard verified.",
      category: "recovery",
      status: "completed",
      tokenUsage: 8_400,
      filesTouchedCount: 3,
      metadata: burstSocketRecoveryMetadata,
    }),
  );

  await attachBurstFailureRemedy();

  return {
    runnerCount: enrolled.length,
    eventCount,
  };
};
