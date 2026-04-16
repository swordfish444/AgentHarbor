import type {
  AgentType,
  AlertItem,
  EventListItem,
  EventTimeseriesResponse,
  RunnerActivityResponse,
  RunnerListItem,
  SessionDetail,
  SessionListItem,
  StatsResponse,
  TelemetryEventType,
} from "@agentharbor/shared";
import type { DashboardAnalytics, DashboardData } from "./control-node";

export const demoCycleMs = 10 * 60 * 1000;
export const demoDefaultOffsetMs = 260_000;

interface DemoRunnerSeed {
  id: string;
  name: string;
  machineName: string;
  hostname: string;
  agentType: AgentType;
  joinOffsetMs: number;
  disconnectWindows?: Array<[number, number]>;
  environment: string;
  labels: string[];
}

interface DemoSessionSeed {
  id: string;
  runnerId: string;
  sessionKey: string;
  agentType: AgentType;
  startOffsetMs: number;
  durationMs: number;
  finalStatus: "completed" | "failed";
  summary: string;
  runningSummary: string;
  tokenUsage: number;
  filesTouchedCount: number;
  eventCount: number;
}

interface DemoEventSeed {
  id: string;
  runnerId: string;
  sessionId: string | null;
  sessionKey: string | null;
  eventType: TelemetryEventType;
  offsetMs: number;
  summary: string;
  category: string;
  status?: string;
  tokenUsage?: number;
  filesTouchedCount?: number;
}

export interface DemoSecurityIncident {
  severity: "warning" | "critical";
  title: string;
  detail: string;
  evidence: string[];
  recommendedActions: string[];
  startedAt: string;
}

const demoRunnerSeeds: DemoRunnerSeed[] = [
  {
    id: "merge-marmot",
    name: "Merge Marmot",
    machineName: "Marmot MBP",
    hostname: "merge-marmot.local",
    agentType: "codex",
    joinOffsetMs: 0,
    environment: "demo",
    labels: ["presentation", "ios"],
  },
  {
    id: "patch-panda",
    name: "Patch Panda",
    machineName: "Panda Studio",
    hostname: "patch-panda.local",
    agentType: "claude-code",
    joinOffsetMs: 30_000,
    disconnectWindows: [[470_000, 535_000]],
    environment: "demo",
    labels: ["presentation", "web"],
  },
  {
    id: "audit-otter",
    name: "Audit Otter",
    machineName: "Otter Mini",
    hostname: "audit-otter.local",
    agentType: "cursor",
    joinOffsetMs: 70_000,
    environment: "demo",
    labels: ["presentation", "review"],
  },
  {
    id: "cipher-coyote",
    name: "Cipher Coyote",
    machineName: "Coyote Workstation",
    hostname: "cipher-coyote.local",
    agentType: "automation",
    joinOffsetMs: 120_000,
    environment: "demo",
    labels: ["presentation", "security-threat"],
  },
  {
    id: "socket-shark",
    name: "Socket Shark",
    machineName: "Shark Rack",
    hostname: "socket-shark.local",
    agentType: "codex",
    joinOffsetMs: 205_000,
    environment: "demo",
    labels: ["presentation", "infra"],
  },
  {
    id: "stack-sparrow",
    name: "Stack Sparrow",
    machineName: "Sparrow Air",
    hostname: "stack-sparrow.local",
    agentType: "claude-code",
    joinOffsetMs: 330_000,
    disconnectWindows: [[560_000, 600_000]],
    environment: "demo",
    labels: ["presentation", "release"],
  },
];

