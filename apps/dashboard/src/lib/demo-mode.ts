import {
  buildDemoCatalogSnapshot,
  buildDemoSessionDetail as buildSharedDemoSessionDetail,
  createDemoStartValue,
  demoCycleMs,
  demoDefaultOffsetMs,
  getDemoSecurityIncident,
  isKnownDemoRunner,
  type DemoSecurityIncident,
} from "@agentharbor/shared";
import type { DashboardData } from "./control-node";

export { createDemoStartValue, demoCycleMs, demoDefaultOffsetMs, getDemoSecurityIncident, isKnownDemoRunner };
export type { DemoSecurityIncident };

export interface DemoPlaybackState {
  demoStart: number;
  demoAnchor: number;
}

export const demoPlaybackSpeedFactor = 5;

const parseNumericSearchParam = (value: string | string[] | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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
  };
};

export const buildDemoSearch = (demoState: DemoPlaybackState | null | undefined) =>
  demoState ? `?demo=1&demoStart=${demoState.demoStart}&demoAnchor=${demoState.demoAnchor}` : "";

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
) => buildSharedDemoSessionDetail(sessionId, clockMs, buildDemoPlaybackStartValue(clockMs, initialDemoStartMs, renderedAtMs));

export const getDemoPlaybackSecurityIncident = (
  runnerId: string,
  clockMs: number,
  initialDemoStartMs: number,
  renderedAtMs: number,
) => getDemoSecurityIncident(runnerId, clockMs, buildDemoPlaybackStartValue(clockMs, initialDemoStartMs, renderedAtMs));
