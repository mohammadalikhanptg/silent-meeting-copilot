import crypto from 'node:crypto';
import { cookies } from 'next/headers';

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
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge };
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s) {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

export function verifyTotp(secretB32, token, window = 1) {
  if (!secretB32 || !token) return false;
  const t = String(token).replace(/\s/g, '');
  if (!/^[0-9]{6}$/.test(t)) return false;
  const secretBuf = base32Decode(secretB32);
  const step = 30;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const candidate = hotp(secretBuf, counter + w);
    const a = Buffer.from(candidate);
    const b = Buffer.from(t);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function otpauthUri(email, secretB32) {
  const issuer = 'Silent Meeting Copilot';
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function getSessionPayload() {
  const c = await cookies();
  const p = verifyToken(c.get(SESSION_COOKIE)?.value);
  if (!p || p.t !== 'session') return null;
  return p;
}

export async function getPrePayload() {
  const c = await cookies();
  const p = verifyToken(c.get(PRE_COOKIE)?.value);
  if (!p || p.t !== 'pre') return null;
  return p;
}
