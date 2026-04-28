<p align="center">
  <img src="./docs/images/agentharbor-logo.png" alt="AgentHarbor logo" width="180" />
</p>

# AgentHarbor

**AgentHarbor is an open source observability plane for engineering teams running many AI coding agents across many people and machines.**

When every engineer has Codex, Claude Code, Cursor, or local automation agents running on different laptops and workstations, the team loses the shared picture: which agents are connected, what work is active, where failures are happening, and which session needs attention. AgentHarbor gives the team one live control-tower view without trying to orchestrate or control the agents.

AgentHarbor began as a Washington State University senior design project and is now open sourced for teams learning how to operate fleets of AI agents safely.

![AgentHarbor live fleet dashboard](./docs/images/agentharbor-live-fleet-dashboard.png)

## Agentic Setup

Give this one command to the coding agent setting up your team's shared control node:

```bash
git clone https://github.com/swordfish444/AgentHarbor.git && cd AgentHarbor && pnpm install && pnpm setup:agent
```

That command creates local env, builds the shared packages, starts Postgres, applies the Prisma schema, starts the control node, and launches the team wallboard at [http://localhost:3003/wallboard](http://localhost:3003/wallboard).

Turn on **Demo Mode** in the top-right of the wallboard to see the presentation loop immediately.

## Human Setup

Prerequisites:

- Node.js 22+
- pnpm 10+
- Docker Desktop or Docker Engine with Compose

Run a local control node and dashboard:

```bash
pnpm install
pnpm setup:agent
```

If you prefer to start each service yourself:

```bash
cp .env.example .env
pnpm build:packages
docker compose up -d postgres
pnpm db:push
docker compose up -d control-node
PORT=3003 AGENTHARBOR_ALLOW_SELF_SIGNED=true AGENTHARBOR_CONTROL_NODE_URL=https://localhost:8443 pnpm dev:dashboard
```

Then open [http://localhost:3003/wallboard](http://localhost:3003/wallboard).

## How It Connects

Think of AgentHarbor as the shared visibility layer for a team:

- **Control node** runs once for the team and receives telemetry over HTTPS.
- **Runner** runs on each engineer or automation machine and sends heartbeat plus structured activity events.
- **Dashboard** opens in the browser and gives the team a shared fleet view, agent drill-downs, alerts, and session timelines.

```text
Engineer laptop A      runner  ->  https://TEAM_CONTROL_NODE:8443
Engineer workstation B runner  ->  https://TEAM_CONTROL_NODE:8443
Remote automation box  runner  ->  https://TEAM_CONTROL_NODE:8443

Team dashboard browser ->  https://TEAM_CONTROL_NODE:8443  ->  Postgres
```

For runners on the same machine as the control node, use `https://localhost:8443`.

For runners on other engineers' machines, do not use `localhost`. Use the LAN IP or DNS name of the machine running the team's control node:

```bash
CONTROL_NODE_URL=https://192.168.1.50:8443
```

Make sure port `8443` is reachable from every runner machine. For local development, the control node uses a self-signed certificate, so runners should enroll with `--allow-self-signed`.

## Add A Real Runner

Build the runner CLI:

```bash
pnpm --filter @agentharbor/runner build
```

Enroll an engineer or automation machine:

```bash
cd apps/runner
node dist/index.js enroll \
  --url https://192.168.1.50:8443 \
  --name "Casey's MacBook Pro" \
  --label demo \
  --environment demo \
  --allow-self-signed
```

Send live signals:

```bash
node dist/index.js heartbeat-loop --interval-ms 10000
```

Simulate agent activity from that runner:

```bash
node dist/index.js demo --scenario mixed-fleet --agent-type mixed --runners 4 --cycles 3
```

Runner credentials are stored locally at `~/.agentharbor/runner.json`.

## What You Get

- A shared team wallboard with connected, running, and idle agent counts.
- A paginated connected-agent table showing which engineer or machine owns each active runner.
- A Discord-style activity stream for recent agent work across the whole team.
- Agent detail pages with recent tasks, failures, telemetry, token usage, and security alerts.
- Session detail pages with evidence timelines for demo and real telemetry.
- HTTPS JSON APIs for enrollment, heartbeat, telemetry ingestion, analytics, alerts, and streaming updates.
- Shared TypeScript contracts for telemetry and API payloads.

## Useful Commands

```bash
pnpm dev:control
pnpm dev:dashboard
pnpm dev:runner
pnpm demo:warm-start
pnpm demo:burst
pnpm typecheck
pnpm build
```

## Repo Map

- `apps/control-node`: Node.js, Fastify, Prisma, Postgres, HTTPS APIs
- `apps/dashboard`: Next.js operator console and demo wallboard
- `apps/runner`: CLI runner for developer and agent machines
- `packages/sdk`: client methods agents can call
- `packages/shared`: telemetry schemas, demo fixtures, and API contracts
- `packages/config`: shared TypeScript config

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md): system design and data flow
- [docs/demo-runbook.md](./docs/demo-runbook.md): senior-design demo sequence
- [docs/booth-network-runbook.md](./docs/booth-network-runbook.md): multi-laptop shared-network setup
- [docs/backend.md](./docs/backend.md): backend notes
- [docs/frontend.md](./docs/frontend.md): dashboard/frontend notes
- [ROADMAP.md](./ROADMAP.md): future direction
- [HANDOFF.md](./HANDOFF.md): project handoff summary

## Security Baseline

- HTTPS transport on the control node
- Token-based runner authentication
- Hashed runner token storage
- Minimal structured telemetry by default
- Self-signed TLS support for local development

## Project Status

AgentHarbor is an observability-first MVP for teams operating multiple AI coding agents at once. The foundation is ready for teams to connect runners, stream telemetry, use the live wallboard, drill into agent/session detail pages, and rehearse the demo loop. The next production layer is hardening, hosted deployment, richer runner installers, and eventually coordination features.

## Washington State University Credits

AgentHarbor was created as a Washington State University senior design project and is being opened up for broader open source development.

![WSU AgentHarbor posterboard](./docs/images/wsu-agentharbor-posterboard-v2.png)

- Mentors: Skylar Graika and Casey Graika
- Faculty and acknowledgements: Dr. Parteek Kumar
- Team: CommandVoice
- Student team: Eli Lawrence, Clayton Simoneaux, Adrian Casabal-Raphael, Caiden Sanders, and Jinming Wang
