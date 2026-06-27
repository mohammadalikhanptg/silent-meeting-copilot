// Test suite: F2 — per-device helper pairing keys + individual revocation.
// Runs offline (no DB, no engine). Gives REAL coverage of the security-critical
// revocation decision (app/lib/helper-devices.js, a pure no-Next module) and
// source-checks the route/migration/profile wiring that surrounds it.
// Run: node scripts/test-helper-devices.mjs

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { newHelperDeviceId, helperDeviceDecision } from '../app/lib/helper-devices.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

// ── Test harness ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

// ── Key codec (format mirrors app/lib/auth.js; device id rides inside the key) ──
const TEST_SECRET = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
function genKey(email, version, deviceId) {
  const body = { u: email, v: version, kid: 'k1' };
  if (deviceId) body.d = deviceId;
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
  return `smc1_${payload}.${sig}`;
}
function decodeKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('smc1_')) return null;
  const rest = key.slice(5);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  try {
    const parsed = JSON.parse(Buffer.from(rest.slice(0, dot), 'base64url').toString('utf8'));
    if (!parsed.u || parsed.v === undefined) return null;
    return { email: parsed.u, version: parsed.v, deviceId: parsed.d || null, kid: parsed.kid || null };
  } catch { return null; }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

console.log('\nTest 1: newHelperDeviceId — unguessable, unique, no PII');
{
  const a = newHelperDeviceId();
  const b = newHelperDeviceId();
  assert('returns a non-empty string', typeof a === 'string' && a.length > 0);
  assert('two ids differ (random)', a !== b);
  assert('url-safe token chars only', /^[A-Za-z0-9_\-]+$/.test(a));
  assert('carries no email/PII', !a.includes('@'));
  assert('long enough to resist guessing (>= 12 chars)', a.length >= 12);
}

console.log('\nTest 2: Key carries the device id, round-trips, and stays HMAC-verifiable');
{
  const dev = newHelperDeviceId();
  const key = genKey('ali@pacific.london', 3, dev);
  const d = decodeKey(key);
  assert('decoded email matches', d?.email === 'ali@pacific.london');
  assert('decoded version matches', d?.version === 3);
  assert('decoded device id matches', d?.deviceId === dev);
  // signature still binds the whole payload (device id included)
  const expected = crypto.createHmac('sha256', TEST_SECRET).update(key.slice(5).split('.')[0]).digest('base64url');
  assert('signature covers the device-id payload', key.endsWith(expected));
}

console.log('\nTest 3: helperDeviceDecision — active device accepted');
{
  const d = decodeKey(genKey('a@b.com', 1, 'hd_abc'));
  const row = { device_id: 'hd_abc', user_email: 'a@b.com', revoked_at: null };
  const r = helperDeviceDecision(d, row);
  assert('active device → ok', r.ok === true);
  assert('not flagged legacy', !r.legacy);
}

console.log('\nTest 4: helperDeviceDecision — revoked device rejected');
{
  const d = decodeKey(genKey('a@b.com', 1, 'hd_abc'));
  const row = { device_id: 'hd_abc', user_email: 'a@b.com', revoked_at: new Date().toISOString() };
  const r = helperDeviceDecision(d, row);
  assert('revoked device → not ok', r.ok === false);
  assert('reason mentions revoked', /revok/i.test(r.reason || ''));
}

console.log('\nTest 5: helperDeviceDecision — unknown device (no row) rejected');
{
  const d = decodeKey(genKey('a@b.com', 1, 'hd_ghost'));
  const r = helperDeviceDecision(d, null);
  assert('unknown device → not ok', r.ok === false);
  assert('reason mentions unknown', /unknown|not found/i.test(r.reason || ''));
}

console.log('\nTest 6: helperDeviceDecision — device row belongs to another user');
{
  const d = decodeKey(genKey('a@b.com', 1, 'hd_abc'));
  const row = { device_id: 'hd_abc', user_email: 'someone-else@b.com', revoked_at: null };
  const r = helperDeviceDecision(d, row);
  assert('cross-user device row → not ok', r.ok === false);
}

