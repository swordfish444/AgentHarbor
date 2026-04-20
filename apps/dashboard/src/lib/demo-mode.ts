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

export const buildDemoDashboardData = (timestampMs: number, demoStartMs: number): DashboardData =>
  buildDemoCatalogSnapshot(timestampMs, demoStartMs);

export const buildDemoSessionDetail = (sessionId: string, timestampMs: number, demoStartMs: number) =>
  buildSharedDemoSessionDetail(sessionId, timestampMs, demoStartMs);
