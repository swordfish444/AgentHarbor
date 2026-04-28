#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env"
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://agentharbor:agentharbor@localhost:5432/agentharbor}"
export CONTROL_NODE_HOST="${CONTROL_NODE_HOST:-0.0.0.0}"
export CONTROL_NODE_PORT="${CONTROL_NODE_PORT:-8443}"
export CONTROL_NODE_TLS_ENABLED="${CONTROL_NODE_TLS_ENABLED:-true}"
export CONTROL_NODE_TLS_ALLOW_SELF_SIGNED="${CONTROL_NODE_TLS_ALLOW_SELF_SIGNED:-true}"
export AGENTHARBOR_CONTROL_NODE_URL="${AGENTHARBOR_CONTROL_NODE_URL:-https://localhost:8443}"
export AGENTHARBOR_ALLOW_SELF_SIGNED="${AGENTHARBOR_ALLOW_SELF_SIGNED:-true}"

exec "$@"