const demoSessionSeeds: DemoSessionSeed[] = [
  {
    id: "merge-marmot-session-1",
    runnerId: "merge-marmot",
    sessionKey: "MM-201",
    agentType: "codex",
    startOffsetMs: 10_000,
    durationMs: 110_000,
    finalStatus: "completed",
    summary: "Stabilized webhook retries and closed the backlog on task #12.",
    runningSummary: "Replaying webhook retries and validating the queue drain on task #12.",
    tokenUsage: 24_300,
    filesTouchedCount: 6,
    eventCount: 7,
  },
  {
    id: "merge-marmot-session-2",
    runnerId: "merge-marmot",
    sessionKey: "MM-204",
    agentType: "codex",
    startOffsetMs: 360_000,
    durationMs: 145_000,
    finalStatus: "completed",
    summary: "Finished the incident write-up and handed findings back to the operator.",
    runningSummary: "Pulling together the incident write-up and collecting final evidence for review.",
    tokenUsage: 31_900,
    filesTouchedCount: 9,
    eventCount: 8,
  },
  {
    id: "patch-panda-session-1",
    runnerId: "patch-panda",
    sessionKey: "PP-118",
    agentType: "claude-code",
    startOffsetMs: 35_000,
    durationMs: 120_000,
    finalStatus: "completed",
    summary: "Patched the auth dependency and completed the rollback-safe smoke test.",
    runningSummary: "Applying the auth patch and replaying smoke coverage against staging.",
    tokenUsage: 28_600,
    filesTouchedCount: 5,
    eventCount: 6,
  },
  {
    id: "patch-panda-session-2",
    runnerId: "patch-panda",
    sessionKey: "PP-121",
    agentType: "claude-code",
    startOffsetMs: 255_000,
    durationMs: 125_000,
    finalStatus: "completed",
    summary: "Verified the refreshed token path and closed the hotfix checklist.",
    runningSummary: "Validating the refreshed token path before we close the hotfix checklist.",
    tokenUsage: 22_200,
    filesTouchedCount: 4,
    eventCount: 5,
  },
  {
    id: "audit-otter-session-1",
    runnerId: "audit-otter",
    sessionKey: "AO-071",
    agentType: "cursor",
    startOffsetMs: 75_000,
    durationMs: 155_000,
    finalStatus: "completed",
    summary: "Audited the noisy CI lane and trimmed 3 flaky retries from the pipeline.",
    runningSummary: "Tracing the noisy CI lane and identifying where the flaky retries originate.",
    tokenUsage: 19_400,
    filesTouchedCount: 3,
    eventCount: 5,
  },
  {
    id: "audit-otter-session-2",
    runnerId: "audit-otter",
    sessionKey: "AO-079",
    agentType: "cursor",
    startOffsetMs: 290_000,
    durationMs: 205_000,
    finalStatus: "completed",
    summary: "Closed the readiness review and handed back the final checklist for approval.",
    runningSummary: "Running the readiness review and assembling the final release checklist.",
    tokenUsage: 26_100,
    filesTouchedCount: 7,
    eventCount: 7,
  },
  {
    id: "cipher-coyote-session-1",
    runnerId: "cipher-coyote",
    sessionKey: "CC-913",
    agentType: "automation",
    startOffsetMs: 125_000,
    durationMs: 360_000,
    finalStatus: "completed",
    summary: "Investigated a suspicious secrets scan and isolated the package before merge.",
    runningSummary: "Tracing a suspicious secrets scan and isolating a package before merge.",
    tokenUsage: 44_900,
    filesTouchedCount: 11,
    eventCount: 11,
  },
  {
    id: "socket-shark-session-1",
    runnerId: "socket-shark",
    sessionKey: "SS-402",
    agentType: "codex",
    startOffsetMs: 210_000,
    durationMs: 120_000,
    finalStatus: "completed",
    summary: "Restored the control-node streaming path and verified event fan-out.",
    runningSummary: "Restoring the control-node streaming path and verifying event fan-out.",
    tokenUsage: 17_500,
    filesTouchedCount: 4,
    eventCount: 5,
  },
  {
    id: "socket-shark-session-2",
    runnerId: "socket-shark",
    sessionKey: "SS-406",
    agentType: "codex",
    startOffsetMs: 420_000,
    durationMs: 115_000,
    finalStatus: "failed",
    summary: "Lost the first replay because the staging socket closed before the checkpoint landed.",
    runningSummary: "Replaying the staging socket path after the first checkpoint failed to land cleanly.",
    tokenUsage: 15_200,
    filesTouchedCount: 3,
    eventCount: 4,
  },
  {
    id: "stack-sparrow-session-1",
    runnerId: "stack-sparrow",
    sessionKey: "SP-033",
    agentType: "claude-code",
    startOffsetMs: 340_000,
    durationMs: 190_000,
    finalStatus: "completed",
    summary: "Wrapped the release notes and synchronized the staging rollout checklist.",
    runningSummary: "Composing release notes and synchronizing the staging rollout checklist.",
    tokenUsage: 21_700,
    filesTouchedCount: 5,
    eventCount: 5,
  },
];