console.log('\nTest 7: helperDeviceDecision — legacy key (no device id) still accepted (migration bridge)');
{
  const d = decodeKey(genKey('a@b.com', 1, null)); // pre-F2 key, no `d`
  assert('legacy key decodes with null deviceId', d?.deviceId === null);
  const r = helperDeviceDecision(d, null); // no device row exists for a legacy key
  assert('legacy key → ok', r.ok === true);
  assert('legacy key flagged as legacy', r.legacy === true);
}

console.log('\nTest 8: helperDeviceDecision — null/garbage decoded input fails closed');
{
  assert('null decoded → not ok', helperDeviceDecision(null, null).ok === false);
  assert('decoded without email → not ok', helperDeviceDecision({ deviceId: 'x' }, { device_id: 'x', revoked_at: null }).ok === false);
}

console.log('\nTest 9: auth.js — key codec threads the device id');
{
  const src = readFileSync(join(root, 'app/lib/auth.js'), 'utf8');
  assert('generateHelperKey accepts a deviceId arg', /generateHelperKey\([^)]*deviceId/.test(src));
  assert('payload includes d (device id)', /\bbody\.d\s*=\s*deviceId/.test(src));
  assert('decodeHelperKey surfaces deviceId from d', /deviceId:\s*parsed\.d/.test(src));
}

console.log('\nTest 10: validate-helper-key route — enforces per-device revocation');
{
  const src = readFileSync(join(root, 'app/api/internal/validate-helper-key/route.js'), 'utf8');
  assert('still verifies HMAC', src.includes('verifyHelperKeyHmac'));
  assert('still checks helper_key_version (coarse rotation)', src.includes('helper_key_version'));
  assert('looks up helper_devices', src.includes('helper_devices'));
  assert('applies helperDeviceDecision', src.includes('helperDeviceDecision'));
  assert('updates last_seen_at', src.includes('last_seen_at'));
}

console.log('\nTest 11: helper-key route — issue / revoke / rotate-all actions');
{
  const src = readFileSync(join(root, 'app/api/helper-key/route.js'), 'utf8');
  assert('GET lists devices from helper_devices', src.includes('helper_devices'));
  assert('issue action mints a per-device key', src.includes("'issue'") || src.includes('"issue"'));
  assert('issue inserts a device row', /INSERT INTO helper_devices/i.test(src));
  assert('revoke action sets revoked_at', src.includes("'revoke'") || src.includes('"revoke"'));
  assert('revoke is ownership-scoped (user_email)', /revoked_at[\s\S]*user_email/i.test(src));
  assert('rotate-all still bumps helper_key_version', src.includes('helper_key_version + 1'));
  assert('issue/revoke pass the device id to generateHelperKey or DB', src.includes('newHelperDeviceId') || src.includes('generateHelperKey'));
}

console.log('\nTest 12: migration — helper_devices table + index');
{
  const src = readFileSync(join(root, 'scripts/migrate.mjs'), 'utf8');
  assert('creates helper_devices table', /CREATE TABLE IF NOT EXISTS helper_devices/i.test(src));
  assert('has device_id primary key', /device_id\s+text\s+PRIMARY KEY/i.test(src));
  assert('has revoked_at column', /revoked_at/i.test(src));
  assert('has last_seen_at column', /last_seen_at/i.test(src));
  assert('indexes by user_email', /idx_helper_devices_user/i.test(src));
}

console.log('\nTest 13: profile page — paired-devices management UI');
{
  const src = readFileSync(join(root, 'app/profile/page.js'), 'utf8');
  assert('fetches /api/helper-key', src.includes('/api/helper-key'));
  assert('renders a device list (devices state)', src.includes('devices'));
  assert('can pair a new device (issue)', src.includes('issue'));
  assert('can revoke a device', src.includes('revoke'));
  assert('keeps a rotate-all action', src.includes('rotateKey') || src.includes('rotate-all') || src.includes('rotateAll'));
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('All tests passed ✅');
else { console.log('Some tests FAILED ❌'); process.exit(1); }
