// Phase 3 — usage metering: plan entitlements and metering helpers.
//
// The per-plan minute allowances below are a PLACEHOLDER testing hypothesis,
// not approved pricing or packaging. Pricing is decision D4 and is not settled,
// so nothing here enforces a limit yet; these values drive display only. When
// D4 lands, tune the numbers and add enforcement in the session-start path.

export const DEFAULT_PLAN = 'trial';

export const PLANS = {
  trial:   { label: 'Trial',   includedMinutes: 120 },
  starter: { label: 'Starter', includedMinutes: 600 },
  pro:     { label: 'Pro',     includedMinutes: 2400 },
  team:    { label: 'Team',    includedMinutes: 6000 },
};

export function planFor(name) {
  return PLANS[name] || PLANS[DEFAULT_PLAN];
}

// Billing period key for a date, 'YYYY-MM' in UTC.
export function periodFor(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

// Metered seconds for a session, from its start and end timestamps.
// Guards against clock skew (negative -> 0) and stuck/never-ended sessions
// (capped at 6 hours). Returns an integer number of seconds.
export function meteredSecondsFor(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  let seconds = Math.round((end - start) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const CAP_SECONDS = 6 * 3600;
  if (seconds > CAP_SECONDS) seconds = CAP_SECONDS;
  return seconds;
}

// Idempotent self-migration for the usage-metering schema, following the
// project's established self-migration pattern (see profile default_bot_name).
// Runs its DDL once per warm serverless instance; all statements are additive
// and IF NOT EXISTS, so repeated or concurrent calls are safe.
let _usageSchemaReady = false;
export async function ensureUsageSchema(sql) {
  if (_usageSchemaReady) return;
  await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'trial'`;
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS metered_seconds integer`;
  await sql`CREATE TABLE IF NOT EXISTS account_usage (
    user_email   text NOT NULL,
    period       text NOT NULL,
    seconds_used bigint NOT NULL DEFAULT 0,
    sessions     integer NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_email, period)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_account_usage_user ON account_usage (user_email, period DESC)`;
  _usageSchemaReady = true;
}
