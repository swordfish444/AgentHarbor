<p align="center">
  <img src="./docs/images/agentharbor-logo.png" alt="AgentHarbor logo" width="220" />
</p>

# AgentHarbor

**Real-time visibility for distributed AI coding agents.**

AgentHarbor gives you a central control node, lightweight runners, and a live operator dashboard so you can see what Codex, Claude Code, Cursor, and local automation agents are doing across multiple machines.

> [!IMPORTANT]
> AgentHarbor is an observability platform today. It is not a task orchestrator yet.

![WSU AgentHarbor posterboard](./docs/images/wsu-agentharbor-posterboard-v2.png)

## Why it exists

When a team has multiple AI coding agents running across multiple laptops, the work quickly becomes hard to follow:

- Which agents are connected right now?
- Which ones are running, idle, or failing?
- What changed in the last few minutes?
- Where do you drill in when something looks wrong?

AgentHarbor gives you one place to answer those questions.

## 5-minute quick start

This is the fastest path from clone to a live wallboard.

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

### 1. Install dependencies and create local env

```bash
pnpm install
cp .env.example .env
```

### 2. Start Postgres and create the schema

```bash
docker compose up -d postgres
pnpm db:push
```

### 3. Start the control node

```bash
docker compose up -d control-node
```

The control node will be available at [https://localhost:8443](https://localhost:8443).

### 4. Start the dashboard

```bash
PORT=3003 AGENTHARBOR_ALLOW_SELF_SIGNED=true AGENTHARBOR_CONTROL_NODE_URL=https://localhost:8443 pnpm dev:dashboard
```

Open [http://localhost:3003/wallboard](http://localhost:3003/wallboard).

### 5. Get immediate value

You have two easy ways to see AgentHarbor in action:

#### Option A: Instant built-in demo

- Open `/wallboard`
- Flip the **Demo Mode** toggle in the top-right
- Click an agent row to drill into the agent detail page
- Click a session to inspect the evidence timeline

This requires no real runners and is the fastest way to understand the product.

#### Option B: Seed the live control node

```bash
pnpm demo:warm-start
```

This replays a curated demo baseline through the real enroll, heartbeat, and telemetry APIs and prints the dashboard URLs you can open immediately.

> [!TIP]
> If you just want to see the product work right now, start with **Option A**. If you want the control node populated with real demo-tagged records, run **Option B** right after.

## What you get

- **Control node**: HTTPS APIs for enrollment, auth, heartbeat, telemetry ingestion, analytics, alerts, and streaming updates.
- **Runner CLI**: lightweight client for developer machines with enrollment, heartbeats, demo traffic, and rehearsal flows.
- **Dashboard**: fleet wallboard, agent detail pages, session evidence views, alerts, analytics, and drill-down.
- **Shared contracts**: typed telemetry and API schemas in `packages/shared`.

## Common commands

### Start the main dev surfaces

```bash
pnpm dev:control
pnpm dev:dashboard
pnpm dev:runner
```

### Seed and rehearse demos

```bash
pnpm demo:warm-start
pnpm demo:burst
```

### Database and validation

```bash
pnpm db:push
pnpm typecheck
pnpm build
```

## Add a real runner

Once the control node is running, enroll a runner:

```bash
cd apps/runner
node dist/index.js enroll \
  --url https://localhost:8443 \
  --name my-laptop \
  --label demo \
  --environment demo \
  --allow-self-signed
```

Then either:

- send one heartbeat: `node dist/index.js heartbeat`
- keep a runner alive: `node dist/index.js heartbeat-loop --interval-ms 10000`
- simulate activity: `node dist/index.js demo --scenario mixed-fleet --agent-type mixed --runners 4 --cycles 3`

Credentials are stored locally at `~/.agentharbor/runner.json`.

## Repo map

- `apps/control-node` — Node.js + TypeScript API server with Prisma
- `apps/dashboard` — Next.js operator console
- `apps/runner` — CLI runner for developer machines
- `packages/sdk` — client transport abstraction
- `packages/shared` — telemetry schemas and API contracts

## Advanced docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design and data flow
- [docs/demo-runbook.md](./docs/demo-runbook.md) — presentation and demo sequence
- [docs/booth-network-runbook.md](./docs/booth-network-runbook.md) — multi-laptop shared-network setup
- [docs/backend.md](./docs/backend.md) — backend notes
- [docs/frontend.md](./docs/frontend.md) — dashboard/frontend notes
- [ROADMAP.md](./ROADMAP.md) — future direction
- [HANDOFF.md](./HANDOFF.md) — project handoff summary

## Security baseline

- HTTPS transport on the control node
- token-based runner auth
- hashed token storage
- minimal structured telemetry by default
- self-signed TLS support for local development

## Status

AgentHarbor is a working observability MVP for AI agents: live fleet visibility, drill-down, alerts, analytics, seeded demos, and runner telemetry are all in place. The next layer is production hardening and, later, coordination/orchestration.
