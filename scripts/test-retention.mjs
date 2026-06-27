// test-retention.mjs — proves the retention policy + verifiable hard-delete.
// Run: node scripts/test-retention.mjs
//
// Offline (default): exercises the REAL app/lib/retention.js logic against an
// in-memory store, asserting that after hardDeleteSession NOTHING remains for the
// session across every table, while a sibling session is untouched.
// Online (DATABASE_URL set): repeats the proof against live Neon and cleans up.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeFakeSql, uid } from './lib/fake-sql.mjs';
import {
  RETENTION,
  RETENTION_CLASSES,
  SESSION_CHILD_TABLES,
  hardDeleteSession,
  getOwnedSession,
  verifySessionPurged,
  purgeExpiredSessions,
} from '../app/lib/retention.js';

const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

let passed = 0, failed = 0;
function assert(label, cond, detail) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ ${label}${detail ? `: ${detail}` : ''}`); failed++; }
}

// ── Seed two sessions with full child rows ──────────────────────────────────
function seedStore() {
  const store = {};
  const sql = makeFakeSql(store);
  const A = uid('mtg'), B = uid('mtg');
  store.meetings.push({ id: A, user_email: 'alice@x.test', title: 'A', mode_type: 'meeting', started_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-01T01:00:00Z' });
  store.meetings.push({ id: B, user_email: 'bob@x.test', title: 'B', mode_type: 'meeting', started_at: '2026-06-01T00:00:00Z', ended_at: '2026-06-01T01:00:00Z' });
  // Children for A
  const segA = uid('seg');
  store.transcript_segments.push({ id: segA, meeting_id: A });
  store.transcript_segments.push({ id: uid('seg'), meeting_id: A });
  store.flagged_items.push({ id: uid('flag'), meeting_id: A, source_segment: segA });
  store.session_reference_docs.push({ id: uid('doc'), meeting_id: A });
  // Children for B (must survive A's delete)
  store.transcript_segments.push({ id: uid('seg'), meeting_id: B });
  store.flagged_items.push({ id: uid('flag'), meeting_id: B });
  return { store, sql, A, B };
}

async function run(label, sql, A, B) {
  console.log(`\n${label}`);

  // Pre: A has rows in every child table.
  const before = await verifySessionPurged(sql, A);
  assert('session A has rows in every child table before delete',
    before.flagged_items > 0 && before.transcript_segments > 0 && before.session_reference_docs > 0 && before.meetings === 1,
    JSON.stringify(before));

  // Hard delete A as its owner.
  const res = await hardDeleteSession(sql, { meetingId: A, ownerEmail: 'alice@x.test' });
  assert('hardDeleteSession returns ok', res.ok === true, JSON.stringify(res));
  assert('reported deleted the meeting row', res.deleted?.meetings === 1, JSON.stringify(res.deleted));
  assert('reported deleted child rows', res.deleted?.transcript_segments >= 1 && res.deleted?.flagged_items >= 1 && res.deleted?.session_reference_docs >= 1, JSON.stringify(res.deleted));

  // THE headline assertion: nothing remains, anywhere.
  assert('NOTHING remains for session A after delete (remaining.total === 0)', res.remaining.total === 0, JSON.stringify(res.remaining));
  const after = await verifySessionPurged(sql, A);
  assert('independent re-verify confirms 0 rows across all tables', after.total === 0, JSON.stringify(after));

  // Sibling session B is untouched.
  const bRemain = await verifySessionPurged(sql, B);
  assert('sibling session B is untouched', bRemain.meetings === 1 && (bRemain.transcript_segments + bRemain.flagged_items) >= 1, JSON.stringify(bRemain));

  // Deleting again is a safe no-op (already gone).
  const again = await hardDeleteSession(sql, { meetingId: A, ownerEmail: 'alice@x.test' });
  assert('re-deleting an already-purged session is a safe no-op', again.ok === false && again.reason === 'not_found_or_forbidden', JSON.stringify(again));
}

console.log('=== Retention policy ===');
assert('SESSION_CHILD_TABLES covers all per-session tables',
  ['flagged_items', 'transcript_segments', 'session_reference_docs'].every(t => SESSION_CHILD_TABLES.includes(t)));
assert('retention window for sessions is explicit and short-ish (<= 365d)', RETENTION.sessionDays > 0 && RETENTION.sessionDays <= 365, String(RETENTION.sessionDays));
assert('future bot sessions default to a SHORT window (<= sessionDays)', RETENTION.botSessionDays > 0 && RETENTION.botSessionDays <= RETENTION.sessionDays, String(RETENTION.botSessionDays));
for (const cls of ['Session row (meetings)', 'Transcript segments', 'Temporary audio chunks', 'Server logs']) {
  assert(`retention class documented: ${cls}`, RETENTION_CLASSES.some(c => c.data === cls));
}
const audioClass = RETENTION_CLASSES.find(c => c.data === 'Temporary audio chunks');
assert('audio is documented as never persisted', /never persisted|not persisted|in memory|in-memory/i.test(audioClass?.store || ''), audioClass?.store);

// Offline proof
{
  const { sql, A, B } = seedStore();
  await run('=== Hard-delete (in-memory) ===', sql, A, B);
}

// Purge-by-window proof (in-memory, deterministic clock)
{
  console.log('\n=== Scheduled purge by retention window ===');
  const store = {};
  const sql = makeFakeSql(store);
  const now = new Date('2026-06-25T00:00:00Z');
  const old = new Date(now.getTime() - (RETENTION.sessionDays + 5) * 86400_000).toISOString();
  const fresh = new Date(now.getTime() - 1 * 86400_000).toISOString();
  const oldBot = new Date(now.getTime() - (RETENTION.botSessionDays + 2) * 86400_000).toISOString();
  const Mold = uid('mtg'), Mfresh = uid('mtg'), Mbot = uid('mtg');
  store.meetings.push({ id: Mold, user_email: 'alice@x.test', mode_type: 'meeting', started_at: old, ended_at: old });
  store.meetings.push({ id: Mfresh, user_email: 'alice@x.test', mode_type: 'meeting', started_at: fresh, ended_at: fresh });
  store.meetings.push({ id: Mbot, user_email: 'bot@x.test', mode_type: 'bot', started_at: oldBot, ended_at: oldBot });
  store.transcript_segments.push({ id: uid('seg'), meeting_id: Mold });
  const out = await purgeExpiredSessions(sql, now);
  assert('purge removed the expired standard + bot sessions', out.purged === 2, JSON.stringify(out));
  assert('fresh session survived the purge', store.meetings.some(m => m.id === Mfresh), 'fresh missing');
  assert('expired session children also gone', store.transcript_segments.filter(s => s.meeting_id === Mold).length === 0);
  assert('bot session honoured the shorter bot window', !store.meetings.some(m => m.id === Mbot), 'bot survived');
}

// ── Online proof (only when DATABASE_URL is present) ────────────────────────
if (process.env.DATABASE_URL) {
  console.log('\n=== Live DB proof (DATABASE_URL present) ===');
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const tag = `ret-test-${process.pid}-${Date.now()}`;
    const alice = `${tag}-alice@x.test`, bob = `${tag}-bob@x.test`;
    const [a] = await sql`INSERT INTO meetings (user_email, title, mode_type) VALUES (${alice}, 'A', 'meeting') RETURNING id`;
    const [b] = await sql`INSERT INTO meetings (user_email, title, mode_type) VALUES (${bob}, 'B', 'meeting') RETURNING id`;
    const [seg] = await sql`INSERT INTO transcript_segments (meeting_id, speaker, raw, cleaned) VALUES (${a.id}, 'me', 'x', 'x') RETURNING id`;
    await sql`INSERT INTO flagged_items (meeting_id, source_segment, speaker, text) VALUES (${a.id}, ${seg.id}, 'me', 'x')`;
    await sql`INSERT INTO session_reference_docs (meeting_id, filename, content_text) VALUES (${a.id}, 'cv.txt', 'x')`;
    await sql`INSERT INTO transcript_segments (meeting_id, speaker, raw, cleaned) VALUES (${b.id}, 'me', 'y', 'y')`;

    const r = await hardDeleteSession(sql, { meetingId: a.id, ownerEmail: alice });
    assert('[live] hard-delete ok and remaining.total === 0', r.ok && r.remaining.total === 0, JSON.stringify(r.remaining));
    const after = await verifySessionPurged(sql, a.id);
    assert('[live] independent re-verify: 0 rows remain', after.total === 0, JSON.stringify(after));
    const bAfter = await verifySessionPurged(sql, b.id);
    assert('[live] sibling session intact', bAfter.meetings === 1, JSON.stringify(bAfter));

    // Cleanup B
    await hardDeleteSession(sql, { meetingId: b.id, ownerEmail: bob });
  } catch (e) {
    if (/permission denied|read-only/i.test(e.message)) console.warn('  ⚠️  live DB read-only — skipped');
    else { console.error('  ❌ live DB proof errored:', e.message); failed++; }
  }
} else {
  console.log('\n(ℹ️  DATABASE_URL not set — live DB proof skipped; in-memory proof above is authoritative for CI)');
}

console.log(`\n${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
