# AgentHarbor Implementation Priorities

## Purpose

This document turns the current repo status into the next concrete delivery plan.
It lists:

1. the next five frontend tasks in the order they should be done
2. the next three backend tasks in the order they should be done
3. implementation phases that sequence the work across both teams
4. code sketches and detailed guidance tied to the current codebase

The intent is to move the project from:

- frontend with a strong skeleton and partial live behavior
- backend with a strong demo contract and real telemetry plumbing

to:

- a dashboard that is fully driven by real backend data
- a demo flow that is believable, repeatable, and easy to rehearse

---

## Current Snapshot

### Frontend

What is already good:

- The dashboard shell, filter plumbing, fleet table, sessions panel, live feed, and session detail route exist.
- The visual system is already strong and responsive.
- The dashboard can subscribe to the stream and refresh itself when events arrive.

What is still incomplete:

- The alert rail is still fixture-driven.
- The analytics panel is still fixture-driven.
- The filter bar does not expose a real time-window control yet.
- The session detail page is usable, but not yet presentation-grade.
- Loading and error handling are still thin for rehearsal/demo conditions.

### Backend

What is already good:

- Enrollment, heartbeat, telemetry ingestion, sessions, events, runner grouping, token revocation, SSE, and analytics endpoints are implemented.
- Shared schemas are typed and validated.
- The runner CLI can generate happy-path and failure-burst traffic with automatic heartbeats.

What is still incomplete:

- Stats and analytics are still global 24-hour aggregates instead of filter-aware dashboard aggregates.
- There is no dedicated alert summary contract for the frontend.
- The demo runner does not yet cover the richer scenario set described in the planning docs.

### Critical Precondition: Shared Booth Networking

Before the team spends much more time polishing the dashboard, it needs to prove the demo topology works on a real shared network.
The most important unanswered question is not visual polish, it is whether one shared control node can successfully receive telemetry from multiple laptops on the same booth Wi-Fi network and show them all in one dashboard.

That smoke test should validate:

- one host laptop can run Postgres + control node
- the control node is reachable by LAN IP, not just `localhost`
- multiple runner laptops can enroll against that host
- one dashboard can read from that same control node and display all active runners and sessions
- local firewall, self-signed TLS, and network reachability problems are identified before rehearsal week

If this is not proven early, the team risks polishing a single-machine demo while assuming a multi-machine booth demo will just work later.

---

## Recommended Overall Order

This is the order the combined team should execute the next wave of work:

1. `PRE-0` Run a shared-control-node, multi-laptop booth smoke test on one Wi-Fi network.
2. `FE-5` Early resilience pass: add route loading UI, route error boundaries, and stop treating all session fetch failures as `404`.
3. `BE-1` Add filter-aware stats and analytics query support.
4. `FE-1` Replace fixture-based analytics with real backend analytics.
5. `BE-2` Add a real alert summary endpoint for the dashboard.
6. `FE-2` Replace fixture-based alert rail with real alert data.
7. `FE-3` Add a real time-window control and plumb it through the dashboard.
8. `FE-4` Upgrade the session detail page into a stronger failure drilldown.
9. `BE-3` Expand the demo scenario engine and add a rehearsal harness.
10. `FE-5` Final polish pass: improve SSE disconnect treatment and rehearsal-grade polish states.

Why this order:

- The team should prove the actual booth topology before assuming the demo is only a UI problem.
- Minimal loading/error handling should land before the larger integration tasks so backend and frontend work is easier to debug.
- Frontend analytics and time-window UX should not be built on top of global-only aggregates.
- The alert rail should stop being mocked before the team spends time polishing it visually.
- The richer demo engine matters, but it does not block replacing placeholder frontend surfaces with real data.

---

## Implementation Phases

### Phase 0: Shared Booth Network Validation

Goal:

- prove the real booth architecture works on a shared Wi-Fi network before the team optimizes the single-machine experience

Tasks:

- `PRE-0`

Output:

- one host laptop runs Postgres + control node
- multiple runner laptops successfully enroll against the host laptop's LAN IP
- one dashboard instance can see all shared runners and sessions
- firewall/TLS/network issues are identified before the main implementation work

Required checklist:

