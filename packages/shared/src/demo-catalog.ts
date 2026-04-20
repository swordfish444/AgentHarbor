import type {
  AgentType,
  AlertItem,
  AnalyticsBreakdownResponse,
  EventCategory,
  EventListItem,
  EventTimeseriesResponse,
  RunnerActivityResponse,
  RunnerLabelGroup,
  RunnerListItem,
  SessionDetail,
  SessionListItem,
  StatsResponse,
  TelemetryEventEnvelope,
  TelemetryEventType,
} from "./telemetry.js";

export const demoScaleFactor = 4;
export const demoCycleMs = 40 * 60 * 1000;
export const demoDefaultOffsetMs = scaleDemoOffset(575_000);

export interface DemoRunnerSeed {
  id: string;
  name: string;
  machineName: string;
  hostname: string;
  agentType: AgentType;
  joinOffsetMs: number;
  joinSummary: string;
  joinCategory: EventCategory;
  disconnectWindows?: Array<[number, number]>;
  environment: string;
  labels: string[];
}

export interface DemoSessionTimelineSeed {
  key: string;
  offsetMs: number;
  eventType: TelemetryEventType;
  summary: string;
  category: EventCategory;
  status?: string;
  tokenUsageRatio?: number;
  filesTouchedRatio?: number;
}

export interface DemoSessionSeed {
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
  timeline: DemoSessionTimelineSeed[];
}

export interface DemoSecurityIncident {
  severity: "warning" | "critical";
  title: string;
  detail: string;
  evidence: string[];
  recommendedActions: string[];
  startedAt: string;
}

export interface DemoAnalyticsSnapshot {
  agentTypes: AnalyticsBreakdownResponse;
  failures: AnalyticsBreakdownResponse;
  runnerActivity: RunnerActivityResponse;
  eventTimeseries: EventTimeseriesResponse;
}

export interface DemoCatalogSnapshot {
  stats: StatsResponse;
  runnerGroups: RunnerLabelGroup[];
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
  alerts: AlertItem[];
  analytics: DemoAnalyticsSnapshot;
}

export interface DemoReplayRunnerPlan {
  seed: DemoRunnerSeed;
  activeSessionCount: number;
  lastSeenAt: string | null;
  telemetryEvents: TelemetryEventEnvelope[];
}

export interface DemoReplayPlan {
  demoStartMs: number;
  offsetMs: number;
  snapshot: DemoCatalogSnapshot;
  runners: DemoReplayRunnerPlan[];
}

interface DemoEventSeed {
  id: string;
  runnerId: string;
  sessionId: string | null;
  sessionKey: string | null;
  eventType: TelemetryEventType;
  offsetMs: number;
  agentType: AgentType;
  summary: string;
  category: EventCategory;
  status?: string;
  tokenUsage?: number;
  filesTouchedCount?: number;
}

const securityIncidentRunnerId = "cipher-coyote";
const securityIncidentEventId = "cipher-coyote-session-1-security-warning";
const failureCategories = new Set<EventCategory>(["auth", "build", "failure", "network", "test", "timeout"]);

export function scaleDemoOffset(value: number) {
  return value * demoScaleFactor;
}

const buildTokenCheckpoint = (total: number, ratio: number | undefined) => {
  if (ratio == null) {
    return undefined;
  }

  return Math.max(0, Math.round(total * ratio));
};

const buildFileCheckpoint = (total: number, ratio: number | undefined) => {
  if (ratio == null) {
    return undefined;
  }

  return Math.max(1, Math.round(total * ratio));
};

const scaleWindow = (window: [number, number]): [number, number] => [scaleDemoOffset(window[0]), scaleDemoOffset(window[1])];

const atTimestamp = (offsetMs: number, demoStartMs: number) => new Date(demoStartMs + offsetMs).toISOString();

const cycleOffset = (timestampMs: number, demoStartMs: number) => {
  const offset = (timestampMs - demoStartMs) % demoCycleMs;
  return offset >= 0 ? offset : offset + demoCycleMs;
};

const isWithinWindow = (offsetMs: number, window: [number, number]) => offsetMs >= window[0] && offsetMs < window[1];

const sortSessions = (sessions: SessionListItem[]) =>
  [...sessions].sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime());

const sortEventsDescending = (events: EventListItem[]) =>
  [...events].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

