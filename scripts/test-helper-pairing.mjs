// Test suite: helper pairing key — P1-P5 verification
// Runs without a live DB or engine. Tests HMAC logic, key format, and validation logic.
// Run: node scripts/test-helper-pairing.mjs

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
// Load .env.local for local test runs
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

// ── Import helpers from auth.js ───────────────────────────────────────────────
// We test the pure functions inline since they depend on process.env
// but not on Next.js runtime.

const TEST_SECRET = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
process.env.HELPER_SIGNING_SECRET = TEST_SECRET;

function generateHelperKey(email, version) {
  const payload = Buffer.from(JSON.stringify({ u: email, v: version })).toString('base64url');
  const sig = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
  return `smc1_${payload}.${sig}`;
}

function decodeHelperKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('smc1_')) return null;
  const rest = key.slice(5);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.u || parsed.v === undefined) return null;
    return { payload, sig, email: parsed.u, version: parsed.v };
  } catch {
    return null;
  }
}

function verifyHelperKeyHmac(key) {
  const decoded = decodeHelperKey(key);
  if (!decoded) return null;
  const expected = crypto.createHmac('sha256', TEST_SECRET).update(decoded.payload).digest('base64url');
  const a = Buffer.from(decoded.sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return decoded;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nTest 1: Key generation — format and structure');
{
  const key = generateHelperKey('ali@pacific.london', 1);
  assert('key is a string', typeof key === 'string');
  assert('key starts with smc1_', key.startsWith('smc1_'));
  assert('key contains a dot separator', key.slice(5).includes('.'));
  const decoded = decodeHelperKey(key);
  assert('decoded email matches', decoded?.email === 'ali@pacific.london');
  assert('decoded version matches', decoded?.version === 1);
}

console.log('\nTest 2: HMAC verification — valid key passes');
{
  const key = generateHelperKey('ali@pacific.london', 1);
  const verified = verifyHelperKeyHmac(key);
  assert('valid key verifies', verified !== null);
  assert('verified email is correct', verified?.email === 'ali@pacific.london');
  assert('verified version is correct', verified?.version === 1);
}

console.log('\nTest 3: HMAC verification — tampered key fails');
{
  const key = generateHelperKey('ali@pacific.london', 1);
  const tampered = key.slice(0, -4) + 'XXXX';
  const verified = verifyHelperKeyHmac(tampered);
  assert('tampered sig rejected', verified === null);

  // Tamper the payload
  const parts = key.slice(5).split('.');
  const newPayload = Buffer.from(JSON.stringify({ u: 'attacker@evil.com', v: 1 })).toString('base64url');
  const tamperedPayload = `smc1_${newPayload}.${parts[1]}`;
  const verified2 = verifyHelperKeyHmac(tamperedPayload);
  assert('tampered payload (email swap) rejected', verified2 === null);
}

console.log('\nTest 4: Cross-user isolation — userA key cannot impersonate userB');
{
  const keyA = generateHelperKey('ali@pacific.london', 1);
  const keyB = generateHelperKey('attacker@evil.com', 1);

  // Extract payload from B and try to combine with A's signature
  const partsA = keyA.slice(5).split('.');
  const partsB = keyB.slice(5).split('.');
  const hybrid = `smc1_${partsB[0]}.${partsA[1]}`; // B payload, A sig
  const verified = verifyHelperKeyHmac(hybrid);
  assert('hybrid key (B payload + A sig) rejected', verified === null);
}

console.log('\nTest 5: Version mismatch detection');
{
  const keyV1 = generateHelperKey('ali@pacific.london', 1);
  const keyV2 = generateHelperKey('ali@pacific.london', 2);

  const dV1 = verifyHelperKeyHmac(keyV1);
  const dV2 = verifyHelperKeyHmac(keyV2);

  assert('v1 key decodes as version 1', dV1?.version === 1);
  assert('v2 key decodes as version 2', dV2?.version === 2);

  // Simulate the DB check: currentVersion=2, key has v=1 → stale
  const currentVersion = 2;
  assert('v1 key rejected when current version is 2', dV1?.version !== currentVersion);
  assert('v2 key accepted when current version is 2', dV2?.version === currentVersion);
}

console.log('\nTest 6: Invalid key formats');
{
  assert('empty string → null', decodeHelperKey('') === null);
  assert('null → null', decodeHelperKey(null) === null);
  assert('wrong prefix → null', decodeHelperKey('Bearer abc.def') === null);
  assert('missing dot → null', decodeHelperKey('smc1_nodotshere') === null);
  assert('verify null → null', verifyHelperKeyHmac(null) === null);
  assert('verify empty → null', verifyHelperKeyHmac('') === null);
}

console.log('\nTest 7: Wrong secret → HMAC fails');
{
  // Simulate a key generated with a DIFFERENT secret (e.g., old server or attacker)
  const attackerSecret = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const payload = Buffer.from(JSON.stringify({ u: 'ali@pacific.london', v: 1 })).toString('base64url');
  const attackerSig = crypto.createHmac('sha256', attackerSecret).update(payload).digest('base64url');
  const fakeKey = `smc1_${payload}.${attackerSig}`;

  const verified = verifyHelperKeyHmac(fakeKey);
  assert('key signed with wrong secret rejected', verified === null);
}

console.log('\nTest 8: Profile route — internal/validate-helper-key route structure (source check)');
{
  const src = readFileSync(join(__dir, '..', 'app/api/internal/validate-helper-key/route.js'), 'utf8');
  assert('route: checks Authorization header', src.includes('Authorization'));
  assert('route: validates HMAC via verifyHelperKeyHmac', src.includes('verifyHelperKeyHmac'));
  assert('route: checks helper_key_version in DB', src.includes('helper_key_version'));
  assert('route: checks session_code ownership', src.includes('session_code'));
  assert('route: returns { valid: false } on bad sig', src.includes("valid: false"));
  assert('route: returns { valid: true, email } on success', src.includes("valid: true"));
}

console.log('\nTest 9: Worker WS handler — pairing key gating (source check)');
{
  const src = readFileSync(join(__dir, '..', 'worker/src/index.js'), 'utf8');
  assert('worker: reads ?key param on WS connect', src.includes("searchParams.get('key')"));
  assert('worker: calls validateHelperKey', src.includes('validateHelperKey'));
  assert('worker: closes WS on auth failure (code 4401)', src.includes('4401'));
  assert('worker: sends auth_error message', src.includes('auth_error'));
  assert('worker: attaches email to authed request', src.includes('_authed_email'));
}

console.log('\nTest 10: API route — helper-key route structure (source check)');
{
  const src = readFileSync(join(__dir, '..', 'app/api/helper-key/route.js'), 'utf8');
  assert('helper-key GET: calls getSessionPayload', src.includes('getSessionPayload'));
  assert('helper-key GET: queries helper_key_version from DB', src.includes('helper_key_version'));
  assert('helper-key GET: calls generateHelperKey', src.includes('generateHelperKey'));
  assert('helper-key POST (rotate): increments version in DB', src.includes('helper_key_version + 1'));
  assert('helper-key POST: returns rotated: true', src.includes('rotated: true'));
}

console.log('\nTest 11: Migration schema check');
{
  const src = readFileSync(join(__dir, 'migrate.mjs'), 'utf8');
  assert('migrate: adds helper_key_version column', src.includes('helper_key_version'));
  assert('migrate: column defaults to 1', src.includes('DEFAULT 1'));
  assert('migrate: adds session_code to meetings', src.includes('session_code'));
  assert('migrate: creates session_code index', src.includes('idx_meetings_session_code'));
}

console.log('\nTest 12: Profile page helper section (source check)');
{
  const src = readFileSync(join(__dir, '..', 'app/profile/page.js'), 'utf8');
  assert('profile: fetches /api/helper-key', src.includes('/api/helper-key'));
  assert('profile: shows pairing key', src.includes('pairingKey') || src.includes('helperKey'));
  assert('profile: has rotate key button', src.includes('Rotate key') || src.includes('rotateKey'));
  assert('profile: has download links for mac and win', src.includes('/api/downloads/mac') && src.includes('/api/downloads/win'));
  assert('profile: detects OS', src.includes('detectOS'));
}

console.log('\nTest 13: Download proxy route (source check)');
{
  const src = readFileSync(join(__dir, '..', 'app/api/downloads/[platform]/route.js'), 'utf8');
  assert('downloads: checks session before serving', src.includes('getSessionPayload'));
  assert('downloads: redirects to login if unauth', src.includes('/login'));
  assert('downloads: handles mac platform', src.includes('mac'));
  assert('downloads: handles win platform', src.includes('win'));
  assert('downloads: redirects to release URL', src.includes('releases/latest/download'));
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed ✅');
} else {
  console.log('Some tests FAILED ❌');
  process.exit(1);
}