1. Choose one laptop to be the shared host for Postgres + control node.
2. Find its booth/Wi-Fi LAN IP address.
3. Confirm the control node is reachable from a second laptop using `curl -k https://<host-ip>:8443/health`.
4. Enroll at least two non-host laptops against that LAN IP rather than `localhost`.
5. Send heartbeats or demo telemetry from each of those laptops.
6. Run the dashboard against the same host control-node URL and confirm the shared fleet/session state is visible in one view.
7. Write down the exact commands, IP assumptions, and any firewall/TLS workarounds in a short booth runbook.

Recommended booth smoke-test commands:

On the host laptop:

```bash
CONTROL_NODE_HOST=0.0.0.0 \
CONTROL_NODE_PORT=8443 \
pnpm dev:control
```

On each runner laptop:

```bash
cd apps/runner
node dist/index.js enroll \
  --url https://<host-lan-ip>:8443 \
  --name booth-laptop-1 \
  --label demo \
  --environment booth \
  --allow-self-signed
node dist/index.js heartbeat-loop --interval-ms 10000
```

On the dashboard laptop:

```bash
AGENTHARBOR_CONTROL_NODE_URL=https://<host-lan-ip>:8443 \
AGENTHARBOR_ALLOW_SELF_SIGNED=true \
PORT=3003 \
pnpm dev:dashboard
```

Success criteria:

- the control node sees multiple runners from different laptops
- the dashboard shows them in one fleet view
- sessions and telemetry from those laptops appear in one shared feed

### Phase 1: Early Route Resilience

Goal:

- make the dashboard safer to build on before the larger integration work starts

Tasks:

- `FE-5` early subset

Output:

- route loading screens exist
- route error boundaries exist
- session detail fetch failures no longer get silently turned into `404`

Deliver this subset now:

- `apps/dashboard/src/app/loading.tsx`
- `apps/dashboard/src/app/error.tsx`
- `apps/dashboard/src/app/session/[id]/loading.tsx`
- `apps/dashboard/src/app/session/[id]/error.tsx`
- update the session detail route so only true missing sessions call `notFound()`

Leave this subset for later:

- long-lived stream disconnect treatment
- final rehearsal polish styling

### Phase 2: Contract And Aggregate Parity

Goal:

- make dashboard totals and charts truly filter-driven

Tasks:

- `BE-1`
- `FE-1`

Output:

- analytics panel uses real data
- stats and charts respond to query params

### Phase 3: Dashboard Truth Surfaces

Goal:

- remove placeholder operator surfaces near the top of the screen

Tasks:

- `BE-2`
- `FE-2`
- `FE-3`

Output:

- alert rail is real
- time window is visible and useful
- dashboard behavior matches the operator story in the planning doc

### Phase 4: Drilldown Quality

Goal:

- make failed-session storytelling clear and fast

Tasks:

- `FE-4`

Output:

- session detail tells a complete story without raw JSON inspection

### Phase 5: Demo Hardening

Goal:

- make the demo easy to run repeatedly and resilient during rehearsal

Tasks:

- `BE-3`
- `FE-5` final subset

Output:

- richer demo traffic
- polished empty/loading/error/disconnect states

At this point, finish the remaining `FE-5` work:

- improve the disconnected/reconnecting stream state
- add final polish for rehearsal-grade operator feedback
- smooth over any rough edges discovered during the shared booth smoke test

---

## Frontend Tasks

## FE-1: Replace Fixture Analytics With Real Backend Analytics

### Why this is first

Right now the analytics panel is explicitly a placeholder. The backend already has:

- `GET /v1/analytics/agent-types`
- `GET /v1/analytics/failures`
- `GET /v1/analytics/runners/activity`
- `GET /v1/analytics/events/timeseries`

The frontend should consume those endpoints instead of `dashboardFixtures`.

### Current Files

- `apps/dashboard/src/components/analytics-panel.tsx`
- `apps/dashboard/src/lib/control-node.ts`
- `apps/dashboard/src/components/dashboard-screen.tsx`
- `apps/dashboard/src/components/simple-bar-chart.tsx`

### Implementation Phases

#### Phase A: Extend dashboard data fetching

Add analytics fetchers to `apps/dashboard/src/lib/control-node.ts`.

Recommended shape:

```ts
import {
  analyticsBreakdownResponseSchema,
  eventTimeseriesResponseSchema,
  runnerActivityResponseSchema,
  type AnalyticsBreakdownResponse,
  type EventTimeseriesResponse,
  type RunnerActivityResponse,
} from "@agentharbor/shared";

export interface DashboardAnalytics {
  agentTypes: AnalyticsBreakdownResponse;
  failures: AnalyticsBreakdownResponse;
  runnerActivity: RunnerActivityResponse;
  eventTimeseries: EventTimeseriesResponse;
}

export interface DashboardData {
  stats: StatsResponse;
  runnerGroups: RunnerLabelGroup[];
  runners: RunnerListItem[];
  sessions: SessionListItem[];
  events: EventListItem[];
  analytics: DashboardAnalytics;
}
```

Fetch analytics in parallel with the rest of the dashboard data.

#### Phase B: Replace fixture props

Change `AnalyticsPanel` so it accepts real analytics data instead of a fixture variant.

Recommended prop shape:

```tsx
export function AnalyticsPanel({ analytics }: { analytics: DashboardAnalytics }) {
  const agentTypePoints = analytics.agentTypes.items.map((item) => ({
    label: item.label,
    value: item.count,
  }));

  const failurePoints = analytics.failures.items.map((item) => ({
    label: item.label,
    value: item.count,
  }));

  const eventVolumePoints = analytics.eventTimeseries.points.map((point) => ({
    label: new Date(point.bucketStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    value: point.count,
  }));

  return (
    <section className="panel">
      ...
    </section>
  );
}
```

#### Phase C: Preserve empty states

If analytics come back empty:

- keep the panel rendered
- show "No aggregate data yet"
- do not fall back to fake preview data

#### Phase D: Keep live behavior simple

Do not overbuild client-side chart patching yet.
The current stream-triggered `router.refresh()` is good enough for the first real version.

### Detailed Instructions

1. Remove the `variant` prop from `AnalyticsPanel`.
2. Add an `analytics` property to `DashboardData`.
3. Fetch all analytics endpoints inside `getDashboardData`.
4. Map the responses into the three charts the frontend plan calls for:
   - sessions by agent type
   - failures by category
   - event volume over time
5. If you want a fourth chart, use `runners/activity`.
6. Delete the analytics fixture dependency from the component.

### Code Sketch

```ts
const fetchAnalytics = async (query: DashboardQuery): Promise<DashboardAnalytics> => {
  const analyticsQuery = {
    since: query.since,
    label: query.label,
    runnerId: query.runnerId,
    agentType: query.agentType,
  };

  const [agentTypes, failures, runnerActivity, eventTimeseries] = await Promise.all([
    getJson(withQuery("/v1/analytics/agent-types", analyticsQuery), analyticsBreakdownResponseSchema),
    getJson(withQuery("/v1/analytics/failures", analyticsQuery), analyticsBreakdownResponseSchema),
    getJson(withQuery("/v1/analytics/runners/activity", analyticsQuery), runnerActivityResponseSchema),
    getJson(withQuery("/v1/analytics/events/timeseries", analyticsQuery), eventTimeseriesResponseSchema),
  ]);

  return {
    agentTypes,
    failures,
    runnerActivity,
    eventTimeseries,
  };
};
```

### Definition Of Done

- No analytics fixture data is shown anywhere.
- At least three charts are driven from backend data.
- Charts update when new telemetry arrives and the dashboard refreshes.

---

## FE-2: Replace Fixture Alert Rail With Real Alerts

### Why this is second

The alert rail is currently labeled as future logic.
That is one of the first things a reviewer or demo audience will notice.

### Current Files

- `apps/dashboard/src/components/alert-rail.tsx`
- `apps/dashboard/src/components/dashboard-screen.tsx`
- `apps/dashboard/src/lib/dashboard-fixtures.ts`

### Recommended Direction

Consume a real alert endpoint from the backend.
If backend work is delayed, derive alerts on the server in the dashboard layer as a temporary step, but do not keep fixtures.

### Implementation Phases

#### Phase A: Define the real alert model

Create a shared alert type in the frontend first:

```ts
export interface DashboardAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  href?: string;
}
```

#### Phase B: Update the component contract

Refactor `AlertRail` to take `alerts: DashboardAlert[]`.

#### Phase C: Remove fixture selection

Delete `selectDashboardFixtureVariant(data)` usage from `dashboard-screen.tsx`.

#### Phase D: Add real empty behavior

