# AgentHarbor Booth Network Runbook

This runbook validates the shared-demo topology before booth rehearsal:

1. one host laptop runs Postgres and the control node
2. multiple runner laptops enroll against that host over LAN
3. one dashboard instance reads from the same control node

## Host Laptop

Start the shared backend on a LAN-reachable interface:

```bash
cd /Users/caseygraika/Documents/Github/Patrol6/AgentHarbor-codex-implementation-priorities
CONTROL_NODE_HOST=0.0.0.0 \
CONTROL_NODE_PORT=8443 \
pnpm dev:control
```

Find the host LAN IP and verify another machine can reach it:

```bash
curl -k https://<host-lan-ip>:8443/health
```

Expected result:

- `{"ok":true,...}`

## Runner Laptops

Enroll each runner against the shared host instead of `localhost`:

```bash
cd /Users/caseygraika/Documents/Github/Patrol6/AgentHarbor-codex-implementation-priorities/apps/runner
node dist/index.js enroll \
  --url https://<host-lan-ip>:8443 \
  --name booth-laptop-1 \
  --label demo \
  --environment booth \
  --allow-self-signed
```

Keep telemetry flowing from every runner laptop:

```bash
node dist/index.js heartbeat-loop --interval-ms 10000
node dist/index.js demo \
  --scenario mixed-fleet \
  --agent-type mixed \
  --runners 2 \
  --cycles 3
```

## Dashboard Laptop

Point the dashboard at the shared control node:

```bash
cd /Users/caseygraika/Documents/Github/Patrol6/AgentHarbor-codex-implementation-priorities
AGENTHARBOR_CONTROL_NODE_URL=https://<host-lan-ip>:8443 \
AGENTHARBOR_ALLOW_SELF_SIGNED=true \
PORT=3003 \
pnpm dev:dashboard
```

The dashboard dev server in this branch binds to `0.0.0.0`, so it can also be opened from another machine on the same network if needed.

## Success Criteria

- multiple laptops appear in the fleet table
- sessions from different laptops appear in the same dashboard view
- live telemetry and alerts update from the shared control node
- self-signed TLS and firewall issues are resolved before booth rehearsal