const demoEventSeeds: DemoEventSeed[] = [
  {
    id: "merge-marmot-join",
    runnerId: "merge-marmot",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 0,
    summary: "Joined Fleet View and started triaging the webhook queue.",
    category: "session",
  },
  {
    id: "patch-panda-join",
    runnerId: "patch-panda",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 30_000,
    summary: "Joined Fleet View and picked up the auth patch sequence.",
    category: "session",
  },
  {
    id: "audit-otter-join",
    runnerId: "audit-otter",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 70_000,
    summary: "Joined Fleet View and started auditing the release readiness queue.",
    category: "session",
  },
  {
    id: "cipher-coyote-join",
    runnerId: "cipher-coyote",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 120_000,
    summary: "Joined Fleet View and began monitoring the secrets scan lane.",
    category: "session",
  },
  {
    id: "socket-shark-join",
    runnerId: "socket-shark",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 205_000,
    summary: "Joined Fleet View and started rebuilding the streaming path.",
    category: "network",
  },
  {
    id: "stack-sparrow-join",
    runnerId: "stack-sparrow",
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: 330_000,
    summary: "Joined Fleet View and picked up release-note coordination for the rollout.",
    category: "session",
  },
  {
    id: "merge-marmot-work",
    runnerId: "merge-marmot",
    sessionId: "merge-marmot-session-1",
    sessionKey: "MM-201",
    eventType: "agent.prompt.executed",
    offsetMs: 48_000,
    summary: "Now running queue replay analysis on task #12 (35% context).",
    category: "implementation",
    tokenUsage: 5_800,
    filesTouchedCount: 2,
  },
  {
    id: "patch-panda-work",
    runnerId: "patch-panda",
    sessionId: "patch-panda-session-1",
    sessionKey: "PP-118",
    eventType: "agent.prompt.executed",
    offsetMs: 88_000,
    summary: "Started verifying the auth patch against the staging smoke suite (70% context).",
    category: "test",
    tokenUsage: 8_900,
    filesTouchedCount: 3,
  },
  {
    id: "audit-otter-work",
    runnerId: "audit-otter",
    sessionId: "audit-otter-session-1",
    sessionKey: "AO-071",
    eventType: "agent.summary.updated",
    offsetMs: 135_000,
    summary: "Working through CI flakes and trimming duplicate retries from the release lane.",
    category: "test",
    tokenUsage: 7_300,
    filesTouchedCount: 1,
  },
  {
    id: "cipher-coyote-work",
    runnerId: "cipher-coyote",
    sessionId: "cipher-coyote-session-1",
    sessionKey: "CC-913",
    eventType: "agent.summary.updated",
    offsetMs: 188_000,
    summary: "Scanning dependency diffs for unusual credential access patterns.",
    category: "auth",
    tokenUsage: 12_400,
    filesTouchedCount: 6,
  },
  {
    id: "socket-shark-work",
    runnerId: "socket-shark",
    sessionId: "socket-shark-session-1",
    sessionKey: "SS-402",
    eventType: "agent.prompt.executed",
    offsetMs: 245_000,
    summary: "Now replaying the control-node event fan-out on the staging socket path.",
    category: "network",
    tokenUsage: 6_100,
    filesTouchedCount: 2,
  },
  {
    id: "cipher-coyote-warning",
    runnerId: "cipher-coyote",
    sessionId: "cipher-coyote-session-1",
    sessionKey: "CC-913",
    eventType: "agent.summary.updated",
    offsetMs: 355_000,
    summary: "Threat detected: a dependency postinstall script touched a protected credential path. Human review requested.",
    category: "failure",
    status: "warning",
    tokenUsage: 20_700,
    filesTouchedCount: 8,
  },
  {
    id: "stack-sparrow-work",
    runnerId: "stack-sparrow",
    sessionId: "stack-sparrow-session-1",
    sessionKey: "SP-033",
    eventType: "agent.summary.updated",
    offsetMs: 390_000,
    summary: "Drafting the release-note handoff and coordinating the rollout checklist.",
    category: "planning",
    tokenUsage: 4_800,
    filesTouchedCount: 1,
  },
  {
    id: "socket-shark-failure",
    runnerId: "socket-shark",
    sessionId: "socket-shark-session-2",
    sessionKey: "SS-406",
    eventType: "agent.session.failed",
    offsetMs: 535_000,
    summary: "Lost the first replay after a socket reset. The runner is retrying from the last stable checkpoint.",
    category: "network",
    status: "failed",
    tokenUsage: 15_200,
    filesTouchedCount: 3,
  },
  {
    id: "merge-marmot-complete",
    runnerId: "merge-marmot",
    sessionId: "merge-marmot-session-2",
    sessionKey: "MM-204",
    eventType: "agent.session.completed",
    offsetMs: 505_000,
    summary: "Wrapped the incident write-up and handed back the final notes for operator review.",
    category: "session",
    status: "completed",
  },
];