If there are no alerts:

- show a calm informational panel
- do not render fake warnings

### Detailed Instructions

1. Stop passing `variant` into `AlertRail`.
2. Replace the current fixture import with an `alerts` prop.
3. Render at most the top 5 alerts.
4. Keep severity ordering: `critical`, then `warning`, then `info`.
5. Keep alert links shallow and useful:
   - failed session -> `/session/:id`
   - failure burst -> `/?status=failed`
   - no active runners -> `/?status=running` or root view

### Temporary Fallback If Backend Endpoint Is Not Ready

You can derive alerts server-side in the dashboard layer like this:

```ts
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
      detail: "The fleet is online, but nothing is currently running.",
    });
  }

  return alerts.slice(0, 5);
}
```

### Definition Of Done

- The alert rail uses real data.
- Failed sessions surface as critical alerts.
- The dashboard never shows invented preview alerts.

---

## FE-3: Add A Real Time-Window Control

### Why this is third

The query model already supports `since`, but the UI only preserves it if it is already in the URL.
That means the dashboard is not yet meeting the planning doc's "time window" filter requirement.

### Current Files

- `apps/dashboard/src/lib/dashboard-query.ts`
- `apps/dashboard/src/components/filter-bar.tsx`
- `apps/dashboard/src/lib/control-node.ts`

### Implementation Phases

#### Phase A: Add preset definitions

Keep the URL contract simple.
Continue sending `since` as an ISO timestamp.

Recommended preset model:

```ts
export const dashboardTimePresets = [
  { value: "", label: "All time" },
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
] as const;
```

#### Phase B: Map presets to ISO timestamps

Add a small helper:

```ts
export const sinceIsoFromPreset = (preset: string) => {
  const now = Date.now();

  switch (preset) {
    case "15m":
      return new Date(now - 15 * 60 * 1000).toISOString();
    case "1h":
      return new Date(now - 60 * 60 * 1000).toISOString();
    case "6h":
      return new Date(now - 6 * 60 * 60 * 1000).toISOString();
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
};
```

#### Phase C: Add the control to `FilterBar`

Add a select for time window.

#### Phase D: Keep it shareable

Persist the resulting ISO `since` string in the URL so copied links still work.

### Detailed Instructions

1. Add a time-window select to `FilterBar`.
2. On change, compute the ISO timestamp and call `updateQuery({ since })`.
3. Show the selected preset clearly near the filter header.
4. Make sure `Clear` removes `since`.
5. Make sure the backend fetchers pass `since` to:
   - sessions
   - events
   - stats
   - analytics

### Code Sketch

```tsx
<div className="filter-field">
  <label htmlFor="dashboard-window">Time window</label>
  <select
    id="dashboard-window"
    onChange={(event) => {
      updateQuery({
        since: sinceIsoFromPreset(event.target.value),
      });
    }}
    value={presetFromSince(query.since)}
  >
    {dashboardTimePresets.map((preset) => (
      <option key={preset.value} value={preset.value}>
        {preset.label}
      </option>
    ))}
  </select>
</div>
```

### Definition Of Done

- The filter bar includes a visible time-window control.
- `since` updates the URL.
- Sessions, events, stats, and analytics all respond to it consistently.

---

## FE-4: Upgrade The Session Detail Page

### Why this is fourth

The session detail page is already usable.
Now it needs to become a page a presenter can stay on for 30 to 60 seconds while explaining a failure.

### Current Files

- `apps/dashboard/src/app/session/[id]/page.tsx`
- `apps/dashboard/src/components/session-hero.tsx`
- `apps/dashboard/src/components/session-summary-cards.tsx`
- `apps/dashboard/src/components/session-timeline.tsx`

### Additions To Make

- failure reason card
- raw event list
- event metric visualization
- clearer terminal-state treatment

### Implementation Phases

#### Phase A: Derive a failure summary

Create a server-side helper that finds the most relevant terminal event:

```ts
export function getSessionFailureSummary(session: SessionDetail) {
  const terminalEvent = [...session.events]
    .reverse()
    .find((event) => event.eventType === "agent.session.failed" || event.payload.status === "failed");

  if (!terminalEvent) {
    return null;
  }

  return {
    category: terminalEvent.payload.category ?? "unknown",
    summary: terminalEvent.payload.summary ?? session.summary ?? "Session failed without a detailed summary.",
  };
}
```

