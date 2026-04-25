import type { DashboardData } from "./control-node";

const appendMissingById = <T extends { id: string }>(currentItems: T[], fallbackItems: T[]) => {
  const seenIds = new Set(currentItems.map((item) => item.id));

  return [...currentItems, ...fallbackItems.filter((item) => !seenIds.has(item.id))];
};

export const pinDemoAgentDetailData = (currentData: DashboardData, initialData: DashboardData, agentId: string): DashboardData => {
  const initialRunner = initialData.runners.find((runner) => runner.id === agentId) ?? null;
  const initialSessions = initialData.sessions.filter((session) => session.runnerId === agentId);
  const initialEvents = initialData.events.filter((event) => event.runnerId === agentId);
  const runnerIsVisible = currentData.runners.some((runner) => runner.id === agentId);

  if (!initialRunner && initialSessions.length === 0 && initialEvents.length === 0) {
    return currentData;
  }

  return {
    ...currentData,
    runners: runnerIsVisible || !initialRunner ? currentData.runners : [...currentData.runners, initialRunner],
    sessions: appendMissingById(currentData.sessions, initialSessions),
    events: appendMissingById(currentData.events, initialEvents),
  };
};
