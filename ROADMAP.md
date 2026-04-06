# AgentHarbor Roadmap

## Near term

- Add streaming ingestion with gRPC while preserving the SDK transport abstraction.
- Introduce token rotation and revocation endpoints.
- Expose richer aggregate analytics and live data surfaces in the dashboard.
- Add API pagination and cursor-based event feeds.
- Add first-class `mixed-fleet` and `recovery` demo scenarios for rehearsal.

## Security and identity

- mTLS runner identity for stronger machine-bound trust.
- Certificate enrollment flow for runner bootstrap.
- Audit logging for auth and token lifecycle events.
- Rate limiting and signed event batches.

## Platform evolution

- Webhooks and outbound integrations.
- Session diffing and file-level activity summaries.
- Retention policies and cold storage.

## Long term

- Agent coordination primitives.
- Task orchestration and delegation.
- Policy-driven controls and approvals.
- Multi-tenant fleet management with RBAC.