#### Phase B: Add a dedicated failure card

Do not make the user infer the failure reason from the timeline.
Show it prominently.

#### Phase C: Add a raw event list

The planning doc explicitly calls for a raw event feed for detail.
Keep it tucked below the summary and timeline.

#### Phase D: Add a compact metrics chart

Do not overbuild this.
A small event-count-by-type card or token-usage-by-event card is enough.

### Detailed Instructions

1. Add a `SessionFailureCard` component.
2. Add a `SessionEventList` component that renders every event in order.
3. Add a `SessionMetricsChart` or `SessionBreakdownCard`.
4. Keep the layout two-column on desktop and single-column on smaller screens.
5. Make failed sessions visibly louder than completed sessions.

### Code Sketch

```tsx
export function SessionEventList({ events }: { events: SessionDetail["events"] }) {
  return (
    <article className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Raw Events</p>
          <h2>Event feed</h2>
        </div>
      </div>

      <div className="stack-list">
        {events.map((event) => (
          <div className="list-card" key={event.id}>
            <div className="list-title-row">
              <strong>{event.eventType}</strong>
              <span className="row-meta">{event.createdAt}</span>
            </div>
            <p>{event.payload.summary ?? "No summary attached."}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
```

### Definition Of Done

- The session page has a visible failure explanation.
- The page includes both curated and raw views of the session.
- A failed path and completed path are both easy to narrate.

---

## FE-5: Add Loading, Error, Disconnect, And Rehearsal Polish

### Why this is split across the plan

This task should be split into two deliveries.
Do the minimum route resilience subset early so the rest of the work happens on a safer dashboard.
Save the stream/disconnect polish and rehearsal-specific refinement for the end.

### Current Files

- `apps/dashboard/src/app/page.tsx`
- `apps/dashboard/src/app/session/[id]/page.tsx`
- `apps/dashboard/src/components/dashboard-live-refresh.tsx`
- `apps/dashboard/src/app/globals.css`

### Missing Pieces

- route loading screens
- route error boundaries
- clearer stream disconnect treatment
- clearer session detail fetch failure behavior

### Implementation Phases

#### Phase A: Early pass, add route-level loading UI

Create:

- `apps/dashboard/src/app/loading.tsx`
- `apps/dashboard/src/app/session/[id]/loading.tsx`

Why this belongs early:

- these screens make backend integration work much easier to debug
- they stop the dashboard from collapsing into a blank transition state while data contracts are changing

#### Phase B: Early pass, add error boundaries

Create:

- `apps/dashboard/src/app/error.tsx`
- `apps/dashboard/src/app/session/[id]/error.tsx`

Why this belongs early:

- if the backend shape changes during active work, the UI should show a recoverable error instead of failing silently
- the team will see these states during development long before the audience does

#### Phase C: Late pass, improve disconnect state

Extend `DashboardLiveRefresh` so it can show:

- connected
- reconnecting
- disconnected for longer than N seconds

#### Phase D: Early pass, stop turning all session fetch failures into 404s

Right now the detail route catches any error and calls `notFound()`.
That hides backend failures and TLS issues as missing content.

Use `notFound()` only for real 404s.
Throw other errors so the route error boundary can render a proper banner.

#### Phase E: Late pass, apply rehearsal polish

After the real data work is finished, do a final sweep for:

- copy polish on empty and error states
- clearer disconnected messaging for live demos
- visual consistency between dashboard and session detail states
- any state handling issues discovered during a real booth smoke test

### Execution Split

Do these phases early:

- Phase A
- Phase B
- Phase D

Do these phases late:

- Phase C
- Phase E

### Code Sketch

```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Dashboard Error</p>
        <h1>Control node request failed</h1>
        <p>{error.message}</p>
        <button className="button-primary" onClick={reset} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}
```

### Definition Of Done

- The dashboard never collapses into a blank screen.
- A bad fetch is clearly distinguishable from a true 404.
- SSE reconnect state is obvious during rehearsal.
- The minimum resilience subset is already in place before the aggregate and alert integration work starts.

---

## Backend Tasks

## BE-1: Add Filter-Aware Stats And Analytics

### Why this is first

The frontend planning doc calls for a filterable dashboard with a time window.
The backend currently exposes analytics, but they are still global 24-hour aggregates.
That is the biggest remaining contract gap.

