import type { EventListItem, RunnerListItem, SessionListItem, StatsResponse } from "@agentharbor/shared";

export interface AlertPreviewItem {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  href?: string;
}

export interface AnalyticsPreviewSection {
  id: string;
  title: string;
  description: string;
  points: Array<{
    label: string;
    value: number;
  }>;
}

export interface DashboardFixtureState {
  stats: StatsResponse;
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
  alerts: AlertPreviewItem[];
  analytics: AnalyticsPreviewSection[];
}

export const dashboardFixtures = {
  healthy: {
    stats: {
      totalRunners: 4,
      onlineRunners: 4,
      activeSessions: 3,
      sessionsLast24h: 18,
      eventsLast24h: 126,
      failedSessionsLast24h: 1,
    },
    runners: [
      {
        id: "runner-healthy-1",
        name: "mission-codex-1",
        machineName: "demo-base",
        hostname: "demo-base-1",
        os: "macos 15.0",
        architecture: "arm64",
        status: "online",
        labels: ["demo", "happy-path", "codex"],
        environment: "demo",
        createdAt: "2026-04-02T13:00:00.000Z",
        updatedAt: "2026-04-02T13:15:00.000Z",
        lastSeenAt: "2026-04-02T13:15:00.000Z",
        isOnline: true,
        activeSessionCount: 1,
      },
      {
        id: "runner-healthy-2",
        name: "mission-claude-2",
        machineName: "demo-base",
        hostname: "demo-base-2",
        os: "macos 15.0",
        architecture: "arm64",
        status: "online",
        labels: ["demo", "happy-path", "claude-code"],
        environment: "demo",
        createdAt: "2026-04-02T13:02:00.000Z",
        updatedAt: "2026-04-02T13:15:00.000Z",
        lastSeenAt: "2026-04-02T13:15:00.000Z",
        isOnline: true,
        activeSessionCount: 1,
      },
    ],
    sessions: [
      {
        id: "session-healthy-1",
        runnerId: "runner-healthy-1",
        runnerName: "mission-codex-1",
        agentType: "codex",
        sessionKey: "mission-codex-1-happy-path-1",
        status: "running",
        startedAt: "2026-04-02T13:11:00.000Z",
        endedAt: null,
        summary: "Implementing the filterable dashboard shell with typed control-node contracts.",
        tokenUsage: 1420,
        durationMs: null,
        filesTouchedCount: 7,
        eventCount: 4,
      },
      {
        id: "session-healthy-2",
        runnerId: "runner-healthy-2",
        runnerName: "mission-claude-2",
        agentType: "claude-code",
        sessionKey: "mission-claude-2-happy-path-1",
        status: "completed",
        startedAt: "2026-04-02T12:45:00.000Z",
        endedAt: "2026-04-02T12:58:00.000Z",
        summary: "Validated the updated query contract against the backend demo slice.",
        tokenUsage: 980,
        durationMs: 780000,
        filesTouchedCount: 4,
        eventCount: 5,
      },
    ],
    events: [
      {
        id: "event-healthy-1",
        runnerId: "runner-healthy-1",
        runnerName: "mission-codex-1",
        sessionId: "session-healthy-1",
        sessionKey: "mission-codex-1-happy-path-1",
        eventType: "agent.summary.updated",
        payload: {
          timestamp: "2026-04-02T13:14:00.000Z",
          agentType: "codex",
          sessionKey: "mission-codex-1-happy-path-1",
          summary: "Dashboard sections are in place and ready for URL-driven data wiring.",
          category: "implementation",
          tokenUsage: 1420,
          filesTouchedCount: 7,
          status: "in-progress",
        },
        createdAt: "2026-04-02T13:14:00.000Z",
      },
    ],
    alerts: [
      {
        id: "healthy-1",
        severity: "info",
        title: "Preview alert rail",
        detail: "Phase 3 will replace these placeholders with live failures and runner health signals.",
      },
      {
        id: "healthy-2",
        severity: "warning",
        title: "One recent failure in the last 24h",
        detail: "The current fleet is healthy, but the global totals still show one failure worth drilling into later.",
        href: "/?status=failed",
      },
    ],
    analytics: [
      {
        id: "healthy-agents",
        title: "Sessions by agent type",
        description: "Preview distribution while aggregate endpoints are still pending.",
        points: [
          { label: "Codex", value: 6 },
          { label: "Claude", value: 4 },
          { label: "Cursor", value: 3 },
          { label: "Automation", value: 2 },
        ],
      },
      {
        id: "healthy-events",
        title: "Event volume preview",
        description: "A placeholder trend card for the future live analytics section.",
        points: [
          { label: "T-30m", value: 18 },
          { label: "T-20m", value: 27 },
          { label: "T-10m", value: 34 },
          { label: "Now", value: 22 },
        ],
      },
      {
        id: "healthy-failures",
        title: "Failure category preview",
        description: "Stable categories are available now even though live rollups come later.",
        points: [
          { label: "Build", value: 2 },
          { label: "Test", value: 1 },
          { label: "Network", value: 1 },
        ],
      },
    ],
  },
  failure: {
    stats: {
      totalRunners: 4,
      onlineRunners: 3,
      activeSessions: 1,
      sessionsLast24h: 14,
      eventsLast24h: 141,
      failedSessionsLast24h: 5,
    },
    runners: [
      {
        id: "runner-failure-1",
        name: "mission-codex-3",
        machineName: "demo-base",
        hostname: "demo-base-3",
        os: "macos 15.0",
        architecture: "arm64",
        status: "online",
        labels: ["demo", "failure-burst", "codex"],
        environment: "demo",
        createdAt: "2026-04-02T14:00:00.000Z",
        updatedAt: "2026-04-02T14:10:00.000Z",
        lastSeenAt: "2026-04-02T14:10:00.000Z",
        isOnline: true,
        activeSessionCount: 0,
      },
    ],
    sessions: [
      {
        id: "session-failure-1",
        runnerId: "runner-failure-1",
        runnerName: "mission-codex-3",
        agentType: "codex",
        sessionKey: "mission-codex-3-failure-burst-1",
        status: "failed",
        startedAt: "2026-04-02T14:01:00.000Z",
        endedAt: "2026-04-02T14:05:00.000Z",
        summary: "The build pipeline kept failing after repeated dependency errors.",
        tokenUsage: 1250,
        durationMs: 240000,
        filesTouchedCount: 5,
        eventCount: 5,
      },
    ],
    events: [
      {
        id: "event-failure-1",
        runnerId: "runner-failure-1",
        runnerName: "mission-codex-3",
        sessionId: "session-failure-1",
        sessionKey: "mission-codex-3-failure-burst-1",
        eventType: "agent.session.failed",
        payload: {
          timestamp: "2026-04-02T14:05:00.000Z",
          agentType: "codex",
          sessionKey: "mission-codex-3-failure-burst-1",
          summary: "Session failed after repeated build errors.",
          category: "failure",
          durationMs: 240000,
          tokenUsage: 1250,
          filesTouchedCount: 5,
          status: "failed",
        },
        createdAt: "2026-04-02T14:05:00.000Z",
      },
    ],
    alerts: [
      {
        id: "failure-1",
        severity: "critical",
        title: "Failed session surfaced",
        detail: "mission-codex-3 hit a failure burst with repeated build errors and now needs a drilldown path.",
        href: "/?status=failed&label=demo",
      },
      {
        id: "failure-2",
        severity: "warning",
        title: "Failure-heavy preview",
        detail: "The future live alert rail should rank this burst ahead of general throughput updates.",
      },
      {
        id: "failure-3",
        severity: "info",
        title: "Demo label available",
        detail: "All preview runners keep the demo label and environment metadata for UI filtering.",
        href: "/?label=demo",
      },
    ],
    analytics: [
      {
        id: "failure-categories",
        title: "Failure categories preview",
        description: "Stable categories from the backend branch are ready for a future live chart.",
        points: [
          { label: "Build", value: 5 },
          { label: "Failure", value: 3 },
          { label: "Test", value: 2 },
        ],
      },
      {
        id: "failure-agents",
        title: "Agent mix under load",
        description: "Preview how a categorical chart can spotlight the busiest agent type.",
        points: [
          { label: "Codex", value: 8 },
          { label: "Claude", value: 3 },
          { label: "Automation", value: 1 },
        ],
      },
      {
        id: "failure-volume",
        title: "Recent event intensity",
        description: "A trend placeholder that will become a real aggregate panel later.",
        points: [
          { label: "T-30m", value: 12 },
          { label: "T-20m", value: 18 },
          { label: "T-10m", value: 42 },
          { label: "Now", value: 37 },
        ],
      },
    ],
  },
  empty: {
    stats: {
      totalRunners: 0,
      onlineRunners: 0,
      activeSessions: 0,
      sessionsLast24h: 0,
      eventsLast24h: 0,
      failedSessionsLast24h: 0,
    },
    runners: [],
    sessions: [],
    events: [],
    alerts: [
      {
        id: "empty-1",
        severity: "info",
        title: "Awaiting demo traffic",
        detail: "This placeholder state keeps the screen legible before the first runner heartbeat arrives.",
      },
    ],
    analytics: [
      {
        id: "empty-analytics",
        title: "Analytics preview",
        description: "Charts remain in place even before the dashboard has live aggregate data.",
        points: [
          { label: "Codex", value: 0 },
          { label: "Claude", value: 0 },
          { label: "Cursor", value: 0 },
        ],
      },
    ],
  },
} satisfies Record<string, DashboardFixtureState>;

export type DashboardFixtureVariant = keyof typeof dashboardFixtures;

export const selectDashboardFixtureVariant = (data: {
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
}): DashboardFixtureVariant => {
  if (data.runners.length === 0 && data.sessions.length === 0 && data.events.length === 0) {
    return "empty";
  }

  if (
    data.sessions.some((session) => session.status === "failed") ||
    data.events.some((event) => event.eventType === "agent.session.failed" || event.payload.category === "failure")
  ) {
    return "failure";
  }

  return "healthy";
};
