#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install pnpm, then rerun: pnpm install && pnpm setup:agent" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the local Postgres and control-node stack." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  echo "Created .env from .env.example"
fi

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env"
  set +a
fi

DASHBOARD_PORT="${PORT:-3003}"
CONTROL_NODE_URL="${AGENTHARBOR_CONTROL_NODE_URL:-https://localhost:8443}"

echo "Building shared workspace packages..."
pnpm --filter './packages/**' build

echo "Starting Postgres..."
docker compose up -d postgres

echo "Applying the Prisma schema..."
pnpm db:push

echo "Starting the AgentHarbor control node..."
docker compose up -d control-node

echo "Waiting for the control node at ${CONTROL_NODE_URL}/health..."
for attempt in $(seq 1 30); do
  if curl -k -fsS "${CONTROL_NODE_URL}/health" >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "Control node did not become healthy. Check Docker logs with: docker compose logs control-node" >&2
    exit 1
  fi

  sleep 1
done

echo "AgentHarbor is ready."
echo "Open http://localhost:${DASHBOARD_PORT}/wallboard and enable Demo Mode for the presentation loop."

PORT="${DASHBOARD_PORT}" \
AGENTHARBOR_CONTROL_NODE_URL="${CONTROL_NODE_URL}" \
AGENTHARBOR_ALLOW_SELF_SIGNED="${AGENTHARBOR_ALLOW_SELF_SIGNED:-true}" \
bash scripts/with-root-env.sh pnpm --filter @agentharbor/dashboard dev