### Current Files

- `packages/shared/src/telemetry.ts`
- `apps/control-node/src/routes/v1.ts`
- `apps/control-node/src/routes/v1.test.ts`

### Implementation Phases

#### Phase A: Add shared query schemas

Define an analytics/stats query schema in `packages/shared/src/telemetry.ts`.

Recommended shape:

```ts
export const dashboardAggregateQuerySchema = z.object({
  since: optionalDateTimeQuerySchema,
  label: runnerLabelSchema.optional(),
  runnerId: optionalQueryStringSchema,
  agentType: z.enum(agentTypes).optional(),
  status: z.enum(sessionStatuses).optional(),
});

export type DashboardAggregateQuery = z.infer<typeof dashboardAggregateQuerySchema>;
```

#### Phase B: Reuse common `where` builders

Add helpers in `v1.ts`:

```ts
const buildSessionAggregateWhere = (query: DashboardAggregateQuery): Prisma.AgentSessionWhereInput => ({
  ...(query.since ? { startedAt: { gte: new Date(query.since) } } : {}),
  ...(query.status ? { status: query.status } : {}),
  ...(query.agentType ? { agentType: query.agentType } : {}),
  ...(query.runnerId ? { runnerId: query.runnerId } : {}),
  ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
});

const buildEventAggregateWhere = (query: DashboardAggregateQuery): Prisma.TelemetryEventWhereInput => ({
  ...(query.since ? { createdAt: { gte: new Date(query.since) } } : {}),
  ...(query.runnerId ? { runnerId: query.runnerId } : {}),
  ...(query.label ? { runner: { is: { labels: { has: query.label } } } } : {}),
});
```

#### Phase C: Apply the filters everywhere

Update:

- `GET /v1/stats`
- `GET /v1/analytics/agent-types`
- `GET /v1/analytics/failures`
- `GET /v1/analytics/runners/activity`
- `GET /v1/analytics/events/timeseries`

#### Phase D: Add tests

Cover:

- `since`
- `label`
- `runnerId`
- `agentType`
- `status` where relevant

### Detailed Instructions

1. Parse `request.query` in each aggregate endpoint using the shared schema.
2. Apply the same filter model across stats and analytics.
3. Update `backend-contract.md` to document the new query parameters.
4. Add integration tests proving filtered counts differ from global counts.

### Definition Of Done

- Stats and analytics are query-aware.
- Frontend filters no longer show obviously global counts next to filtered tables.
- Tests cover aggregate filtering.

---

## BE-2: Add A Real Alert Summary Endpoint

### Why this is second

The alert rail is currently fake because the backend does not expose a high-signal alert contract yet.
The control node already has enough data to compute useful alerts centrally.

### Current Files

- `packages/shared/src/telemetry.ts`
- `apps/control-node/src/routes/v1.ts`
- `apps/control-node/src/routes/v1.test.ts`

### Proposed Endpoint

- `GET /v1/alerts`

### Proposed Response Shape

```ts
export const dashboardAlertSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  detail: z.string(),
  href: z.string().optional(),
});

export const dashboardAlertsResponseSchema = z.object({
  items: z.array(dashboardAlertSchema).max(5),
});
```

### Initial Alert Rules

Implement only high-signal alerts:

1. latest failed session
2. failure burst in the last 10 minutes
3. one or more offline runners
4. no active runners while enrolled runners exist

### Implementation Phases

#### Phase A: Add shared schemas

Put the alert response schema in `packages/shared/src/telemetry.ts`.

#### Phase B: Add the route

Build alerts in the control node using current sessions, runners, and recent events.

#### Phase C: Add deterministic sorting

Sort by:

1. `critical`
2. `warning`
3. `info`
4. recency within the same severity

#### Phase D: Add tests

Write tests for:

- failed session alert
- offline runner alert
- no active runners alert

### Code Sketch

