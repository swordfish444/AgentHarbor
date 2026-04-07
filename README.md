# AgentHarbor

AgentHarbor is an open source observability platform for distributed AI coding agents. It gives teams a central control node, lightweight runner clients, and an operator dashboard so they can see what Codex, Claude Code, Cursor, and local automation agents are doing across multiple machines.

The current MVP is deliberately focused on telemetry and visibility. It is not a task orchestrator yet.

## What is implemented

- Control node with HTTPS JSON APIs for runner enrollment, token auth, heartbeat, telemetry ingestion, health, and list endpoints.
- Postgres + Prisma data model for runners, machines, runner tokens, agent sessions, and telemetry events.
- Runner CLI with `enroll`, `heartbeat`, `send-event`, `demo`, and `show-config`.
- Small SDK that abstracts control-plane transport so the HTTP implementation can later be swapped for gRPC streaming.
- Next.js dashboard with a control-tower UI for runners, sessions, events, stats, and session detail.
- Docker Compose for local Postgres plus the control node container.

## Monorepo layout

```text
apps/
  control-node/   HTTPS API server + Prisma
  dashboard/      Next.js operator console
  runner/         CLI runner for developer machines
packages/
  config/         shared env/config helpers
  sdk/            transport abstraction + client
  shared/         telemetry schema + API contracts
scripts/
  add-shebang.mjs
```

## Architecture overview

- `apps/control-node`: receives runner heartbeats and telemetry, persists structured events, and exposes read APIs for the dashboard.
- `apps/runner`: runs on developer machines, enrolls once, stores a token locally, then sends heartbeats and telemetry over HTTPS.
- `packages/sdk`: client abstraction for runners or future agent integrations.
- `packages/shared`: normalized event model and request/response validation contracts.
- `apps/dashboard`: reads control-node APIs and renders an operator console view of fleet activity.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram and data flow.

## Local setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

### Install

```bash
pnpm install
cp .env.example .env
```

### Start Postgres

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://agentharbor:agentharbor@localhost:5432/agentharbor pnpm db:push
```

### Run the control node

```bash
DATABASE_URL=postgresql://agentharbor:agentharbor@localhost:5432/agentharbor \
CONTROL_NODE_PORT=8443 \
CONTROL_NODE_TLS_ENABLED=true \
CONTROL_NODE_TLS_ALLOW_SELF_SIGNED=true \
CONTROL_NODE_ADMIN_TOKEN=dev-control-admin-token \
pnpm dev:control
```

The control node serves HTTPS locally on `https://localhost:8443`.

### Run the dashboard

```bash
AGENTHARBOR_CONTROL_NODE_URL=https://localhost:8443 \
AGENTHARBOR_ALLOW_SELF_SIGNED=true \
pnpm dev:dashboard
```

Open `http://localhost:3000`.

### Run the runner CLI

```bash
pnpm dev:runner
```

Or use the built CLI entrypoint after `pnpm build`:

```bash
cd apps/runner
node dist/index.js --help
```

## Runner enrollment

Enroll a machine against the control node:

```bash
cd apps/runner
node dist/index.js enroll \
  --url https://localhost:8443 \
  --name my-laptop \
  --label demo \
  --environment demo \
  --allow-self-signed
```

This stores credentials at `~/.agentharbor/runner.json`.

Send a manual heartbeat:

```bash
cd apps/runner
node dist/index.js heartbeat
```

Run an automatic heartbeat loop:

```bash
cd apps/runner
node dist/index.js heartbeat-loop --interval-ms 10000
```

## Demo flow

Simulate successful multi-runner activity and populate the dashboard:

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

Simulate a failure-heavy burst:

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

This emits:

- `runner.heartbeat`
- `agent.session.started`
- `agent.prompt.executed`
- `agent.summary.updated`
- `agent.session.completed`
- `agent.session.failed`

See [backend-contract.md](./backend-contract.md) for the current backend/frontend handoff contract, supported filters, and example queries.

## API surface

- `GET /health`
- `POST /v1/enroll`
- `POST /v1/heartbeat`
- `POST /v1/telemetry`
- `GET /v1/runners`
- `GET /v1/sessions`
- `GET /v1/sessions/:id`
- `GET /v1/events`
- `GET /v1/stats`

## Development scripts

- `pnpm build`
- `pnpm typecheck`
- `pnpm dev:control`
- `pnpm dev:dashboard`
- `pnpm dev:runner`
- `pnpm db:generate`
- `pnpm db:push`
- `pnpm test:control`

## Security baseline

- HTTPS transport on the control node.
- Token-based runner auth with SHA-256 hashed token storage.
- Admin bearer token support for destructive control-plane routes such as runner token revocation.
- Minimal structured telemetry by default. Raw prompt text is not captured.
- Self-signed TLS support for local development; bring your own certificate/key for shared environments.

## Status

This repository is a working MVP. The next layers are transport hardening, runner identity, richer analytics, and the eventual coordination/orchestration plane described in [ROADMAP.md](./ROADMAP.md).
