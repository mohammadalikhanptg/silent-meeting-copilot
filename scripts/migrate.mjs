import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Load .env.local for local builds (Vercel injects env vars automatically)
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[migrate] DATABASE_URL not set; skipping migration.');
  process.exit(0);
}
const sql = neon(url);
try {
  await sql`CREATE TABLE IF NOT EXISTS auth_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, totp_secret text, totp_verified_at timestamptz, last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS magic_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz, ip text, user_agent text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_magic_links_email_created ON magic_links (email, created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, ip text, user_agent text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)`;
  // P2: meeting persistence
  await sql`CREATE TABLE IF NOT EXISTS meetings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_email text NOT NULL, title text, objective text, language_mode text, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings (user_email, started_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS transcript_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES meetings(id), speaker text NOT NULL CHECK (speaker IN ('me','others')), raw text NOT NULL, cleaned text NOT NULL, lang text, ts timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments (meeting_id, ts)`;
  // P1/P2: repeat-back repair columns (idempotent — ADD COLUMN IF NOT EXISTS)
  await sql`ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS corrected_text text`;
  await sql`ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS clarified_by_me boolean DEFAULT false`;
  // Session 6 P1: operator profile — businesses, contact, common share items
  await sql`CREATE TABLE IF NOT EXISTS user_profiles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email    text UNIQUE NOT NULL,
    businesses    jsonb NOT NULL DEFAULT '[]'::jsonb,
    postal_address text,
    phone         text,
    emails        jsonb NOT NULL DEFAULT '[]'::jsonb,
    social_links  jsonb NOT NULL DEFAULT '[]'::jsonb,
    bio           text,
    common_items  jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at    timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (user_email)`;
  // Session 7 P4: per-meeting context/agenda notes
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS context_notes text`;
  // Session 7 P1: flagged items for follow-up tracker
  await sql`CREATE TABLE IF NOT EXISTS flagged_items (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id     uuid NOT NULL REFERENCES meetings(id),
    source_segment uuid REFERENCES transcript_segments(id),
    speaker        text NOT NULL,
    text           text NOT NULL,
    ts             timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL DEFAULT 'pending',
    assist_text    text,
    reference_json jsonb,
    addressed_at   timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flagged_meeting ON flagged_items (meeting_id, ts)`;
  // Session 9 P2: reference documents uploaded per session (pre-meeting prep)
  await sql`CREATE TABLE IF NOT EXISTS session_reference_docs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id   uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    filename     text NOT NULL,
    content_text text NOT NULL,
    added_at     timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ref_docs_meeting ON session_reference_docs (meeting_id, added_at)`;
  // Session 10 P1: profile dual-input — typed reference text + uploaded profile docs
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_reference_text text`;
  await sql`CREATE TABLE IF NOT EXISTS profile_docs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email   text NOT NULL,
    filename     text NOT NULL,
    content_text text NOT NULL,
    added_at     timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_profile_docs_user ON profile_docs (user_email, added_at)`;
  // Auth hardening 1: track last_seen per session row for effective revocation
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen timestamptz`;
  // Auth hardening 2: auth_attempts — rate limiting + TOTP lockout
  await sql`CREATE TABLE IF NOT EXISTS auth_attempts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type       text NOT NULL,
    key        text NOT NULL,
    success    boolean NOT NULL DEFAULT false,
    ip         text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_auth_attempts_key ON auth_attempts (type, key, created_at)`;
  // Session 12 P1: user roles — add role column, set admin for Mo's allowlist emails
  await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`;
  const adminEmails = (process.env.AUTH_ALLOWLIST || 'ali@pacific.london,ali@pacificinfotech.co.uk')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  for (const ae of adminEmails) {
    await sql`UPDATE auth_users SET role = 'admin' WHERE email = ${ae} AND role != 'admin'`;
  }
  // Session 12 P2: invitations — inert until admin manually sends the link
  await sql`CREATE TABLE IF NOT EXISTS invites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL,
    token       text NOT NULL UNIQUE,
    invited_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    status      text NOT NULL DEFAULT 'pending'
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token)`;
  // Auth hardening 4: encrypt existing plaintext TOTP secrets in place
  const encKey = process.env.TOTP_ENC_KEY;
  if (encKey) {
    const keyBuf = Buffer.from(encKey, 'hex');
    function encryptTotp(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1:${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
    }
    const users = await sql`SELECT email, totp_secret FROM auth_users WHERE totp_secret IS NOT NULL`;
    let migrated = 0;
    for (const user of users) {
      if (!user.totp_secret.startsWith('v1:')) {
        const encrypted = encryptTotp(user.totp_secret);
        await sql`UPDATE auth_users SET totp_secret = ${encrypted} WHERE email = ${user.email} AND totp_secret = ${user.totp_secret}`;
        migrated++;
      }
    }
    if (migrated > 0) console.log(`[migrate] encrypted ${migrated} TOTP secret(s)`);
  } else {
    console.warn('[migrate] TOTP_ENC_KEY not set — skipping TOTP encryption migration');
  }
  // Session 14 P1: per-user helper pairing key versioning
  await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS helper_key_version INT NOT NULL DEFAULT 1`;
  // Session 14 P2: link session code to meeting for engine ownership validation
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS session_code text`;
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_session_code ON meetings (session_code)`;
  console.log('[migrate] ok');
} catch (e) {
  // Permission denied = local env has a read-only DATABASE_URL.
  // Schema is already set up in production (Vercel uses its own env vars).
  // Warn but don't block the build.
  if (e.message && (e.message.includes('permission denied') || e.message.includes('read-only'))) {
    console.warn('[migrate] skipped: read-only DATABASE_URL detected — schema already set up in production');
    process.exit(0);
  }
  console.error('[migrate] failed:', e.message);
  process.exit(1);
}
