# AgentHarbor

AgentHarbor is an open source observability platform for distributed AI coding agents. It gives teams a central control node, lightweight runner clients, and an operator dashboard so they can see what Codex, Claude Code, Cursor, and local automation agents are doing across multiple machines.

The current product is intentionally focused on telemetry, fleet visibility, failure drilldown, and demo-ready operations. At this moment, it is not a task orchestrator.

## What is implemented now

- Control node with HTTPS APIs for runner enrollment, token auth, heartbeat, telemetry ingestion, fleet reads, session detail, analytics, alerts, runner-group rollups, token revocation, and server-sent events.
- Postgres + Prisma data model for runners, machines, runner tokens, agent sessions, and telemetry events.
- Dashboard with live stats, real alert rail, filter-aware analytics, runner grouping, session list, event feed, time-window filters, session failure drilldown, and route loading/error states.
- Runner CLI with `enroll`, `heartbeat`, `heartbeat-loop`, `send-event`, `demo`, `rehearsal`, and `show-config`.
- Shared schema contracts in `packages/shared` so the control node, dashboard, and runner speak the same validated request/response model.
- Local Docker Compose Postgres setup plus a booth-network runbook for multi-laptop demos.

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
docs/
  frontend.md
  backend.md
  booth-network-runbook.md
```

## Architecture overview

- `apps/control-node`: receives runner heartbeats and telemetry, persists structured events, computes fleet stats/alerts/analytics, and exposes read APIs for the dashboard.
- `apps/runner`: runs on developer machines, enrolls once, stores a token locally, then sends heartbeats and telemetry over HTTPS.
- `apps/dashboard`: reads control-node APIs and renders an operator console for fleet state, alerts, telemetry, analytics, and session drilldowns.
- `packages/sdk`: client abstraction for runners or future integrations.
- `packages/shared`: normalized event model and request/response validation contracts.

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

### Start Postgres and apply the Prisma schema

```bash
docker compose up -d postgres
set -a && source .env && set +a
pnpm db:push
```

### Run the control node

```bash
set -a && source .env && set +a
export CONTROL_NODE_ADMIN_TOKEN=dev-control-admin-token
pnpm dev:control
```

The control node serves HTTPS locally on [https://localhost:8443](https://localhost:8443) and binds to `0.0.0.0` by default for LAN testing.

### Run the dashboard

```bash
set -a && source .env && export PORT=3003 && set +a
pnpm dev:dashboard
```

Open [http://localhost:3003](http://localhost:3003).

The dashboard dev server binds to `0.0.0.0`, which makes shared-network smoke testing easier when you want to open the UI from another machine.

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

## Demo flows

Warm-start the presentation baseline with seeded control-node data:

```bash
pnpm demo:warm-start
```

This resets only demo-tagged rows, replays a curated 6-runner / 10-session baseline through the real enroll, heartbeat, and telemetry APIs, and prints:

- the live dashboard URL
- the main dashboard `?demo=1` fallback URL
- the curated wallboard URL

Layer a short live burst on top of the seeded baseline:

```bash
pnpm demo:burst
```

Open the main dashboard fallback directly if the control node is unavailable:

```text
http://localhost:3003/?demo=1
```

For the presenter sequence and startup order, see [demo-runbook.md](./docs/demo-runbook.md).

Simulate a successful multi-runner fleet:

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

Simulate a more realistic mixed demo fleet:

```bash
cd apps/runner
node dist/index.js demo \
  --scenario mixed-fleet \
  --agent-type mixed \
  --runners 4 \
  --cycles 3 \
  --interval-ms 1200 \
  --heartbeat-interval-ms 8000
```

Run the full rehearsal sequence:

```bash
cd apps/runner
node dist/index.js rehearsal
```

Supported demo scenarios:

- `happy-path`
- `failure-burst`
- `mixed-fleet`
- `recovery-loop`
- `long-running`

Telemetry emitted by the runner demo flows:

- `runner.heartbeat`
- `agent.session.started`
- `agent.prompt.executed`
- `agent.summary.updated`
- `agent.session.completed`
- `agent.session.failed`

## Dashboard capabilities

The dashboard now supports:

- live fleet stats
- real alert rail sourced from the control node
- filter-aware analytics charts
- URL-driven filters for status, agent type, runner, label, search, and time window
- session detail pages with summary, failure context, event breakdown, timeline, and raw event inspection
- live event feed refresh over server-sent events
- route loading and error states for demo resilience

## API surface

Core routes:

- `GET /health`
- `POST /v1/enroll`
- `POST /v1/heartbeat`
- `POST /v1/telemetry`
- `GET /v1/runners`
- `GET /v1/runners/groups`
- `POST /v1/runners/:id/revoke-tokens`
- `GET /v1/stream/events`
- `GET /v1/sessions`
- `GET /v1/sessions/:id`
- `GET /v1/events`
- `GET /v1/stats`

Analytics and alerting:

- `GET /v1/analytics/agent-types`
- `GET /v1/analytics/failures`
- `GET /v1/analytics/runners/activity`
- `GET /v1/analytics/events/timeseries`
- `GET /v1/alerts`

The analytics and alert endpoints accept the same aggregate dashboard filters used by the UI:

- `status`
- `agentType`
- `runnerId`
- `label`
- `since`
- `search`

## Shared-network booth testing

AgentHarbor is designed to support a shared control node with multiple runner laptops on the same Wi-Fi network. The key requirement is that every runner and the dashboard point at the same control-node URL, not `localhost` on each machine.

For the full booth smoke-test workflow, see [booth-network-runbook.md](./docs/booth-network-runbook.md).

## Development scripts

- `pnpm build`
- `pnpm typecheck`
- `pnpm dev:control`
- `pnpm dev:dashboard`
- `pnpm dev:runner`
- `pnpm db:generate`
- `pnpm db:push`
- `pnpm demo:reset`
- `pnpm demo:seed`
- `pnpm demo:burst`
- `pnpm demo:warm-start`
- `pnpm test:control`

## Security baseline

- HTTPS transport on the control node.
- Token-based runner auth with SHA-256 hashed token storage.
- Admin bearer token support for destructive control-plane routes such as runner token revocation.
- Minimal structured telemetry by default. Raw prompt text is not captured.
- Self-signed TLS support for local development; bring your own certificate/key for shared environments.

## Status

This repository is a working observability MVP with real-time fleet visibility, live alerts, analytics, and demo tooling. The next layers are transport hardening, stronger runner identity, and the eventual coordination/orchestration plane described in [ROADMAP.md](./ROADMAP.md).
