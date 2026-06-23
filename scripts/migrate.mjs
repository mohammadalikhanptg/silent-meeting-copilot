import { neon } from '@neondatabase/serverless';

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
  console.log('[migrate] ok');
} catch (e) {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
}
