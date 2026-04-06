# AgentHarbor Handoff

## What is implemented

- Public-ready monorepo skeleton with pnpm workspaces.
- Working control node with HTTPS JSON APIs, Prisma schema, token issuance, telemetry ingestion, and read endpoints.
- Working runner CLI and SDK.
- Working dashboard with fleet summary and session detail views.
- Local development path using Docker Compose for Postgres and the control node.
- Baseline docs for setup, architecture, and roadmap.
- Runner labels, environment tags, and filterable read APIs for runners, sessions, and events.
- Automatic runner heartbeat loop with retry/backoff and graceful shutdown.
- Integration tests covering enrollment, heartbeat, telemetry ingestion, and key filter behavior.
- Initial Phase 4 backend support: SSE stream endpoint, aggregate analytics endpoint, and dashboard wiring for live telemetry plus live-refreshing charts.

## What is incomplete

- No pagination or cursor-based feeds on list endpoints yet.
- No token rotation UX or revocation endpoint.
- No production auth hardening beyond bearer token hashing and TLS.
- No advanced analytics beyond the initial Phase 4 aggregate panels yet.
- No gRPC streaming, mTLS, orchestration, or multi-tenant concerns yet.
- Demo scenario coverage is still narrower than the backend phase plan; `mixed-fleet` and `recovery` are not first-class scenario names yet.

## Suggested next milestones

### Milestone 1: Reliability

- Expand integration coverage for the remaining filter paths, stats, and future streaming routes.
- Add seeded demo reset/setup commands and a dashboard loading state.
- Finish the remaining Phase 2 demo scenarios and rehearsal commands.

### Milestone 2: Security

- Add token rotation and revocation.
- Add configurable TLS cert management and documented production deployment settings.
- Add signed batch ingestion or mTLS bootstrap exploration.

### Milestone 3: Operator experience

- Add pagination and deeper live refresh behavior across more dashboard surfaces.
- Add richer session analytics such as files touched, failure categories, and latency.
- Add downloadable JSON exports for sessions and event history.

## Current recommended focus

- Finish the missing Phase 2 scenario names only if the demo story needs them explicitly.
- Treat Phases 3 and 4 as functionally in place and focus new backend work on Phase 5 verification, richer analytics, and rehearsal tooling.
- Keep docs aligned with the actual backend contract so the frontend team is not working from stale assumptions.

### Milestone 4: Platform direction

- Introduce a gRPC transport implementation in the SDK.
- Define runner capability metadata.
- Design the coordination/orchestration model without breaking the observability-first API surface.

## Suggested senior design review questions

- Should `sessionKey` remain runner-scoped or become globally unique across organizations?
- What is the long-term transport contract for streaming telemetry and backpressure?
- How should machine identity evolve from bearer tokens to stronger hardware or certificate-backed trust?
- Which telemetry fields are safe by default, and which require opt-in because they can drift toward sensitive prompt/content capture?
