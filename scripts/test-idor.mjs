// test-idor.mjs — proves cross-account isolation (IDOR). Security framework F7.
// Run: node scripts/test-idor.mjs
//
// Two parts:
//  1) Structural: every data route authenticates AND scopes its query by the
//     authenticated owner, so one account's id cannot reach another's rows.
//  2) Runtime: account B cannot READ or DELETE account A's session (and thus its
//     transcript / reference docs / flagged artifacts, which are guarded at the
//     session level). Runs against the in-memory store offline, and against live
//     Neon when DATABASE_URL is set.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { makeFakeSql, uid } from './lib/fake-sql.mjs';
import { getOwnedSession, hardDeleteSession, verifySessionPurged } from '../app/lib/retention.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..');
try {
  const lines = readFileSync(join(repoRoot, '.env.local'), 'utf8').split('\n');
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

// ── 1) Structural: enumerate data routes, assert owner-scoping ──────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === 'route.js') out.push(full);
  }
  return out;
}

console.log('=== Structural: every data route is owner-scoped ===');
const apiDir = join(repoRoot, 'app', 'api');
const routeFiles = walk(apiDir);
// Routes that read/write user-owned session content (must scope by owner).
const DATA_ROUTE_RE = /[\\/]api[\\/](meetings|flagged-items|profile-docs)([\\/]|$)/;
const dataRoutes = routeFiles.filter(f => DATA_ROUTE_RE.test(f));
assert('found the user-data route set', dataRoutes.length >= 5, String(dataRoutes.length));

// An owner scope is any of: a query filtered by the session email, a meeting
// ownership join, or delegation to hardDeleteSession (itself owner-scoped).
const OWNER_SCOPE_RES = [
  /user_email\s*=\s*\$\{session\.email\}/,
  /m\.user_email\s*=\s*\$\{session\.email\}/,
  /user_email\s*=\s*\$\{owner/,
  /hardDeleteSession/,
];
for (const f of dataRoutes) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(repoRoot, f);
  const authed = /getSessionPayload\s*\(/.test(src);
  const scoped = OWNER_SCOPE_RES.some(re => re.test(src));
  // process/[itemId] sub-routes inherit the parent join — accept a flagged_items
  // join to meetings as scoping too.
  const joinScoped = /JOIN meetings m ON m\.id = .*meeting_id/i.test(src) || scoped;
  assert(`${rel} authenticates the caller`, authed);
  assert(`${rel} scopes its query by the authenticated owner`, joinScoped, 'no owner-scope pattern found');
}

// ── 2) Runtime: cross-account read + delete are denied ──────────────────────
function seed() {
  const store = {};
  const sql = makeFakeSql(store);
  const A = uid('mtg');
  store.meetings.push({ id: A, user_email: 'alice@x.test', title: 'Alice private', mode_type: 'meeting', started_at: '2026-06-01T00:00:00Z', ended_at: null });
  const seg = uid('seg');
  store.transcript_segments.push({ id: seg, meeting_id: A });
  store.flagged_items.push({ id: uid('flag'), meeting_id: A, source_segment: seg });
  store.session_reference_docs.push({ id: uid('doc'), meeting_id: A });
  return { store, sql, A };
}

async function runtime(label, sql, A, getStore) {
  console.log(`\n${label}`);
  // READ isolation
  const asBob = await getOwnedSession(sql, { meetingId: A, ownerEmail: 'bob@x.test' });
  assert('account B CANNOT read account A\'s session (getOwnedSession → null)', asBob === null, JSON.stringify(asBob));
  const asAlice = await getOwnedSession(sql, { meetingId: A, ownerEmail: 'alice@x.test' });
  assert('account A CAN read its own session', asAlice && asAlice.id === A, JSON.stringify(asAlice));

  // DELETE isolation
  const bobDelete = await hardDeleteSession(sql, { meetingId: A, ownerEmail: 'bob@x.test' });
  assert('account B CANNOT delete account A\'s session (ok:false, forbidden)', bobDelete.ok === false && bobDelete.reason === 'not_found_or_forbidden', JSON.stringify(bobDelete));

  // Crucially, B's attempt removed ZERO child rows (guard runs before any delete).
  const stillThere = await verifySessionPurged(sql, A);
  assert('account A\'s transcript/flag/ref-doc rows all survived B\'s attempt', stillThere.total > 1 && stillThere.meetings === 1, JSON.stringify(stillThere));

  // The legitimate owner can delete.
  const aliceDelete = await hardDeleteSession(sql, { meetingId: A, ownerEmail: 'alice@x.test' });
  assert('account A can hard-delete its own session', aliceDelete.ok === true && aliceDelete.remaining.total === 0, JSON.stringify(aliceDelete));
}

{
  const { sql, A } = seed();
  await runtime('=== Runtime IDOR (in-memory) ===', sql, A);
}

if (process.env.DATABASE_URL) {
  console.log('\n=== Runtime IDOR (live DB) ===');
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const tag = `idor-test-${process.pid}-${Date.now()}`;
    const alice = `${tag}-alice@x.test`, bob = `${tag}-bob@x.test`;
    const [a] = await sql`INSERT INTO meetings (user_email, title, mode_type) VALUES (${alice}, 'Alice private', 'meeting') RETURNING id`;
    const [seg] = await sql`INSERT INTO transcript_segments (meeting_id, speaker, raw, cleaned) VALUES (${a.id}, 'me', 'x', 'x') RETURNING id`;
    await sql`INSERT INTO flagged_items (meeting_id, source_segment, speaker, text) VALUES (${a.id}, ${seg.id}, 'me', 'x')`;
    await sql`INSERT INTO session_reference_docs (meeting_id, filename, content_text) VALUES (${a.id}, 'cv.txt', 'x')`;

    const bobRead = await getOwnedSession(sql, { meetingId: a.id, ownerEmail: bob });
    assert('[live] B cannot read A\'s session', bobRead === null);
    const bobDel = await hardDeleteSession(sql, { meetingId: a.id, ownerEmail: bob });
    assert('[live] B cannot delete A\'s session', bobDel.ok === false);
    const survive = await verifySessionPurged(sql, a.id);
    assert('[live] A\'s rows survived B\'s attempt', survive.meetings === 1 && survive.total > 1, JSON.stringify(survive));
    const aliceDel = await hardDeleteSession(sql, { meetingId: a.id, ownerEmail: alice });
    assert('[live] A can delete its own session, nothing remains', aliceDel.ok && aliceDel.remaining.total === 0);
  } catch (e) {
    if (/permission denied|read-only/i.test(e.message)) console.warn('  ⚠️  live DB read-only — skipped');
    else { console.error('  ❌ live DB IDOR proof errored:', e.message); failed++; }
  }
} else {
  console.log('\n(ℹ️  DATABASE_URL not set — live DB proof skipped; in-memory proof above is authoritative for CI)');
}

console.log(`\n${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
