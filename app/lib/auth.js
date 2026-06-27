import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getSql } from './db';
import { verifySync, generateSync, generateSecret as otplibGenerateSecret } from 'otplib';

export const SESSION_COOKIE = 'smc_session';
export const PRE_COOKIE = 'smc_pre';
export const SESSION_MAXAGE = 7 * 24 * 60 * 60;
export const PRE_MAXAGE = 10 * 60;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET not configured');
  return s;
}

export function allowlist() {
  return (process.env.AUTH_ALLOWLIST || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email) {
  if (!email) return false;
  return allowlist().includes(email.trim().toLowerCase());
}

export async function isAllowedFull(email, sql) {
  if (!email) return false;
  if (isAllowed(email)) return true;
  // Check accepted invite
  const rows = await sql`
    SELECT id FROM invites WHERE email = ${email.trim().toLowerCase()} AND status = 'accepted' LIMIT 1
  `;
  return rows.length > 0;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmac(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function sessionCookieValue(email, sid) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAXAGE;
  return signToken({ email, sid, exp, t: 'session' });
}

export function preCookieValue(email, stage) {
  const exp = Math.floor(Date.now() / 1000) + PRE_MAXAGE;
  return signToken({ email, stage, exp, t: 'pre' });
}

export function cookieOptions(maxAge) {
  return { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge };
}

// ── TOTP encryption ──────────────────────────────────────────────────────────

function totpEncKey() {
  const k = process.env.TOTP_ENC_KEY;
  if (!k) throw new Error('TOTP_ENC_KEY not configured');
  return Buffer.from(k, 'hex');
}

export function isTotpEncrypted(s) {
  return typeof s === 'string' && s.startsWith('v1:');
}

export function encryptTotpSecret(plain) {
  const key = totpEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptTotpSecret(encrypted) {
  if (!encrypted) return null;
  if (!isTotpEncrypted(encrypted)) return encrypted; // plaintext pass-through (pre-migration)
  const parts = encrypted.split(':');
  if (parts.length !== 4) return null;
  const [, ivHex, ctHex, tagHex] = parts;
  try {
    const key = totpEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

// ── TOTP (otplib) ────────────────────────────────────────────────────────────

export function generateTotpSecret() {
  return otplibGenerateSecret();
}

export function verifyTotp(rawSecret, token, window = 1) {
  if (!rawSecret || !token) return false;
  const t = String(token).replace(/\s/g, '');
  if (!/^[0-9]{6}$/.test(t)) return false;
  const plain = isTotpEncrypted(rawSecret) ? decryptTotpSecret(rawSecret) : rawSecret;
  if (!plain) return false;
  const result = verifySync({ secret: plain, token: t, epochTolerance: window });
  return result?.valid === true;
}

export function generateTotpCode(rawSecret) {
  const plain = isTotpEncrypted(rawSecret) ? decryptTotpSecret(rawSecret) : rawSecret;
  return generateSync({ secret: plain });
}

export function otpauthUri(email, secretB32) {
  const issuer = 'Silent Meeting Copilot';
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Session helpers ───────────────────────────────────────────────────────────

export async function getSessionPayload() {
  const c = await cookies();
  const p = verifyToken(c.get(SESSION_COOKIE)?.value);
  if (!p || p.t !== 'session') return null;
  if (!p.sid) return null; // all sessions have sid; missing = legacy invalid token

  let role = 'user';
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT s.id, s.revoked_at, s.expires_at, COALESCE(u.role, 'user') AS role
      FROM sessions s
      LEFT JOIN auth_users u ON u.email = s.email
      WHERE s.id = ${p.sid} LIMIT 1
    `;
    if (!rows[0]) return null;
    const row = rows[0];
    if (row.revoked_at) {
      // Alert on revoked session use — fire-and-forget, never block
      const h = await headers().catch(() => null);
      const ip = h?.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      import('./auth-alerts.js').then(({ alertRevokedSession }) => alertRevokedSession(p.email, p.sid, ip).catch(() => {})).catch(() => {});
      return null;
    }
    if (new Date(row.expires_at) < new Date()) return null;
    role = row.role || 'user';
    sql`UPDATE sessions SET last_seen = now() WHERE id = ${p.sid}`.catch(() => {});
  } catch (e) {
    console.error('[auth] session DB check failed:', e.message);
    return null;
  }

  return { ...p, role };
}

export async function getPrePayload() {
  const c = await cookies();
  const p = verifyToken(c.get(PRE_COOKIE)?.value);
  if (!p || p.t !== 'pre') return null;
  return p;
}

// ── Token/key signing keyring (kid-based, rotatable) ──────────────────────────
// Signed tokens (engine session tokens) and helper pairing keys carry a key id
// (kid) so signing keys can be rotated without a flag day: sign new material with
// the active key, keep verifying old material with retired keys until all old
// tokens/keys have aged out (engine tokens: ~15 min; helper keys: until the next
// version bump), then drop the retired key.
//
// Configuration (explicit only — there is no implicit/default secret):
//   TOKEN_SIGNING_KEYS        "kid1:secret1,kid2:secret2"  (comma-separated pairs)
//   TOKEN_SIGNING_ACTIVE_KID  the kid to sign new material with
// Bootstrap fallback (until ops sets the above): the existing HELPER_SIGNING_SECRET
// is used as a single key under kid "k1". This is still explicit configuration,
// not a hardcoded default, and lets the deployed system keep working pre-rotation.
function signingKeyring() {
  const raw = (process.env.TOKEN_SIGNING_KEYS || '').trim();
  const keys = {};
  if (raw) {
    for (const pair of raw.split(',')) {
      const idx = pair.indexOf(':');
      if (idx < 1) continue;
      const kid = pair.slice(0, idx).trim();
      const secret = pair.slice(idx + 1).trim();
      if (kid && secret) keys[kid] = secret;
    }
  }
  let activeKid = (process.env.TOKEN_SIGNING_ACTIVE_KID || '').trim();
  if (Object.keys(keys).length === 0) {
    // Bootstrap from the legacy signing secret.
    const legacy = process.env.HELPER_SIGNING_SECRET;
    if (!legacy) throw new Error('No signing keys configured (set TOKEN_SIGNING_KEYS or HELPER_SIGNING_SECRET)');
    keys.k1 = legacy;
    activeKid = 'k1';
  }
  if (!activeKid || !keys[activeKid]) {
    // Default the active key to the first configured kid if not named/invalid.
    activeKid = Object.keys(keys)[0];
  }
  return { keys, activeKid };
}

function signingSecretForKid(kid) {
  const { keys, activeKid } = signingKeyring();
  // No kid (legacy material minted before this change) → verify with the active
  // key, which during bootstrap is the same HELPER_SIGNING_SECRET old material used.
  const useKid = kid || activeKid;
  return keys[useKid] || null;
}

function hmacSign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function timingEq(aStr, bStr) {
  const a = Buffer.from(aStr);
  const b = Buffer.from(bStr);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// ── Helper pairing key ────────────────────────────────────────────────────────

// F2: deviceId (optional) binds the key to a single registered device so it can be
// revoked individually via the helper_devices list. Keys minted before F2 omit it
// (legacy migration bridge — see app/lib/helper-devices.js).
export function generateHelperKey(email, version, deviceId) {
  const { activeKid } = signingKeyring();
  const body = { u: email, v: version, kid: activeKid };
  if (deviceId) body.d = deviceId;
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = hmacSign(payload, signingSecretForKid(activeKid));
  return `smc1_${payload}.${sig}`;
}

export function decodeHelperKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('smc1_')) return null;
  const rest = key.slice(5); // remove 'smc1_'
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.u || parsed.v === undefined) return null;
    return { payload, sig, email: parsed.u, version: parsed.v, deviceId: parsed.d || null, kid: parsed.kid || null };
  } catch {
    return null;
  }
}

export function verifyHelperKeyHmac(key) {
  const decoded = decodeHelperKey(key);
  if (!decoded) return null;
  const secret = signingSecretForKid(decoded.kid);
  if (!secret) return null; // unknown kid → reject
  const expected = hmacSign(decoded.payload, secret);
  if (!timingEq(decoded.sig, expected)) return null;
  return decoded;
}

// ── Browser session token (engine WebSocket auth) ─────────────────────────────
// Short-lived, HMAC-signed token issued to a logged-in user so the browser can
// authenticate directly to the Cloudflare engine WS (which routes by email).
// Default TTL is short (15 min); the browser refreshes via POST /api/session/start.
// H4: the token is bound to the issuing app session (sid). Validation
// (validate-session-token) checks that session for revocation/expiry and records
// the jti as single-use for the WebSocket-upgrade path (replay protection).
export function generateSessionToken(email, sid, ttlSec = 15 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const { activeKid } = signingKeyring();
  const payload = Buffer.from(
    JSON.stringify({
      u: email,
      sid: sid || null,
      typ: 'engine-ws',
      aud: 'smc-engine',
      kid: activeKid,
      iat: now,
      exp: now + ttlSec,
      jti: crypto.randomBytes(12).toString('base64url'),
    })
  ).toString('base64url');
  const sig = hmacSign(payload, signingSecretForKid(activeKid));
  return `smcs1_${payload}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('smcs1_')) return null;
  const rest = token.slice(6);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const secret = signingSecretForKid(parsed.kid);
  if (!secret) return null; // unknown kid → reject
  const expected = hmacSign(payload, secret);
  if (!timingEq(sig, expected)) return null;
  if (!parsed.u || !parsed.exp) return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  if (parsed.typ && parsed.typ !== 'engine-ws') return null;
  if (parsed.aud && parsed.aud !== 'smc-engine') return null;
  return { email: parsed.u, sid: parsed.sid || null, exp: parsed.exp, jti: parsed.jti || null, aud: parsed.aud || null };
}

// ── Internal service auth (worker <-> app) ────────────────────────────────────
// The Cloudflare engine authenticates to the app /api/internal/* routes with a
// dedicated shared secret (INTERNAL_SHARED_SECRET), kept SEPARATE from the
// key/token signing secret so rotating the transport secret never invalidates
// issued pairing keys or browser tokens. (H3) The HELPER_SIGNING_SECRET
// internal-bearer fallback has been removed — only INTERNAL_SHARED_SECRET is
// accepted as the transport bearer, so the transport and signing secrets are no
// longer coupled.
// Returns 'ok' | 'misconfig' | 'unauthorized'.
export function checkInternalBearer(authHeader) {
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!secret) return 'misconfig';
  const provided = (authHeader || '').startsWith('Bearer ') ? authHeader.slice(7) : '';
  return timingEq(provided, secret) ? 'ok' : 'unauthorized';
}