const securityIncidentStartOffsetMs = 355_000;
const securityIncidentRunnerId = "cipher-coyote";

const cycleOffset = (timestampMs: number, demoStartMs: number) => {
  const offset = (timestampMs - demoStartMs) % demoCycleMs;
  return offset >= 0 ? offset : offset + demoCycleMs;
};

const atTimestamp = (offsetMs: number, demoStartMs: number) => new Date(demoStartMs + offsetMs).toISOString();

const isWithinWindow = (offsetMs: number, window: [number, number]) => offsetMs >= window[0] && offsetMs < window[1];

const isRunnerVisible = (seed: DemoRunnerSeed, offsetMs: number) =>
  offsetMs >= seed.joinOffsetMs && !(seed.disconnectWindows ?? []).some((window) => isWithinWindow(offsetMs, window));

const collectSessions = (offsetMs: number, demoStartMs: number) =>
  demoSessionSeeds
    .filter((session) => offsetMs >= session.startOffsetMs)
    .map<SessionListItem>((session) => {
      const elapsed = offsetMs - session.startOffsetMs;
      const hasEnded = elapsed >= session.durationMs;
      const startedAt = atTimestamp(session.startOffsetMs, demoStartMs);
      const endedAt = hasEnded ? atTimestamp(session.startOffsetMs + session.durationMs, demoStartMs) : null;

      return {
        id: session.id,
        runnerId: session.runnerId,
        runnerName: demoRunnerSeeds.find((runner) => runner.id === session.runnerId)?.name ?? session.runnerId,
        agentType: session.agentType,
        sessionKey: session.sessionKey,
        status: hasEnded ? session.finalStatus : "running",
        startedAt,
        endedAt,
        summary: hasEnded ? session.summary : session.runningSummary,
        tokenUsage: hasEnded ? session.tokenUsage : Math.round(session.tokenUsage * Math.min(0.92, Math.max(0.2, elapsed / session.durationMs))),
        durationMs: hasEnded ? session.durationMs : elapsed,
        filesTouchedCount: hasEnded
          ? session.filesTouchedCount
          : Math.max(1, Math.round(session.filesTouchedCount * Math.min(1, Math.max(0.15, elapsed / session.durationMs)))),
        eventCount: hasEnded ? session.eventCount : Math.max(2, Math.round(session.eventCount * Math.min(1, Math.max(0.25, elapsed / session.durationMs)))),
      };
    });

