import {
  buildDemoCatalogSnapshot,
  buildDemoFinalSessionDetail,
  buildDemoPrimaryIncidentSessionDetail,
  buildDemoSessionDetail as buildSharedDemoSessionDetail,
  createDemoStartValue,
  demoCycleMs,
  demoDefaultOffsetMs,
  demoPrimaryIncidentRunnerId,
  demoPrimaryIncidentSessionId,
  demoPrimaryRecoverySessionId,
  getDemoSecurityIncident,
  isKnownDemoRunner,
  type DemoSecurityIncident,
} from "@agentharbor/shared";
import type { DashboardData } from "./control-node";

export {
  createDemoStartValue,
  demoCycleMs,
  demoDefaultOffsetMs,
  demoPrimaryIncidentRunnerId,
  demoPrimaryIncidentSessionId,
  demoPrimaryRecoverySessionId,
  getDemoSecurityIncident,
  isKnownDemoRunner,
};
export type { DemoSecurityIncident };

export interface DemoPlaybackState {
  demoStart: number;
  demoAnchor: number;
  demoResolved?: string | null;
}

export const demoPlaybackSpeedFactor = 5;

const parseNumericSearchParam = (value: string | string[] | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStringSearchParam = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export const resolveDemoPlaybackState = (
  searchParams: Record<string, string | string[] | undefined>,
  nowMs = Date.now(),
): DemoPlaybackState | null => {
  if (searchParams.demo !== "1") {
    return null;
  }

  return {
    demoStart: parseNumericSearchParam(searchParams.demoStart) ?? createDemoStartValue(nowMs),
    demoAnchor: parseNumericSearchParam(searchParams.demoAnchor) ?? nowMs,
    demoResolved: parseStringSearchParam(searchParams.demoResolved),
  };
};

export const buildDemoSearch = (demoState: DemoPlaybackState | null | undefined) =>
  demoState
    ? `?demo=1&demoStart=${demoState.demoStart}&demoAnchor=${demoState.demoAnchor}${
        demoState.demoResolved ? `&demoResolved=${encodeURIComponent(demoState.demoResolved)}` : ""
      }`
    : "";

const cycleOffset = (timestampMs: number, demoStartMs: number) => {
  const offset = (timestampMs - demoStartMs) % demoCycleMs;
  return offset >= 0 ? offset : offset + demoCycleMs;
};

export const buildDemoPlaybackStartValue = (
  clockMs: number,
  initialDemoStartMs: number,
  renderedAtMs: number,
  speedFactor = demoPlaybackSpeedFactor,
) => {
  const initialOffsetMs = cycleOffset(renderedAtMs, initialDemoStartMs);
  const elapsedMs = Math.max(0, clockMs - renderedAtMs);
  const acceleratedOffsetMs = (initialOffsetMs + elapsedMs * speedFactor) % demoCycleMs;

  return clockMs - acceleratedOffsetMs;
};

export const buildDemoDashboardData = (timestampMs: number, demoStartMs: number): DashboardData =>
  buildDemoCatalogSnapshot(timestampMs, demoStartMs);

export const buildDemoPlaybackDashboardData = (
  clockMs: number,
  initialDemoStartMs: number,
  renderedAtMs: number,
): DashboardData => buildDemoCatalogSnapshot(clockMs, buildDemoPlaybackStartValue(clockMs, initialDemoStartMs, renderedAtMs));

export const buildDemoSessionDetail = (sessionId: string, timestampMs: number, demoStartMs: number) =>
  buildSharedDemoSessionDetail(sessionId, timestampMs, demoStartMs);

export const buildDemoPlaybackSessionDetail = (
  sessionId: string,
  clockMs: number,
  initialDemoStartMs: number,
  renderedAtMs: number,
) => {
  const playbackDemoStartMs = buildDemoPlaybackStartValue(clockMs, initialDemoStartMs, renderedAtMs);
  const visibleSession = buildSharedDemoSessionDetail(sessionId, clockMs, playbackDemoStartMs);

  if (sessionId === demoPrimaryIncidentSessionId && visibleSession?.status !== "failed") {
    return buildDemoPrimaryIncidentSessionDetail(playbackDemoStartMs);
  }

  if (sessionId === demoPrimaryRecoverySessionId && visibleSession?.status !== "completed") {
    return buildDemoFinalSessionDetail(sessionId, playbackDemoStartMs);
  }

  if (visibleSession) {
    return visibleSession;
  }

  if (sessionId === demoPrimaryRecoverySessionId) {
    return buildDemoFinalSessionDetail(sessionId, playbackDemoStartMs);
  }

  return sessionId === demoPrimaryIncidentSessionId ? buildDemoPrimaryIncidentSessionDetail(playbackDemoStartMs) : null;
};

export const getDemoPlaybackSecurityIncident = (
  runnerId: string,
  clockMs: number,
  initialDemoStartMs: number,
  renderedAtMs: number,
) => getDemoSecurityIncident(runnerId, clockMs, buildDemoPlaybackStartValue(clockMs, initialDemoStartMs, renderedAtMs));
