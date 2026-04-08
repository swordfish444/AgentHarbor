import type { DashboardData } from "./control-node";

export interface DashboardAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  href?: string;
}

const severityOrder: Record<DashboardAlert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function buildDashboardAlerts(data: DashboardData): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  const failedSession = data.sessions.find((session) => session.status === "failed");
  if (failedSession) {
    alerts.push({
      id: `failed-${failedSession.id}`,
      severity: "critical",
      title: "Failed session surfaced",
      detail: failedSession.summary ?? `${failedSession.runnerName} failed.`,
      href: `/session/${failedSession.id}`,
    });
  }

  const offlineRunners = data.runners.filter((runner) => runner.status === "offline");
  if (offlineRunners.length > 0) {
    alerts.push({
      id: "offline-runners",
      severity: "warning",
      title: `${offlineRunners.length} runners offline`,
      detail: "One or more enrolled machines have stopped reporting heartbeats.",
      href: "/",
    });
  }

  if (data.stats.activeSessions === 0 && data.runners.length > 0) {
    alerts.push({
      id: "no-active-sessions",
      severity: "info",
      title: "No active sessions",
      detail: "The fleet is visible, but nothing is currently running.",
      href: "/?status=running",
    });
  }

  return alerts
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
    .slice(0, 5);
}
