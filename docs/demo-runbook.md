# Demo Runbook

## Startup order

1. Start Postgres:

   ```bash
   docker compose up -d postgres
   ```

2. Load env and apply the schema:

   ```bash
   set -a && source .env && set +a
   pnpm db:push
   ```

3. Start the control node:

   ```bash
   set -a && source .env && set +a
   export CONTROL_NODE_ADMIN_TOKEN=dev-control-admin-token
   pnpm dev:control
   ```

4. Start the dashboard:

   ```bash
   set -a && source .env && export PORT=3003 && set +a
   pnpm dev:dashboard
   ```

5. Warm-start the seeded baseline in a new shell:

   ```bash
   pnpm demo:warm-start
   ```

6. Optional live overlay during the presentation:

   ```bash
   pnpm demo:burst
   ```

## Presenter flow

1. Open the live dashboard URL printed by `pnpm demo:warm-start`.
2. Call out the alert rail: one failed session, one heartbeat gap, one active session.
3. Open the failed session from the alert rail and walk the timeline and raw events.
4. Return to the main dashboard and open the presentation wallboard URL.
5. Trigger `pnpm demo:burst` and let the live feed update.
6. Return to the live dashboard and drill back into the newest failed or completed burst session.

## Recovery steps

- Reset and rebuild the baseline:

  ```bash
  pnpm demo:warm-start
  ```

- Clear only demo-tagged rows without reseeding:

  ```bash
  pnpm demo:reset
  ```

- Reseed without clearing first:

  ```bash
  pnpm demo:seed
  ```
