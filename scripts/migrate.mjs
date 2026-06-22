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
  console.log('[migrate] ok');
} catch (e) {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
}