const toBreakdown = (counts: Map<string, number>) => ({
  items: [...counts.entries()]
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
    }),
});

export const demoRunnerSeeds: DemoRunnerSeed[] = [
  {
    id: "merge-marmot",
    name: "Merge Marmot",
    machineName: "Marmot MBP",
    hostname: "merge-marmot.local",
    agentType: "codex",
    joinOffsetMs: 0,
    joinSummary: "Joined Fleet View and picked up the webhook stabilization lane.",
    joinCategory: "session",
    environment: "demo",
    labels: ["demo", "presentation", "ios", "student-team-a"],
  },
  {
    id: "patch-panda",
    name: "Patch Panda",
    machineName: "Panda Studio",
    hostname: "patch-panda.local",
    agentType: "claude-code",
    joinOffsetMs: scaleDemoOffset(30_000),
    joinSummary: "Joined Fleet View and moved onto the auth patch rehearsal.",
    joinCategory: "session",
    environment: "demo",
    labels: ["demo", "presentation", "web", "student-team-b"],
  },
  {
    id: "audit-otter",
    name: "Audit Otter",
    machineName: "Otter Mini",
    hostname: "audit-otter.local",
    agentType: "cursor",
    joinOffsetMs: scaleDemoOffset(70_000),
    joinSummary: "Joined Fleet View and started auditing the release readiness queue.",
    joinCategory: "session",
    environment: "demo",
    labels: ["demo", "presentation", "review", "student-team-a"],
  },
  {
    id: "cipher-coyote",
    name: "Cipher Coyote",
    machineName: "Coyote Workstation",
    hostname: "cipher-coyote.local",
    agentType: "automation",
    joinOffsetMs: scaleDemoOffset(120_000),
    joinSummary: "Joined Fleet View and began monitoring the security review lane.",
    joinCategory: "auth",
    environment: "demo",
    labels: ["demo", "presentation", "security", "student-team-b"],
  },
  {
    id: "socket-shark",
    name: "Socket Shark",
    machineName: "Shark Rack",
    hostname: "socket-shark.local",
    agentType: "codex",
    joinOffsetMs: scaleDemoOffset(205_000),
    joinSummary: "Joined Fleet View and started rebuilding the streaming path.",
    joinCategory: "network",
    environment: "demo",
    labels: ["demo", "presentation", "infra", "student-team-a"],
  },
  {
    id: "stack-sparrow",
    name: "Stack Sparrow",
    machineName: "Sparrow Air",
    hostname: "stack-sparrow.local",
    agentType: "claude-code",
    joinOffsetMs: scaleDemoOffset(330_000),
    joinSummary: "Joined Fleet View and picked up the release-note coordination pass.",
    joinCategory: "session",
    disconnectWindows: [scaleWindow([560_000, 600_000])],
    environment: "demo",
    labels: ["demo", "presentation", "release", "student-team-b"],
  },
];

