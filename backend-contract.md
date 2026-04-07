# Backend Contract

## Purpose

This document locks the first backend/frontend integration contract for the AgentHarbor demo slice.

The goal is to give the frontend team stable backend behavior for:

- demo traffic generation
- filterable runner/session/event APIs
- stable failure categories
- predictable response shapes

## Demo Commands

Enroll a base runner config once:

```bash
cd apps/runner
node dist/index.js enroll \
  --url https://localhost:8443 \
  --name demo-base \
  --label demo \
  --environment demo \
  --allow-self-signed
```

Generate successful multi-runner demo traffic:

```bash
cd apps/runner
node dist/index.js demo \
  --scenario happy-path \
  --agent-type mixed \
  --runners 4 \
  --cycles 3 \
  --interval-ms 1200 \
  --heartbeat-interval-ms 8000
```

Generate failure-heavy demo traffic:

```bash
cd apps/runner
node dist/index.js demo \
  --scenario failure-burst \
  --agent-type mixed \
  --runners 4 \
  --cycles 2 \
  --interval-ms 1200 \
  --heartbeat-interval-ms 8000
```

Run a standalone heartbeat loop for one enrolled runner:

```bash
cd apps/runner
node dist/index.js heartbeat-loop --interval-ms 10000
```

## Stable Event Categories

Telemetry `payload.category` is constrained to:

- `session`
- `planning`
- `implementation`
- `build`
- `test`
- `network`
- `auth`
- `failure`
- `recovery`

The first demo slice will actively emit:

- `session`
- `planning`
- `implementation`
- `build`
- `test`
- `network`
- `auth`
- `failure`

## Supported Query Parameters

### `GET /v1/runners`

Supported query params:

- `limit`
- `runnerId`
- `status`
- `label`
- `search`

Response fields the frontend can rely on:

- `id`
- `name`
- `machineName`
- `hostname`
- `os`
- `architecture`
- `status`
- `labels`
- `environment`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `isOnline`
- `activeSessionCount`

### `GET /v1/runners/groups`

Supported query params:

- `limit`
- `label`
- `search`

Response fields the frontend can rely on:

- `label`
- `runnerCount`
- `onlineCount`
- `activeSessionCount`
- `runners`

### `POST /v1/runners/:id/revoke-tokens`

Revokes all active tokens for a runner. Future heartbeat and telemetry requests using those tokens return `401`.
Requires `Authorization: Bearer <CONTROL_NODE_ADMIN_TOKEN>`.

Response:

- `runnerId`
- `revokedCount`
- `revokedAt`

### `GET /v1/sessions`

Supported query params:

- `limit`
- `status`
- `agentType`
- `runnerId`
- `label`
- `since`
- `search`

Response fields the frontend can rely on:

- `id`
- `runnerId`
- `runnerName`
- `agentType`
- `sessionKey`
- `status`
- `startedAt`
- `endedAt`
- `summary`
- `tokenUsage`
- `durationMs`
- `filesTouchedCount`
- `eventCount`

### `GET /v1/events`

Supported query params:

- `limit`
- `eventType`
- `agentType`
- `runnerId`
- `sessionId`
- `label`
- `since`
- `search`

Response fields the frontend can rely on:

- `id`
- `runnerId`
- `runnerName`
- `sessionId`
- `sessionKey`
- `eventType`
- `payload`
- `createdAt`

### `GET /v1/stream/events`

Opens a Server-Sent Events stream for dashboard live refreshes.

Stream events the frontend can rely on:

- `runner.heartbeat`
- `telemetry.created`
- `session.updated`
- `stats.refresh`

Each SSE message uses the event name above and a JSON `data` payload with:

- `id`
- `type`
- `emittedAt`
- `data`

### Analytics Endpoints

All analytics endpoints are global 24-hour aggregates.

`GET /v1/analytics/agent-types`

Response:

- `items`: `{ key, label, count }[]`

`GET /v1/analytics/failures`

Response:

- `items`: `{ key, label, count }[]`

`GET /v1/analytics/runners/activity`

Response:

- `items`: `{ runnerId, runnerName, sessionCount }[]`

`GET /v1/analytics/events/timeseries`

Response:

- `points`: `{ bucketStart, count }[]`

## Example Filter Queries

Successful sessions:

```bash
curl -k "https://localhost:8443/v1/sessions?status=completed&agentType=codex&limit=10"
```

Failed sessions:

```bash
curl -k "https://localhost:8443/v1/sessions?status=failed&limit=10"
```

Failed events:

```bash
curl -k "https://localhost:8443/v1/events?eventType=agent.session.failed&limit=10"
```

Online demo runners:

```bash
curl -k "https://localhost:8443/v1/runners?status=online&label=demo"
```

Live dashboard stream:

```bash
curl -k -N "https://localhost:8443/v1/stream/events"
```

Agent type analytics:

```bash
curl -k "https://localhost:8443/v1/analytics/agent-types"
```

Five-minute event volume:

```bash
curl -k "https://localhost:8443/v1/analytics/events/timeseries"
```

## Frontend Assumptions

The frontend can assume:

- failed sessions will carry `status: "failed"`
- completed sessions will carry `status: "completed"`
- failure scenarios use structured categories instead of free-form strings
- demo runners will carry the `demo` label and `environment: "demo"`
- demo grouping labels will include stable values like `backend`, `student-team-a`, `student-team-b`, and the host platform label while still retaining the scenario and agent-type labels used by the existing demo filters
- runner label groups can be rendered directly from `GET /v1/runners/groups`
- multi-runner traffic can be generated from one command without manual event entry
- the dashboard can subscribe to `GET /v1/stream/events` once and refresh snapshots when stream events arrive
- analytics endpoints are global 24-hour aggregates until dashboard filter-aware analytics are explicitly added