```ts
app.get("/v1/alerts", async (request: any) => {
  const query = dashboardAggregateQuerySchema.parse(request.query);
  const alerts: DashboardAlert[] = [];

  const failedSession = await prisma.agentSession.findFirst({
    where: {
      ...buildSessionAggregateWhere(query),
      status: "failed",
    },
    orderBy: { startedAt: "desc" },
    include: { runner: true },
  });

  if (failedSession) {
    alerts.push({
      id: `failed-${failedSession.id}`,
      severity: "critical",
      title: "Failed session surfaced",
      detail: failedSession.summary ?? `${failedSession.runner.name} failed.`,
      href: `/session/${failedSession.id}`,
    });
  }

  return dashboardAlertsResponseSchema.parse({
    items: alerts.slice(0, 5),
  });
});
```

### Definition Of Done

- The frontend can stop inventing alerts.
- Alert ordering is stable and easy to reason about.
- The endpoint returns only high-value operator alerts.

---

## BE-3: Expand The Demo Scenario Engine And Add A Rehearsal Harness

### Why this is third

The current runner demo is good enough to populate the UI.
It is not yet rich enough to stress the polished dashboard or support multiple rehearsal stories.

### Current Files

- `apps/runner/src/index.ts`
- `apps/runner/src/demo-labels.ts`
- `README.md`
- `backend-contract.md`

### Scenarios To Add

- `mixed-fleet`
- `recovery`
- `long-running`
- `noise-burst`

### Behavior To Add

- concurrent runners with mixed outcomes
- runner recovery after failure
- a session that stays running long enough to show live counters
- noisy event emission to animate charts

### Implementation Phases

#### Phase A: Extract scenario logic

Move scenario generation into a separate module, for example:

- `apps/runner/src/demo-scenarios.ts`

Recommended shape:

```ts
export type DemoScenarioName =
  | "happy-path"
  | "failure-burst"
  | "mixed-fleet"
  | "recovery"
  | "long-running"
  | "noise-burst";
```

#### Phase B: Implement the missing scenarios

Suggested rules:

- `mixed-fleet`: one runner succeeds, one fails, one stays running, one emits extra summaries
- `recovery`: runner fails once, then succeeds on the next cycle
- `long-running`: keep the session open for several event intervals before terminal state
- `noise-burst`: emit frequent `agent.summary.updated` or `agent.prompt.executed` events

#### Phase C: Add one rehearsal command

Recommended script in root `package.json`:

```json
{
  "scripts": {
    "demo:rehearsal": "pnpm --filter @agentharbor/runner demo --scenario mixed-fleet --agent-type mixed --runners 4 --cycles 4 --interval-ms 1200 --heartbeat-interval-ms 8000"
  }
}
```

If you prefer not to add a root script, add a shell script under `scripts/`.

#### Phase D: Update docs

Document exactly which commands a presenter should run for:

- healthy demo
- failure-heavy demo
- full rehearsal demo

### Code Sketch

```ts
const runDemoScenario = async ({
  context,
  scenario,
  cycles,
  intervalMs,
  runnerIndex,
}: {
  context: DemoRunnerContext;
  scenario: DemoScenarioName;
  cycles: number;
  intervalMs: number;
  runnerIndex: number;
}) => {
  switch (scenario) {
    case "mixed-fleet":
      return runMixedFleetScenario(...);
    case "recovery":
      return runRecoveryScenario(...);
    case "long-running":
      return runLongRunningScenario(...);
    case "noise-burst":
      return runNoiseBurstScenario(...);
    case "failure-burst":
      return runFailureBurstCycle(...);
    default:
      return runHappyPathCycle(...);
  }
};
```

### Definition Of Done

- One command can create a compelling rehearsal dataset.
- At least one scenario leaves an active session visible on the dashboard.
- At least one scenario shows failure followed by recovery.

---

## Suggested Ownership Split

If the team wants to parallelize safely:

- Frontend A:
  - `FE-1`
  - `FE-3`
  - backend coordination for aggregate query shape

- Frontend B:
  - `FE-2`
  - `FE-4`
  - `FE-5`

- Backend A:
  - `BE-3`

- Backend B:
  - `BE-1`
  - `BE-2`

- Backend C:
  - tests for `BE-1` and `BE-2`
  - contract/doc updates

---

## Short Version

If the team needs the shortest possible command:

1. Make stats and analytics query-aware.
2. Wire the analytics panel to real data.
3. Add a real alerts endpoint.
4. Replace alert fixtures with real alerts.
5. Add a real time-window filter.
6. Strengthen the session detail page.
7. Expand demo scenarios for mixed fleet and recovery.
8. Finish loading, error, and disconnect polish.
