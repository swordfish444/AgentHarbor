# Backend Contract

## Purpose

This document locks the first backend/frontend integration contract for the AgentHarbor demo slice.

The goal is to give the frontend team stable backend behavior for:

- demo traffic generation
- filterable runner/session/event APIs
- stable failure categories
- predictable response shapes
- live event streaming
- aggregate analytics panels

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

### `GET /v1/sessions`

Supported query params:

- `limit`
- `status`
- `agentType`
- `runnerId`
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

### `GET /v1/analytics`

Response shape:

- `sections[]`

Each section includes:

- `id`
- `title`
- `description`
- `points[]`

Current section ids:

- `agent-type-distribution`
- `event-volume`
- `runner-activity`
- `failure-categories`

### `GET /v1/stream`

Server-sent event stream.

The frontend should listen for these event names:

- `runner.heartbeat.recorded`
- `telemetry.event.created`
- `session.updated`
- `stats.hint`

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

Recent sessions since a checkpoint:

```bash
curl -k "https://localhost:8443/v1/sessions?since=2026-04-02T20:00:00.000Z&limit=10"
```

Events for one session:

```bash
curl -k "https://localhost:8443/v1/events?sessionId=<session-id>&limit=20"
```

## Phase 3 Validation

Use these checks to confirm the filterable read APIs are behaving as expected:

```bash
curl -k "https://localhost:8443/v1/runners?label=demo&status=online&search=verify"
curl -k "https://localhost:8443/v1/sessions?status=failed&agentType=codex&runnerId=<runner-id>&since=2026-04-02T20:00:00.000Z&limit=5"
curl -k "https://localhost:8443/v1/events?eventType=agent.session.failed&agentType=codex&sessionId=<session-id>&since=2026-04-02T20:00:00.000Z&limit=10"
```

## Phase 4 Validation

Analytics response:

```bash
curl -k "https://localhost:8443/v1/analytics"
```

Stream subscription:

```bash
curl -k -N "https://localhost:8443/v1/stream"
```

Sample stream envelopes:

```json
{
  "id": "stream-event-id",
  "type": "telemetry.event.created",
  "occurredAt": "2026-04-06T03:19:00.457Z",
  "payload": {
    "id": "event-id",
    "runnerId": "runner-id",
    "runnerName": "verify-base-codex-1",
    "sessionId": "session-id",
    "sessionKey": "verify-base-codex-1-failure-burst-1-ffe825b4",
    "eventType": "agent.session.failed",
    "payload": {
      "timestamp": "2026-04-06T03:19:00.457Z",
      "agentType": "codex",
      "summary": "Session failed after repeated build issues.",
      "category": "failure",
      "status": "failed"
    },
    "createdAt": "2026-04-06T03:19:00.457Z"
  }
}
```

```json
{
  "id": "stream-hint-id",
  "type": "stats.hint",
  "occurredAt": "2026-04-06T03:19:00.460Z",
  "payload": {
    "reason": "telemetry",
    "timestamp": "2026-04-06T03:19:00.460Z",
    "runnerId": "runner-id",
    "sessionId": "session-id",
    "eventType": "agent.session.failed"
  }
}
```

## Frontend Assumptions

The frontend can assume:

- failed sessions will carry `status: "failed"`
- completed sessions will carry `status: "completed"`
- failure scenarios use structured categories instead of free-form strings
- demo runners will carry the `demo` label and `environment: "demo"`
- multi-runner traffic can be generated from one command without manual event entry