export const demoSessionSeeds: DemoSessionSeed[] = [
  {
    id: "merge-marmot-session-1",
    runnerId: "merge-marmot",
    sessionKey: "MM-201",
    agentType: "codex",
    startOffsetMs: scaleDemoOffset(10_000),
    durationMs: scaleDemoOffset(110_000),
    finalStatus: "completed",
    summary: "Stabilized webhook retries and closed the backlog on task #12.",
    runningSummary: "Replaying webhook retries and validating the queue drain on task #12.",
    tokenUsage: 24_300,
    filesTouchedCount: 6,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Accepted the webhook stabilization task and loaded the affected queue workers.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.06,
        filesTouchedRatio: 0.17,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(32_000),
        eventType: "agent.prompt.executed",
        summary: "Tracing retry saturation across the webhook drain path and replay queue.",
        category: "implementation",
        status: "running",
        tokenUsageRatio: 0.32,
        filesTouchedRatio: 0.34,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(78_000),
        eventType: "agent.summary.updated",
        summary: "Validated the replay window and trimmed duplicate retries from task #12.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.72,
        filesTouchedRatio: 0.67,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(110_000),
        eventType: "agent.session.completed",
        summary: "Stabilized webhook retries and closed the backlog on task #12.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "merge-marmot-session-2",
    runnerId: "merge-marmot",
    sessionKey: "MM-204",
    agentType: "codex",
    startOffsetMs: scaleDemoOffset(360_000),
    durationMs: scaleDemoOffset(230_000),
    finalStatus: "completed",
    summary: "Finished the incident write-up and handed findings back to the operator.",
    runningSummary: "Pulling together the incident write-up and collecting final evidence for review.",
    tokenUsage: 31_900,
    filesTouchedCount: 9,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Opened the incident write-up handoff and gathered the latest operator notes.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.05,
        filesTouchedRatio: 0.11,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(48_000),
        eventType: "agent.prompt.executed",
        summary: "Sorting raw incident notes into a timeline the operator can read on stage.",
        category: "planning",
        status: "running",
        tokenUsageRatio: 0.28,
        filesTouchedRatio: 0.33,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(140_000),
        eventType: "agent.summary.updated",
        summary: "Collecting the final evidence set and drafting the operator-ready incident summary.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.63,
        filesTouchedRatio: 0.67,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(230_000),
        eventType: "agent.session.completed",
        summary: "Finished the incident write-up and handed findings back to the operator.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "patch-panda-session-1",
    runnerId: "patch-panda",
    sessionKey: "PP-118",
    agentType: "claude-code",
    startOffsetMs: scaleDemoOffset(35_000),
    durationMs: scaleDemoOffset(120_000),
    finalStatus: "completed",
    summary: "Patched the auth dependency and completed the rollback-safe smoke test.",
    runningSummary: "Applying the auth patch and replaying smoke coverage against staging.",
    tokenUsage: 28_600,
    filesTouchedCount: 5,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Accepted the auth dependency patch and loaded the rollback-safe smoke checklist.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.06,
        filesTouchedRatio: 0.2,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(30_000),
        eventType: "agent.prompt.executed",
        summary: "Applying the auth patch and replaying the first smoke assertions against staging.",
        category: "implementation",
        status: "running",
        tokenUsageRatio: 0.3,
        filesTouchedRatio: 0.4,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(76_000),
        eventType: "agent.summary.updated",
        summary: "Confirmed the rollback path and narrowed the smoke failures to one stale credential path.",
        category: "test",
        status: "running",
        tokenUsageRatio: 0.7,
        filesTouchedRatio: 0.8,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(120_000),
        eventType: "agent.session.completed",
        summary: "Patched the auth dependency and completed the rollback-safe smoke test.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "patch-panda-session-2",
    runnerId: "patch-panda",
    sessionKey: "PP-121",
    agentType: "claude-code",
    startOffsetMs: scaleDemoOffset(255_000),
    durationMs: scaleDemoOffset(125_000),
    finalStatus: "completed",
    summary: "Verified the refreshed token path and closed the hotfix checklist.",
    runningSummary: "Validating the refreshed token path before the hotfix checklist closes.",
    tokenUsage: 22_200,
    filesTouchedCount: 4,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Picked up the refreshed token rehearsal and reopened the hotfix checklist.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.08,
        filesTouchedRatio: 0.25,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(28_000),
        eventType: "agent.prompt.executed",
        summary: "Replaying the refreshed token path through the staging gateway and smoke suite.",
        category: "test",
        status: "running",
        tokenUsageRatio: 0.34,
        filesTouchedRatio: 0.5,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(82_000),
        eventType: "agent.summary.updated",
        summary: "Closed the last stale credential edge case and cleaned the hotfix rollout notes.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.74,
        filesTouchedRatio: 0.75,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(125_000),
        eventType: "agent.session.completed",
        summary: "Verified the refreshed token path and closed the hotfix checklist.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "audit-otter-session-1",
    runnerId: "audit-otter",
    sessionKey: "AO-071",
    agentType: "cursor",
    startOffsetMs: scaleDemoOffset(75_000),
    durationMs: scaleDemoOffset(155_000),
    finalStatus: "completed",
    summary: "Audited the noisy CI lane and trimmed 3 flaky retries from the pipeline.",
    runningSummary: "Tracing the noisy CI lane and identifying where the flaky retries originate.",
    tokenUsage: 19_400,
    filesTouchedCount: 3,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Opened the noisy CI lane review and pulled the latest flaky retry samples.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.08,
        filesTouchedRatio: 0.34,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(42_000),
        eventType: "agent.prompt.executed",
        summary: "Comparing duplicate retry traces and isolating the noisiest release-lane failures.",
        category: "planning",
        status: "running",
        tokenUsageRatio: 0.36,
        filesTouchedRatio: 0.67,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(104_000),
        eventType: "agent.summary.updated",
        summary: "Trimmed the duplicate retries and confirmed the release lane can stay green with fewer reruns.",
        category: "test",
        status: "running",
        tokenUsageRatio: 0.74,
        filesTouchedRatio: 1,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(155_000),
        eventType: "agent.session.completed",
        summary: "Audited the noisy CI lane and trimmed 3 flaky retries from the pipeline.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "audit-otter-session-2",
    runnerId: "audit-otter",
    sessionKey: "AO-079",
    agentType: "cursor",
    startOffsetMs: scaleDemoOffset(290_000),
    durationMs: scaleDemoOffset(205_000),
    finalStatus: "completed",
    summary: "Closed the readiness review and handed back the final checklist for approval.",
    runningSummary: "Running the readiness review and assembling the final release checklist.",
    tokenUsage: 26_100,
    filesTouchedCount: 7,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Started the readiness review pass and reopened the final release checklist.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.07,
        filesTouchedRatio: 0.15,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(58_000),
        eventType: "agent.prompt.executed",
        summary: "Comparing launch blockers, release notes, and rollout tasks to surface the remaining gaps.",
        category: "planning",
        status: "running",
        tokenUsageRatio: 0.34,
        filesTouchedRatio: 0.43,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(138_000),
        eventType: "agent.summary.updated",
        summary: "Closed the last release checklist gaps and queued the final approval handoff.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.71,
        filesTouchedRatio: 0.86,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(205_000),
        eventType: "agent.session.completed",
        summary: "Closed the readiness review and handed back the final checklist for approval.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "cipher-coyote-session-1",
    runnerId: "cipher-coyote",
    sessionKey: "CC-913",
    agentType: "automation",
    startOffsetMs: scaleDemoOffset(125_000),
    durationMs: scaleDemoOffset(360_000),
    finalStatus: "completed",
    summary: "Investigated a suspicious secrets scan and isolated the package before merge.",
    runningSummary: "Tracing a suspicious secrets scan and isolating a package before merge.",
    tokenUsage: 44_900,
    filesTouchedCount: 11,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Started the security review pass and collected the dependency diff for analysis.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.05,
        filesTouchedRatio: 0.09,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(80_000),
        eventType: "agent.prompt.executed",
        summary: "Scanning dependency diffs for unusual credential access patterns and postinstall hooks.",
        category: "auth",
        status: "running",
        tokenUsageRatio: 0.32,
        filesTouchedRatio: 0.46,
      },
      {
        key: "security-warning",
        offsetMs: scaleDemoOffset(230_000),
        eventType: "agent.summary.updated",
        summary: "Threat detected: a dependency postinstall script touched a protected credential path. Human review requested.",
        category: "auth",
        status: "warning",
        tokenUsageRatio: 0.68,
        filesTouchedRatio: 0.73,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(360_000),
        eventType: "agent.session.completed",
        summary: "Investigated a suspicious secrets scan and isolated the package before merge.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "socket-shark-session-1",
    runnerId: "socket-shark",
    sessionKey: "SS-402",
    agentType: "codex",
    startOffsetMs: scaleDemoOffset(210_000),
    durationMs: scaleDemoOffset(120_000),
    finalStatus: "completed",
    summary: "Restored the control-node streaming path and verified event fan-out.",
    runningSummary: "Restoring the control-node streaming path and verifying event fan-out.",
    tokenUsage: 17_500,
    filesTouchedCount: 4,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Opened the streaming repair lane and loaded the fan-out regression cases.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.08,
        filesTouchedRatio: 0.25,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(34_000),
        eventType: "agent.prompt.executed",
        summary: "Replaying the control-node event fan-out and isolating the staging socket reset path.",
        category: "network",
        status: "running",
        tokenUsageRatio: 0.36,
        filesTouchedRatio: 0.5,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(86_000),
        eventType: "agent.summary.updated",
        summary: "Confirmed the stream can recover cleanly after the first reconnect on staging.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.75,
        filesTouchedRatio: 0.75,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(120_000),
        eventType: "agent.session.completed",
        summary: "Restored the control-node streaming path and verified event fan-out.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "socket-shark-session-2",
    runnerId: "socket-shark",
    sessionKey: "SS-406",
    agentType: "codex",
    startOffsetMs: scaleDemoOffset(420_000),
    durationMs: scaleDemoOffset(115_000),
    finalStatus: "failed",
    summary: "Lost the first replay because the staging socket closed before the checkpoint landed.",
    runningSummary: "Replaying the staging socket path after the first checkpoint failed to land cleanly.",
    tokenUsage: 15_200,
    filesTouchedCount: 3,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Started the staging replay from the last stable checkpoint on the socket path.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.08,
        filesTouchedRatio: 0.34,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(30_000),
        eventType: "agent.prompt.executed",
        summary: "Replaying the staging socket path and watching for the first reconnect boundary.",
        category: "network",
        status: "running",
        tokenUsageRatio: 0.38,
        filesTouchedRatio: 0.67,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(72_000),
        eventType: "agent.summary.updated",
        summary: "The replay drifted after a socket reset and the runner is preparing a checkpoint retry.",
        category: "network",
        status: "warning",
        tokenUsageRatio: 0.76,
        filesTouchedRatio: 1,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(115_000),
        eventType: "agent.session.failed",
        summary: "Lost the first replay because the staging socket closed before the checkpoint landed.",
        category: "network",
        status: "failed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
  {
    id: "stack-sparrow-session-1",
    runnerId: "stack-sparrow",
    sessionKey: "SP-033",
    agentType: "claude-code",
    startOffsetMs: scaleDemoOffset(340_000),
    durationMs: scaleDemoOffset(160_000),
    finalStatus: "completed",
    summary: "Wrapped the release notes and synchronized the staging rollout checklist.",
    runningSummary: "Composing release notes and synchronizing the staging rollout checklist.",
    tokenUsage: 21_700,
    filesTouchedCount: 5,
    timeline: [
      {
        key: "started",
        offsetMs: 0,
        eventType: "agent.session.started",
        summary: "Picked up the release-note pass and loaded the rollout checklist for staging.",
        category: "session",
        status: "running",
        tokenUsageRatio: 0.08,
        filesTouchedRatio: 0.2,
      },
      {
        key: "checkpoint-1",
        offsetMs: scaleDemoOffset(42_000),
        eventType: "agent.prompt.executed",
        summary: "Drafting the release-note handoff and synchronizing it with the rollout checklist.",
        category: "planning",
        status: "running",
        tokenUsageRatio: 0.35,
        filesTouchedRatio: 0.4,
      },
      {
        key: "checkpoint-2",
        offsetMs: scaleDemoOffset(104_000),
        eventType: "agent.summary.updated",
        summary: "Finalizing the release-note narrative and lining it up with the staging rollout plan.",
        category: "recovery",
        status: "running",
        tokenUsageRatio: 0.74,
        filesTouchedRatio: 0.8,
      },
      {
        key: "final",
        offsetMs: scaleDemoOffset(160_000),
        eventType: "agent.session.completed",
        summary: "Wrapped the release notes and synchronized the staging rollout checklist.",
        category: "session",
        status: "completed",
        tokenUsageRatio: 1,
        filesTouchedRatio: 1,
      },
    ],
  },
];

const demoEventSeeds: DemoEventSeed[] = [
  ...demoRunnerSeeds.map<DemoEventSeed>((runner) => ({
    id: `${runner.id}-join`,
    runnerId: runner.id,
    sessionId: null,
    sessionKey: null,
    eventType: "agent.summary.updated",
    offsetMs: runner.joinOffsetMs,
    agentType: runner.agentType,
    summary: runner.joinSummary,
    category: runner.joinCategory,
  })),
  ...demoSessionSeeds.flatMap<DemoEventSeed>((session) => {
    const runner = demoRunnerSeeds.find((candidate) => candidate.id === session.runnerId);

    return session.timeline.map((entry) => ({
      id: `${session.id}-${entry.key}`,
      runnerId: session.runnerId,
      sessionId: session.id,
      sessionKey: session.sessionKey,
      eventType: entry.eventType,
      offsetMs: session.startOffsetMs + entry.offsetMs,
      agentType: runner?.agentType ?? session.agentType,
      summary: entry.summary,
      category: entry.category,
      status: entry.status,
      tokenUsage: buildTokenCheckpoint(session.tokenUsage, entry.tokenUsageRatio),
      filesTouchedCount: buildFileCheckpoint(session.filesTouchedCount, entry.filesTouchedRatio),
    }));
  }),
].sort((left, right) => left.offsetMs - right.offsetMs);

const buildVisibleEvents = (offsetMs: number, demoStartMs: number) =>
  sortEventsDescending(
    demoEventSeeds
      .filter((event) => event.offsetMs <= offsetMs)
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
            agentType: event.agentType,
            ...(event.sessionKey ? { sessionKey: event.sessionKey } : {}),
            summary: event.summary,
            category: event.category,
            ...(event.status ? { status: event.status } : {}),
            ...(event.tokenUsage != null ? { tokenUsage: event.tokenUsage } : {}),
            ...(event.filesTouchedCount != null ? { filesTouchedCount: event.filesTouchedCount } : {}),
          },
        };
      }),
  );

