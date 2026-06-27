#!/usr/bin/env node
// purge-retention.mjs — operator/cron-triggerable retention enforcement.
//
// Hard-deletes every session past its retention window (RETENTION.sessionDays,
// or RETENTION.botSessionDays for future bot sessions) plus auth-side
// housekeeping. Prints what it removed. Safe to run repeatedly (idempotent).
//
// Run:        node scripts/purge-retention.mjs
// Dry run:    node scripts/purge-retention.mjs --dry-run
//
// Cron hook: schedule this daily (e.g. a Vercel cron route or a Mac cron) once
// real third-party/bot data lands. Until then it is a no-op on an empty/old-row
// set. Requires DATABASE_URL in the environment (or .env.local).
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  RETENTION,
  RETENTION_CLASSES,
  purgeExpiredSessions,
  purgeAuthHousekeeping,
} from '../app/lib/retention.js';

const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const dryRun = process.argv.includes('--dry-run');

console.log('[purge] retention windows:');
for (const c of RETENTION_CLASSES) console.log(`  - ${c.data}: ${c.window}  (${c.purge})`);
console.log(`[purge] effective: session=${RETENTION.sessionDays}d  bot=${RETENTION.botSessionDays}d`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[purge] DATABASE_URL not set — nothing to do.');
  process.exit(0);
}
const sql = neon(url);

try {
  if (dryRun) {
    const now = new Date();
    const stdCutoff = new Date(now.getTime() - RETENTION.sessionDays * 86400_000).toISOString();
    const botCutoff = new Date(now.getTime() - RETENTION.botSessionDays * 86400_000).toISOString();
    const expired = await sql`
      SELECT count(*)::int AS n FROM meetings
      WHERE (mode_type = 'bot' AND COALESCE(ended_at, started_at) < ${botCutoff})
         OR (mode_type <> 'bot' AND COALESCE(ended_at, started_at) < ${stdCutoff})
    `;
    console.log(`[purge] DRY RUN — ${expired[0].n} session(s) past window would be hard-deleted.`);
    process.exit(0);
  }
  const sessions = await purgeExpiredSessions(sql);
  console.log(`[purge] sessions: scanned ${sessions.scanned}, hard-deleted ${sessions.purged}`);
  const incomplete = sessions.results.filter(r => r.ok && r.remaining.total !== 0);
  if (incomplete.length) {
    console.error(`[purge] FAIL: ${incomplete.length} session(s) still have rows after delete`);
    process.exit(1);
  }
  const auth = await purgeAuthHousekeeping(sql);
  console.log(`[purge] auth housekeeping: magic_links ${auth.magic_links}, auth_attempts ${auth.auth_attempts}, sessions ${auth.sessions}`);
  console.log('[purge] ok');
} catch (e) {
  if (e.message && (e.message.includes('permission denied') || e.message.includes('read-only'))) {
    console.warn('[purge] skipped: read-only DATABASE_URL detected.');
    process.exit(0);
  }
  console.error('[purge] failed:', e.message);
  process.exit(1);
}
