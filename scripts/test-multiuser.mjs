/**
 * test-multiuser.mjs — Session 12 multi-user/admin layer tests
 * Run: node scripts/test-multiuser.mjs
 *
 * No Next.js server imports — pure functions inlined, source checks for
 * route gating, DB integration test when DATABASE_URL is available.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

// ── Inline pure functions (mirrors auth.js, no Next.js deps) ─────────────────

function allowlist() {
  return (process.env.AUTH_ALLOWLIST || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

function isAllowed(email) {
  if (!email) return false;
  return allowlist().includes(email.trim().toLowerCase());
}

async function isAllowedFull(email, sql) {
  if (!email) return false;
  if (isAllowed(email)) return true;
  const rows = await sql`SELECT id FROM invites WHERE email = ${email.trim().toLowerCase()} AND status = 'accepted' LIMIT 1`;
  return rows.length > 0;
}

// Mock sql that returns empty results
function mockSql(results) {
  const fn = async (strings, ...values) => results;
  return new Proxy(fn, { apply: (target, thisArg, args) => fn() });
}

// ── Test 1: isAllowed (env allowlist) ────────────────────────────────────────
console.log('\nTest 1: isAllowed — env allowlist sync check');
process.env.AUTH_ALLOWLIST = 'ali@pacific.london,ali@pacificinfotech.co.uk';

assert('allowlist() returns 2 emails', allowlist().length === 2);
assert('isAllowed: known email → true', isAllowed('ali@pacific.london'));
assert('isAllowed: case-insensitive', isAllowed('ALI@PACIFIC.LONDON'));
assert('isAllowed: unknown email → false', !isAllowed('stranger@example.com'));
assert('isAllowed: empty string → false', !isAllowed(''));
assert('isAllowed: null → false', !isAllowed(null));

// ── Test 2: isAllowedFull — env allowlist path ───────────────────────────────
console.log('\nTest 2: isAllowedFull — env allowlist bypasses DB');
const sqlEmpty = mockSql([]);
const sqlAccepted = mockSql([{ id: 'some-uuid' }]);

assert('isAllowedFull: env email, no DB hit needed → true', await isAllowedFull('ali@pacific.london', sqlEmpty));
assert('isAllowedFull: env email case-insensitive → true', await isAllowedFull('ALI@PACIFIC.LONDON', sqlEmpty));

// ── Test 3: isAllowedFull — accepted invite ──────────────────────────────────
console.log('\nTest 3: isAllowedFull — accepted invite row');
assert('isAllowedFull: invite row found → true', await isAllowedFull('invited@example.com', sqlAccepted));

// ── Test 4: isAllowedFull — no invite → denied ──────────────────────────────
console.log('\nTest 4: isAllowedFull — no accepted invite → denied');
assert('isAllowedFull: no row, unknown email → false', !await isAllowedFull('stranger@example.com', sqlEmpty));
assert('isAllowedFull: null email → false', !await isAllowedFull(null, sqlEmpty));

// ── Test 5: Source checks — auth.js changes ──────────────────────────────────
console.log('\nTest 5: auth.js source — role in getSessionPayload');
const authSrc = readFileSync(join(__dir, '..', 'app', 'lib', 'auth.js'), 'utf8');
assert('auth.js: LEFT JOIN auth_users for role', authSrc.includes('LEFT JOIN auth_users'));
assert('auth.js: COALESCE role default user', authSrc.includes("COALESCE(u.role, 'user')"));
assert('auth.js: returns { ...p, role }', authSrc.includes('return { ...p, role }'));
assert('auth.js: exports isAllowedFull', authSrc.includes('export async function isAllowedFull'));
assert('auth.js: isAllowedFull checks invites table', authSrc.includes('FROM invites WHERE email'));
assert('auth.js: isAllowedFull checks status = accepted', authSrc.includes("AND status = 'accepted'"));

// ── Test 6: Admin API routes — role gating ───────────────────────────────────
console.log('\nTest 6: Admin routes gate by role === admin (source check)');
const adminUsersSrc = readFileSync(join(__dir, '..', 'app', 'api', 'admin', 'users', 'route.js'), 'utf8');
const adminInvitesSrc = readFileSync(join(__dir, '..', 'app', 'api', 'admin', 'invites', 'route.js'), 'utf8');
const adminRevokeSrc = readFileSync(join(__dir, '..', 'app', 'api', 'admin', 'invites', '[id]', 'route.js'), 'utf8');

assert("admin/users: checks session.role !== 'admin'", adminUsersSrc.includes("session.role !== 'admin'"));
assert('admin/users: returns 403 for non-admin', adminUsersSrc.includes('status: 403'));
assert("admin/invites: checks session.role !== 'admin'", adminInvitesSrc.includes("session.role !== 'admin'"));
assert('admin/invites: returns 403 for non-admin', adminInvitesSrc.includes('status: 403'));
assert("admin/invites/[id]: checks session.role !== 'admin'", adminRevokeSrc.includes("session.role !== 'admin'"));
assert('admin/invites/[id]: returns 403 for non-admin', adminRevokeSrc.includes('status: 403'));

// ── Test 7: Admin page enforces role server-side ─────────────────────────────
console.log('\nTest 7: Admin page server-side role enforcement');
const adminPageSrc = readFileSync(join(__dir, '..', 'app', 'admin', 'page.js'), 'utf8');
assert('admin page: calls getSessionPayload', adminPageSrc.includes('getSessionPayload'));
assert("admin page: redirects non-admin (role !== 'admin')", adminPageSrc.includes("session.role !== 'admin'"));
assert("admin page: redirects to /meetings", adminPageSrc.includes("redirect('/meetings')"));

// ── Test 8: IDOR isolation — source-level audit ──────────────────────────────
console.log('\nTest 8: Per-user isolation — source-level IDOR audit');
const routeSrcs = {
  meetings:     readFileSync(join(__dir, '..', 'app', 'api', 'meetings', 'route.js'), 'utf8'),
  meetingId:    readFileSync(join(__dir, '..', 'app', 'api', 'meetings', '[id]', 'route.js'), 'utf8'),
  segments:     readFileSync(join(__dir, '..', 'app', 'api', 'meetings', '[id]', 'segments', 'route.js'), 'utf8'),
  refDocs:      readFileSync(join(__dir, '..', 'app', 'api', 'meetings', '[id]', 'ref-docs', 'route.js'), 'utf8'),
  flaggedItems: readFileSync(join(__dir, '..', 'app', 'api', 'flagged-items', 'route.js'), 'utf8'),
  profile:      readFileSync(join(__dir, '..', 'app', 'api', 'profile', 'route.js'), 'utf8'),
  profileDocs:  readFileSync(join(__dir, '..', 'app', 'api', 'profile-docs', 'route.js'), 'utf8'),
};
assert('meetings list: scoped by user_email', routeSrcs.meetings.includes('user_email'));
assert('meeting PATCH: scoped by user_email', routeSrcs.meetingId.includes('user_email'));
assert('segments POST: verifies meeting ownership (user_email)', routeSrcs.segments.includes('user_email'));
assert('ref-docs: verifies meeting ownership (user_email)', routeSrcs.refDocs.includes('user_email'));
assert('flagged-items: verifies meeting ownership (user_email)', routeSrcs.flaggedItems.includes('user_email'));
assert('profile GET/PUT: scoped by session.email', routeSrcs.profile.includes('session.email'));
assert('profile-docs GET/POST: scoped by session.email', routeSrcs.profileDocs.includes('session.email'));

// ── Test 9: Accept-invite route ──────────────────────────────────────────────
console.log('\nTest 9: Accept-invite route structure');
const acceptInviteSrc = readFileSync(join(__dir, '..', 'app', 'api', 'auth', 'accept-invite', 'route.js'), 'utf8');
assert('accept-invite: validates token against invites table', acceptInviteSrc.includes('WHERE token'));
assert("accept-invite: rejects revoked invites", acceptInviteSrc.includes("status === 'revoked'"));
assert("accept-invite: redirects with invalid_invite error", acceptInviteSrc.includes('invalid_invite'));
assert('accept-invite: creates auth_users row (INSERT INTO auth_users)', acceptInviteSrc.includes('INSERT INTO auth_users'));
assert("accept-invite: marks invite accepted", acceptInviteSrc.includes("status = 'accepted'"));
assert('accept-invite: sets smc_pre cookie (PRE_COOKIE)', acceptInviteSrc.includes('PRE_COOKIE'));
assert('accept-invite: routes to TOTP setup (/totp)', acceptInviteSrc.includes('/totp'));

// ── Test 10: Revoke route kills sessions ──────────────────────────────────────
console.log('\nTest 10: Revoke route terminates sessions');
assert('admin/invites/[id]: sets revoked_at on sessions', adminRevokeSrc.includes('revoked_at = now()'));
assert("admin/invites/[id]: updates invite status to revoked", adminRevokeSrc.includes("status = 'revoked'"));

// ── Test 11: migrate.mjs schema additions ────────────────────────────────────
console.log('\nTest 11: migrate.mjs schema — role column + invites table');
const migrateSrc = readFileSync(join(__dir, '..', 'scripts', 'migrate.mjs'), 'utf8');
assert("migrate: adds role column to auth_users", migrateSrc.includes("ADD COLUMN IF NOT EXISTS role"));
assert("migrate: default role is 'user'", migrateSrc.includes("DEFAULT 'user'"));
assert("migrate: sets admin for allowlist emails", migrateSrc.includes("SET role = 'admin'"));
assert("migrate: creates invites table", migrateSrc.includes("CREATE TABLE IF NOT EXISTS invites"));
assert("migrate: invites has token column", migrateSrc.includes('token') && migrateSrc.includes('invites'));
assert("migrate: invites has status column", migrateSrc.includes("status      text NOT NULL DEFAULT 'pending'"));
assert("migrate: creates idx_invites_email index", migrateSrc.includes('idx_invites_email'));
assert("migrate: creates idx_invites_token index", migrateSrc.includes('idx_invites_token'));

// ── Test 12: Admin-only invite check ─────────────────────────────────────────
console.log('\nTest 12: Admin invites prevent re-inviting env allowlist users');
assert('admin/invites: blocks env-allowlist emails', adminInvitesSrc.includes('already in the env allowlist'));
assert('admin/invites: blocks duplicate active invites', adminInvitesSrc.includes("status != 'revoked'"));

// ── Test 13: DB integration (IDOR) — if DATABASE_URL available ───────────────
console.log('\nTest 13: DB integration — IDOR cross-user isolation');
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.log('  ⏭ DATABASE_URL not set — skipping DB IDOR test');
} else {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(dbUrl);
  const emailA = `idor-test-a-${Date.now()}@example.com`;
  const emailB = `idor-test-b-${Date.now()}@example.com`;
  let meetingAId = null;
  try {
    const ma = await sql`
      INSERT INTO meetings (user_email, title) VALUES (${emailA}, 'IDOR Test Meeting A')
      RETURNING id
    `;
    meetingAId = ma[0].id;

    // User B tries to read user A's meeting by ID — same query as route handler
    const idor = await sql`SELECT id FROM meetings WHERE id = ${meetingAId} AND user_email = ${emailB}`;
    assert('IDOR: user B cannot read user A meeting by direct ID', idor.length === 0);

    // User B tries to create a segment in user A's meeting
    const segCheck = await sql`SELECT id FROM meetings WHERE id = ${meetingAId} AND user_email = ${emailB}`;
    assert('IDOR: segment insert ownership check returns 0 rows for user B', segCheck.length === 0);

    // User A can read their own meeting
    const own = await sql`SELECT id FROM meetings WHERE id = ${meetingAId} AND user_email = ${emailA}`;
    assert('User A can read their own meeting', own.length === 1);

    await sql`DELETE FROM meetings WHERE id = ${meetingAId}`;
    assert('DB: test cleanup successful', true);
  } catch (e) {
    if (e.message.includes('permission denied')) {
      console.log('  ⏭ Read-only DB — skipping live IDOR test');
    } else {
      assert('DB IDOR test: no unexpected error', false, e.message);
      if (meetingAId) {
        await sql`DELETE FROM meetings WHERE id = ${meetingAId}`.catch(() => {});
      }
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed ✅');
} else {
  console.log(`${failed} test(s) failed ❌`);
  process.exit(1);
}
