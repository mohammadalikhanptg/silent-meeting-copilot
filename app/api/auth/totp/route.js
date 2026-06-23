import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSql } from '../../../lib/db';
import {
  getPrePayload, generateTotpSecret, otpauthUri, verifyTotp,
  encryptTotpSecret, decryptTotpSecret, isTotpEncrypted,
  sessionCookieValue, cookieOptions, SESSION_COOKIE, SESSION_MAXAGE, PRE_COOKIE,
  isAllowed,
} from '../../../lib/auth';
import { alertNewDevice, alertTotpLockout } from '../../../lib/auth-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOTP_FAIL_MAX = 5;
const TOTP_LOCKOUT_MS = 15 * 60 * 1000;

export async function GET() {
  const pre = await getPrePayload();
  if (!pre) return NextResponse.json({ error: 'no_pre' }, { status: 401 });
  const sql = getSql();
  const rows = await sql`SELECT totp_secret, totp_verified_at FROM auth_users WHERE email = ${pre.email} LIMIT 1`;
  if (rows[0]?.totp_verified_at) return NextResponse.json({ stage: 'verify' });

  let storedSecret = rows[0]?.totp_secret;
  if (!storedSecret) {
    // Generate new secret and store encrypted
    const plain = generateTotpSecret();
    storedSecret = encryptTotpSecret(plain);
    await sql`UPDATE auth_users SET totp_secret = ${storedSecret} WHERE email = ${pre.email}`;
  }

  // Always return plaintext to the enrollment page (client needs to display it)
  const plainSecret = isTotpEncrypted(storedSecret) ? decryptTotpSecret(storedSecret) : storedSecret;
  const uri = otpauthUri(pre.email, plainSecret);
  const qr = await QRCode.toDataURL(uri);
  return NextResponse.json({ stage: 'enroll', secret: plainSecret, qr });
}

export async function POST(req) {
  const pre = await getPrePayload();
  if (!pre) return NextResponse.json({ error: 'no_pre' }, { status: 401 });

  // Re-check allowlist at session creation
  if (!isAllowed(pre.email)) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const code = (body.code || '').toString();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  const sql = getSql();

  // Lockout: count recent failures within window
  const windowStart = new Date(Date.now() - TOTP_LOCKOUT_MS);
  const lockoutKey = pre.email;
  const failures = await sql`
    SELECT count(*)::int AS n FROM auth_attempts
    WHERE type = 'totp' AND key = ${lockoutKey} AND success = false
      AND created_at > ${windowStart}
  `.catch(() => [{ n: 0 }]);

  const failCount = failures[0]?.n || 0;
  if (failCount >= TOTP_FAIL_MAX) {
    alertTotpLockout(pre.email, ip).catch(() => {});
    return NextResponse.json({ error: 'locked', message: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const rows = await sql`SELECT totp_secret FROM auth_users WHERE email = ${pre.email} LIMIT 1`;
  const storedSecret = rows[0]?.totp_secret;
  if (!storedSecret) return NextResponse.json({ error: 'no_secret' }, { status: 400 });

  // verifyTotp handles encrypted secrets internally
  if (!verifyTotp(storedSecret, code)) {
    await sql`INSERT INTO auth_attempts (type, key, success, ip) VALUES ('totp', ${lockoutKey}, false, ${ip})`.catch(() => {});
    const nowFails = failCount + 1;
    const remaining = TOTP_FAIL_MAX - nowFails;
    if (remaining <= 0) alertTotpLockout(pre.email, ip).catch(() => {});
    return NextResponse.json(
      remaining > 0
        ? { error: 'bad_code', attemptsLeft: remaining }
        : { error: 'locked', message: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 400 }
    );
  }

  // Success — record attempt
  await sql`INSERT INTO auth_attempts (type, key, success, ip) VALUES ('totp', ${lockoutKey}, true, ${ip})`.catch(() => {});
  await sql`UPDATE auth_users SET totp_verified_at = COALESCE(totp_verified_at, now()), last_login_at = now() WHERE email = ${pre.email}`;

  const ua = req.headers.get('user-agent') || null;

  // New-device detection: any prior session with same IP+UA combo?
  const known = await sql`
    SELECT id FROM sessions
    WHERE email = ${pre.email} AND revoked_at IS NULL
      AND ip = ${ip} AND user_agent = ${ua}
    LIMIT 1
  `.catch(() => []);
  if (!known[0]) {
    alertNewDevice(pre.email, ip, ua).catch(() => {});
  }

  const s = await sql`INSERT INTO sessions (email, expires_at, ip, user_agent) VALUES (${pre.email}, now() + interval '7 days', ${ip}, ${ua}) RETURNING id`;
  const sid = s[0].id;

  const res = NextResponse.json({ ok: true, redirect: '/' });
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(pre.email, sid), cookieOptions(SESSION_MAXAGE));
  res.cookies.set(PRE_COOKIE, '', cookieOptions(0));
  return res;
}