const collectEvents = (offsetMs: number, demoStartMs: number) =>
  demoEventSeeds
    .filter((event) => offsetMs >= event.offsetMs)
    .map<EventListItem>((event) => {
      const runner = demoRunnerSeeds.find((candidate) => candidate.id === event.runnerId);

      return {
        id: event.id,
        runnerId: event.runnerId,
        runnerName: runner?.name ?? event.runnerId,
        sessionId: event.sessionId,
        sessionKey: event.sessionKey,
        eventType: event.eventType,
        createdAt: atTimestamp(event.offsetMs, demoStartMs),
        payload: {
          timestamp: atTimestamp(event.offsetMs, demoStartMs),
          agentType: runner?.agentType ?? "custom",
          sessionKey: event.sessionKey ?? undefined,
          summary: event.summary,
          category: event.category as
            | "session"
            | "planning"
            | "implementation"
            | "build"
            | "test"
            | "network"
            | "auth"
            | "failure"
            | "timeout"
            | "human-approval"
            | "unknown"
            | "recovery",
          tokenUsage: event.tokenUsage,
          filesTouchedCount: event.filesTouchedCount,
          status: event.status,
        },
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

const collectRunners = (offsetMs: number, demoStartMs: number, sessions: SessionListItem[]) =>
  demoRunnerSeeds.map<RunnerListItem>((runner) => {
    const runnerSessions = sessions.filter((session) => session.runnerId === runner.id);
    const activeSessionCount = runnerSessions.filter((session) => session.status === "running").length;
    const mostRecentSignal = runnerSessions
      .map((session) => session.endedAt ?? session.startedAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    const isOnline = isRunnerVisible(runner, offsetMs);

    return {
      id: runner.id,
      name: runner.name,
      machineName: runner.machineName,
      hostname: runner.hostname,
      os: "macOS",
      architecture: "arm64",
      status: isOnline ? "online" : "offline",
      labels: runner.labels,
      environment: runner.environment,
      createdAt: atTimestamp(Math.max(0, runner.joinOffsetMs - 25_000), demoStartMs),
      updatedAt: atTimestamp(offsetMs, demoStartMs),
      lastSeenAt: mostRecentSignal ?? (offsetMs >= runner.joinOffsetMs ? atTimestamp(offsetMs, demoStartMs) : null),
      isOnline,
      activeSessionCount,
    };
  });

const buildStats = (runners: RunnerListItem[], sessions: SessionListItem[], events: EventListItem[]): StatsResponse => ({
  totalRunners: demoRunnerSeeds.length,
  onlineRunners: runners.length,
  activeSessions: sessions.filter((session) => session.status === "running").length,
  sessionsLast24h: sessions.length,
  eventsLast24h: events.length,
  failedSessionsLast24h: sessions.filter((session) => session.status === "failed").length,
});

const buildAnalytics = (sessions: SessionListItem[], events: EventListItem[]): DashboardAnalytics => {
  const agentTypeCounts = new Map<string, number>();
  const failureCounts = new Map<string, number>();
  const runnerCounts = new Map<string, number>();

  for (const session of sessions) {
    agentTypeCounts.set(session.agentType, (agentTypeCounts.get(session.agentType) ?? 0) + 1);
    runnerCounts.set(session.runnerId, (runnerCounts.get(session.runnerId) ?? 0) + 1);

    if (session.status === "failed") {
      failureCounts.set(session.runnerName, (failureCounts.get(session.runnerName) ?? 0) + 1);
    }
  }

  const timeseriesBuckets = new Map<string, number>();

  for (const event of events) {
    const bucket = event.createdAt.slice(0, 16);
    timeseriesBuckets.set(bucket, (timeseriesBuckets.get(bucket) ?? 0) + 1);
  }

  const agentTypes = {
    items: [...agentTypeCounts.entries()].map(([key, count]) => ({
      key,
      label: key,
      count,
    })),
  };

  const failures = {
    items: [...failureCounts.entries()].map(([key, count]) => ({
      key,
      label: key,
      count,
    })),
  };

  const runnerActivity: RunnerActivityResponse = {
    items: [...runnerCounts.entries()].map(([runnerId, sessionCount]) => ({
      runnerId,
      runnerName: demoRunnerSeeds.find((runner) => runner.id === runnerId)?.name ?? runnerId,
      sessionCount,
    })),
  };

  const eventTimeseries: EventTimeseriesResponse = {
    points: [...timeseriesBuckets.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(-8)
      .map(([bucketStart, count]) => ({
        bucketStart: `${bucketStart}:00.000Z`,
        count,
      })),
  };

  return {
    agentTypes,
    failures,
    runnerActivity,
    eventTimeseries,
  };
};

export const buildDemoDashboardData = (timestampMs: number, demoStartMs: number): DashboardData => {
  const offsetMs = cycleOffset(timestampMs, demoStartMs);
  const sessions = collectSessions(offsetMs, demoStartMs);
  const runners = collectRunners(offsetMs, demoStartMs, sessions);
  const events = collectEvents(offsetMs, demoStartMs);
  const alerts: AlertItem[] =
    offsetMs >= securityIncidentStartOffsetMs
      ? [
          {
            id: "security-threat",
            severity: "warning",
            title: "Security threat detected",
            detail: "Cipher Coyote flagged a dependency touching a protected credential path. Review recommended.",
            count: 1,
          },
        ]
      : [];

  return {
    stats: buildStats(runners, sessions, events),
    runnerGroups: [],
    runners,
    sessions: sessions.sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()),
    events,
    alerts,
    analytics: buildAnalytics(sessions, events),
  };
};

export const getDemoSecurityIncident = (runnerId: string, timestampMs: number, demoStartMs: number): DemoSecurityIncident | null => {
  if (runnerId !== securityIncidentRunnerId) {
    return null;
  }

  const offsetMs = cycleOffset(timestampMs, demoStartMs);

  if (offsetMs < securityIncidentStartOffsetMs) {
    return null;
  }

  return {
    severity: "warning",
    title: "Threat detected in active dependency review",
    detail:
      "Cipher Coyote observed a postinstall script touching `/secrets/runtime.env` during a dependency update rehearsal. The agent isolated the package and paused the merge path for human review.",
    evidence: [
      "Credential path access was requested outside the approved build directory.",
      "The package hash diverged from the previously approved lockfile snapshot.",
      "The runner isolated the dependency before any deploy or release task resumed.",
    ],
    recommendedActions: [
      "Review the dependency diff and confirm the package should remain blocked.",
      "Rotate the staging credential if the package originated from an untrusted mirror.",
      "Approve or reject the merge path before the agent continues the release checklist.",
    ],
    startedAt: atTimestamp(securityIncidentStartOffsetMs, demoStartMs),
  };
};

export const getDemoAgentType = (runnerId: string) => demoRunnerSeeds.find((runner) => runner.id === runnerId)?.agentType ?? "custom";

export const isKnownDemoRunner = (runnerId: string) => demoRunnerSeeds.some((runner) => runner.id === runnerId);

export const buildDemoSessionDetail = (sessionId: string, timestampMs: number, demoStartMs: number): SessionDetail | null => {
  const snapshot = buildDemoDashboardData(timestampMs, demoStartMs);
  const session = snapshot.sessions.find((candidate) => candidate.id === sessionId);

  if (!session) {
    return null;
  }

  return {
    ...session,
    events: snapshot.events.filter((event) => event.sessionId === sessionId).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
  };
};

export const createDemoStartValue = () => Date.now() - demoDefaultOffsetMs;
