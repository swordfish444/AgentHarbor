# AgentHarbor Handoff

## What is implemented

- Public-ready monorepo skeleton with pnpm workspaces.
- Working control node with HTTPS JSON APIs, Prisma schema, token issuance, telemetry ingestion, and read endpoints.
- Working runner CLI and SDK.
- Working dashboard with fleet summary and session detail views.
- Local development path using Docker Compose for Postgres and the control node.
- Baseline docs for setup, architecture, and roadmap.

## What is incomplete

- No background heartbeat scheduler inside the runner yet; heartbeats are CLI-driven.
- No pagination, search, or retention controls on list endpoints.
- No token rotation UX or revocation endpoint.
- No production auth hardening beyond bearer token hashing and TLS.
- No automated test suite yet.
- No gRPC streaming, mTLS, orchestration, or multi-tenant concerns yet.

## Suggested next milestones

### Milestone 1: Reliability

- Add integration tests for enrollment, heartbeat, and telemetry ingestion.
- Add seeded demo data and a dashboard loading state.
- Add automatic runner heartbeat scheduling and graceful retry logic.

### Milestone 2: Security

- Add token rotation and revocation.
- Add configurable TLS cert management and documented production deployment settings.
- Add signed batch ingestion or mTLS bootstrap exploration.

### Milestone 3: Operator experience

- Add filtering, pagination, and live refresh/event streaming in the dashboard.
- Add richer session analytics such as files touched, failure categories, and latency.
- Add downloadable JSON exports for sessions and event history.

### Milestone 4: Platform direction

- Introduce a gRPC transport implementation in the SDK.
- Define runner capability metadata.
- Design the coordination/orchestration model without breaking the observability-first API surface.

## Suggested senior design review questions

- Should `sessionKey` remain runner-scoped or become globally unique across organizations?
- What is the long-term transport contract for streaming telemetry and backpressure?
- How should machine identity evolve from bearer tokens to stronger hardware or certificate-backed trust?
- Which telemetry fields are safe by default, and which require opt-in because they can drift toward sensitive prompt/content capture?
