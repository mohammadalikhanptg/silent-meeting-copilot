# SMC Commercial Phase 3 — Usage metering + entitlements

Status: in progress. Slice 1 (metering foundation) built and verified. Slices 2 and 3 pending.
Author note: this is a build spec plus running state for Phase 3. It is grounded in the repository as of Phase 2 merge, not chat memory.

## Goal

Measure how much each account uses the product and expose that per user and per billing period, as the foundation for plans, fair-use, overage, and later billing. Do not enforce or price anything until the pricing decision (D4) is settled.

## What "processed minutes" means here

V1 meters wall-clock active session time, computed app-side from a session's start and end timestamps, recorded when the session stops. This is deployable through Vercel and needs no engine change. It is a fair, auditable first measure. A later refinement can replace it with engine-measured audio-processing time (more precise for paused or partial sessions); see Constraints.

## Design (app-side, additive)

Data model (Neon, idempotent self-migration in app/lib/entitlements.js):
- auth_users.plan text default 'trial' — the account's plan.
- meetings.metered_seconds integer — the billable seconds recorded for that session.
- account_usage (user_email, period 'YYYY-MM', seconds_used, sessions, updated_at), primary key (user_email, period) — the per-month rollup.

Recording (app/api/meetings/[id] PATCH, on session stop):
- When ended_at is set for the first time, compute seconds from started_at to ended_at, clamp negatives to zero, cap a single session at six hours, write metered_seconds, and upsert the monthly rollup. Guarded so it records once and can never break the session-stop path.

Read (GET /api/usage, cookie-auth):
- Returns the current period, plan, plan label, included minutes, minutes used, remaining minutes, and session count for the logged-in user. Read-only, non-enforcing.

Plan config (app/lib/entitlements.js):
- PLANS map with placeholder included-minute allowances (trial/starter/pro/team). These are a testing hypothesis, not approved pricing (D4). Also holds the pure metering helpers (meteredSecondsFor, periodFor, planFor) so the logic is unit-testable.

Schema provisioning note: the schema is created by an idempotent self-migration (ensureUsageSchema), matching the project's existing self-migration pattern, rather than by scripts/migrate.mjs. A canonical migrate.mjs entry can be added later in a local session for tidiness; both would be idempotent and additive.

## Slice plan

- Slice 1 (done, verified): the data model, recording on session stop, the read-only usage API, plan config, and unit tests. Additive; no behaviour change to starting or running a session.
- Slice 2 (next, gated on D4): entitlement enforcement in the session-start path (soft warning near the limit, optional hard block over it, mode configurable and defaulting to warn-only so it cannot lock the operator out), and surfacing usage on the billing/insights pages.
- Slice 3 (later, needs a desktop/Mac session): replace wall-clock minutes with engine-measured processing time reported from the Cloudflare Worker session Durable Object.

## Acceptance

- Schema self-migration is additive and idempotent; a redeploy does not error and does not alter existing rows.
- Stopping a session records its minutes exactly once; a repeated stop does not double-count.
- Clock skew records zero, not a negative; a stuck session is capped, not unbounded.
- GET /api/usage returns 401 unauthenticated and the correct period totals when authenticated.
- Metering failure never blocks a session from stopping.
- No hardcoded price or plan decision is enforced; limits are display-only until D4.
- Unit tests (scripts/test-metering.mjs) pass.

## Constraints and dependencies

- Enforcement and the plan numbers depend on the pricing decision D4; slice 1 deliberately does not enforce.
- Engine-measured minutes (slice 3) require deploying the Cloudflare Worker, which uses the SMC-exclusive deploy token held on the Mac. That deploy cannot run from a web session; it needs the desktop app with the Mac bridge. This is a known execution constraint, not a blocker for slices 1 and 2.