const buildVisibleSessions = (offsetMs: number, demoStartMs: number, events: EventListItem[]) =>
  demoSessionSeeds
    .filter((session) => offsetMs >= session.startOffsetMs)
    .map<SessionListItem>((session) => {
      const elapsed = Math.max(0, offsetMs - session.startOffsetMs);
      const hasEnded = elapsed >= session.durationMs;
      const startedAt = atTimestamp(session.startOffsetMs, demoStartMs);
      const endedAt = hasEnded ? atTimestamp(session.startOffsetMs + session.durationMs, demoStartMs) : null;
      const eventCount = events.filter((event) => event.sessionId === session.id).length;
      const progress = Math.min(1, Math.max(0.2, elapsed / session.durationMs));
      const runner = demoRunnerSeeds.find((candidate) => candidate.id === session.runnerId);

      return {
        id: session.id,
        runnerId: session.runnerId,
        runnerName: runner?.name ?? session.runnerId,
        agentType: session.agentType,
        sessionKey: session.sessionKey,
        status: hasEnded ? session.finalStatus : "running",
        startedAt,
        endedAt,
        summary: hasEnded ? session.summary : session.runningSummary,
        tokenUsage: hasEnded ? session.tokenUsage : Math.round(session.tokenUsage * progress),
        durationMs: hasEnded ? session.durationMs : elapsed,
        filesTouchedCount: hasEnded ? session.filesTouchedCount : Math.max(1, Math.round(session.filesTouchedCount * progress)),
        eventCount,
      };
    });

