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

// ── Helper pairing key ────────────────────────────────────────────────────────

function helperSigningSecret() {
  const s = process.env.HELPER_SIGNING_SECRET;
  if (!s) throw new Error('HELPER_SIGNING_SECRET not configured');
  return s;
}

export function generateHelperKey(email, version) {
  const payload = Buffer.from(JSON.stringify({ u: email, v: version })).toString('base64url');
  const sig = crypto.createHmac('sha256', helperSigningSecret()).update(payload).digest('base64url');
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
    return { payload, sig, email: parsed.u, version: parsed.v };
  } catch {
    return null;
  }
}

export function verifyHelperKeyHmac(key) {
  const decoded = decodeHelperKey(key);
  if (!decoded) return null;
  const expected = crypto.createHmac('sha256', helperSigningSecret()).update(decoded.payload).digest('base64url');
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