const groupRunnersByLabel = (runners: RunnerListItem[]) => {
  const groups = new Map<
    string,
    {
      label: string;
      runnerCount: number;
      onlineCount: number;
      activeSessionCount: number;
      runners: RunnerListItem[];
    }
  >();

  for (const runner of runners) {
    for (const label of runner.labels) {
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
    .map<RunnerLabelGroup>((group) => ({
      label: group.label,
      runnerCount: group.runnerCount,
      onlineCount: group.onlineCount,
      activeSessionCount: group.activeSessionCount,
      runners: [...group.runners].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => {
      if (left.runnerCount !== right.runnerCount) {
        return right.runnerCount - left.runnerCount;
      }

      return left.label.localeCompare(right.label);
    });
};

const buildVisibleRunners = (offsetMs: number, demoStartMs: number, sessions: SessionListItem[], events: EventListItem[]) =>
  demoRunnerSeeds
    .filter((runner) => offsetMs >= runner.joinOffsetMs)
    .map<RunnerListItem>((runner) => {
      const runnerSessions = sessions.filter((session) => session.runnerId === runner.id);
      const runnerEvents = events
        .filter((event) => event.runnerId === runner.id)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      const activeSessionCount = runnerSessions.filter((session) => session.status === "running").length;
      const isOnline = !(runner.disconnectWindows ?? []).some((window) => isWithinWindow(offsetMs, window));
      const lastEventTimestamp = runnerEvents[0]?.createdAt ?? null;
      const onlineLastSeenAt = atTimestamp(Math.max(runner.joinOffsetMs, offsetMs - 12_000), demoStartMs);

      return {
        id: runner.id,
        name: runner.name,
        machineName: runner.machineName,
        hostname: runner.hostname,
        os: "macOS 15.4",
        architecture: "arm64",
        status: isOnline ? "online" : "offline",
        labels: runner.labels,
        environment: runner.environment,
        createdAt: atTimestamp(Math.max(0, runner.joinOffsetMs - scaleDemoOffset(20_000)), demoStartMs),
        updatedAt: atTimestamp(offsetMs, demoStartMs),
        lastSeenAt: isOnline ? onlineLastSeenAt : lastEventTimestamp,
        isOnline,
        activeSessionCount,
      };
    });

const buildStats = (runners: RunnerListItem[], sessions: SessionListItem[], events: EventListItem[]): StatsResponse => ({
  totalRunners: runners.length,
  onlineRunners: runners.filter((runner) => runner.isOnline).length,
  activeSessions: sessions.filter((session) => session.status === "running").length,
  sessionsLast24h: sessions.length,
  eventsLast24h: events.length,
  failedSessionsLast24h: sessions.filter((session) => session.status === "failed").length,
});

const buildAlerts = (runners: RunnerListItem[], sessions: SessionListItem[], events: EventListItem[]): AlertItem[] => {
  const failedSessions = [...sessions]
    .filter((session) => session.status === "failed")
    .sort((left, right) => new Date(right.endedAt ?? right.startedAt).getTime() - new Date(left.endedAt ?? left.startedAt).getTime());
  const offlineRunners = runners.filter((runner) => !runner.isOnline);
  const runningSessions = sessions.filter((session) => session.status === "running");
  const alerts: AlertItem[] = [];

  if (failedSessions.length > 0) {
    const latestFailedSession = failedSessions[0];

    alerts.push({
      id: "failed-sessions",
      severity: "critical",
      title: `${failedSessions.length} failed ${failedSessions.length === 1 ? "session" : "sessions"} in the active window`,
      detail:
        latestFailedSession?.summary ??
        "One or more sessions have failed in the current dashboard slice.",
      count: failedSessions.length,
      ...(latestFailedSession ? { href: `/session/${latestFailedSession.id}` } : {}),
    });
  }

  if (offlineRunners.length > 0) {
    const sampleNames = offlineRunners
      .slice(0, 2)
      .map((runner) => runner.name)
      .join(", ");
    const overflow = offlineRunners.length - Math.min(offlineRunners.length, 2);

    alerts.push({
      id: "runner-heartbeats",
      severity: "warning",
      title: `${offlineRunners.length} ${offlineRunners.length === 1 ? "runner" : "runners"} awaiting heartbeat`,
      detail:
        overflow > 0
          ? `${sampleNames}, plus ${overflow} more runners, are currently offline or idle.`
          : `${sampleNames} ${offlineRunners.length === 1 ? "is" : "are"} currently offline or idle.`,
      count: offlineRunners.length,
    });
  }

  if (runningSessions.length > 0) {
    alerts.push({
      id: "live-activity",
      severity: "info",
      title: `${runningSessions.length} running ${runningSessions.length === 1 ? "session" : "sessions"}`,
      detail: "Live work is still progressing in the current dashboard slice.",
      count: runningSessions.length,
    });
  }

  if (alerts.length === 0) {
    alerts.push(
      events.length === 0
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

  return alerts.slice(0, 3);
};

const buildAnalytics = (sessions: SessionListItem[], events: EventListItem[]): DemoAnalyticsSnapshot => {
  const agentTypeCounts = new Map<string, number>();
  const failureCounts = new Map<string, number>();
  const runnerCounts = new Map<string, number>();
  const eventTimeseriesCounts = new Map<string, number>();

  for (const session of sessions) {
    agentTypeCounts.set(session.agentType, (agentTypeCounts.get(session.agentType) ?? 0) + 1);
    runnerCounts.set(session.runnerId, (runnerCounts.get(session.runnerId) ?? 0) + 1);
  }

  for (const event of events) {
    const bucket = event.createdAt.slice(0, 16);
    eventTimeseriesCounts.set(bucket, (eventTimeseriesCounts.get(bucket) ?? 0) + 1);

    if ((event.payload.status === "failed" || event.payload.status === "warning") && event.payload.category && failureCategories.has(event.payload.category)) {
      failureCounts.set(event.payload.category, (failureCounts.get(event.payload.category) ?? 0) + 1);
    }
  }

  return {
    agentTypes: toBreakdown(agentTypeCounts),
    failures: toBreakdown(failureCounts),
    runnerActivity: {
      items: [...runnerCounts.entries()]
        .map(([runnerId, sessionCount]) => ({
          runnerId,
          runnerName: demoRunnerSeeds.find((runner) => runner.id === runnerId)?.name ?? runnerId,
          sessionCount,
        }))
        .sort((left, right) => {
          if (left.sessionCount !== right.sessionCount) {
            return right.sessionCount - left.sessionCount;
          }

          return left.runnerName.localeCompare(right.runnerName);
        }),
    },
    eventTimeseries: {
      points: [...eventTimeseriesCounts.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .slice(-8)
        .map(([bucketStart, count]) => ({
          bucketStart: `${bucketStart}:00.000Z`,
          count,
        })),
    },
  };
};

export const buildDemoCatalogSnapshot = (timestampMs: number, demoStartMs: number): DemoCatalogSnapshot => {
  const offsetMs = cycleOffset(timestampMs, demoStartMs);
  const events = buildVisibleEvents(offsetMs, demoStartMs);
  const sessions = sortSessions(buildVisibleSessions(offsetMs, demoStartMs, events));
  const runners = buildVisibleRunners(offsetMs, demoStartMs, sessions, events);
  const runnerGroups = groupRunnersByLabel(runners);

  return {
    stats: buildStats(runners, sessions, events),
    runnerGroups,
    runners,
    sessions,
    events,
    alerts: buildAlerts(runners, sessions, events),
    analytics: buildAnalytics(sessions, events),
  };
};

export const buildDemoReplayPlan = (timestampMs: number, demoStartMs: number): DemoReplayPlan => {
  const offsetMs = cycleOffset(timestampMs, demoStartMs);
  const snapshot = buildDemoCatalogSnapshot(timestampMs, demoStartMs);
  const heartbeatRunnerIds = new Set<string>([
    ...snapshot.runners.filter((runner) => !runner.isOnline).map((runner) => runner.id),
    ...snapshot.runners.filter((runner) => runner.activeSessionCount > 0).map((runner) => runner.id),
  ]);
  const eventsByRunner = new Map<string, TelemetryEventEnvelope[]>();

  for (const event of sortEventsDescending(snapshot.events).reverse()) {
    const bucket = eventsByRunner.get(event.runnerId) ?? [];
    bucket.push({
      eventType: event.eventType,
      payload: event.payload,
    });
    eventsByRunner.set(event.runnerId, bucket);
  }

  return {
    demoStartMs,
    offsetMs,
    snapshot,
    runners: demoRunnerSeeds
      .filter((runner) => offsetMs >= runner.joinOffsetMs)
      .map((seed) => {
        const snapshotRunner = snapshot.runners.find((runner) => runner.id === seed.id);

        return {
          seed,
          activeSessionCount: snapshotRunner?.activeSessionCount ?? 0,
          lastSeenAt: heartbeatRunnerIds.has(seed.id) ? snapshotRunner?.lastSeenAt ?? null : null,
          telemetryEvents: eventsByRunner.get(seed.id) ?? [],
        };
      }),
  };
};

export const getDemoSecurityIncident = (runnerId: string, timestampMs: number, demoStartMs: number): DemoSecurityIncident | null => {
  if (runnerId !== securityIncidentRunnerId) {
    return null;
  }

  const offsetMs = cycleOffset(timestampMs, demoStartMs);
  const incidentSeed = demoEventSeeds.find((event) => event.id === securityIncidentEventId);

  if (!incidentSeed || offsetMs < incidentSeed.offsetMs) {
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
    startedAt: atTimestamp(incidentSeed.offsetMs, demoStartMs),
  };
};

export const isKnownDemoRunner = (runnerId: string) => demoRunnerSeeds.some((runner) => runner.id === runnerId);

export const buildDemoSessionDetail = (sessionId: string, timestampMs: number, demoStartMs: number): SessionDetail | null => {
  const snapshot = buildDemoCatalogSnapshot(timestampMs, demoStartMs);
  const session = snapshot.sessions.find((candidate) => candidate.id === sessionId);

  if (!session) {
    return null;
  }

  return {
    ...session,
    events: snapshot.events
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
  };
};

export const createDemoStartValue = (timestampMs = Date.now()) => timestampMs - demoDefaultOffsetMs;
