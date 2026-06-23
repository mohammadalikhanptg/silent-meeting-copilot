import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSql } from '../../../lib/db';
import {
  getPrePayload, generateTotpSecret, otpauthUri, verifyTotp,
  sessionCookieValue, cookieOptions, SESSION_COOKIE, SESSION_MAXAGE, PRE_COOKIE,
  isAllowed,
} from '../../../lib/auth';

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
  let secret = rows[0]?.totp_secret;
  if (!secret) {
    secret = generateTotpSecret();
    await sql`UPDATE auth_users SET totp_secret = ${secret} WHERE email = ${pre.email}`;
  }
  const uri = otpauthUri(pre.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return NextResponse.json({ stage: 'enroll', secret, qr });
}

export async function POST(req) {
  const pre = await getPrePayload();
  if (!pre) return NextResponse.json({ error: 'no_pre' }, { status: 401 });

  // Re-check allowlist at session creation — covers email removed after link was sent
  if (!isAllowed(pre.email)) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const code = (body.code || '').toString();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  const sql = getSql();

  // Lockout check: count recent failures per user within the window
  const windowStart = new Date(Date.now() - TOTP_LOCKOUT_MS);
  const lockoutKey = pre.email;
  const failures = await sql`
    SELECT count(*)::int AS n FROM auth_attempts
    WHERE type = 'totp' AND key = ${lockoutKey} AND success = false
      AND created_at > ${windowStart}
  `.catch(() => [{ n: 0 }]);

  const failCount = failures[0]?.n || 0;
  if (failCount >= TOTP_FAIL_MAX) {
    return NextResponse.json({ error: 'locked', message: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const rows = await sql`SELECT totp_secret FROM auth_users WHERE email = ${pre.email} LIMIT 1`;
  const secret = rows[0]?.totp_secret;
  if (!secret) return NextResponse.json({ error: 'no_secret' }, { status: 400 });

  if (!verifyTotp(secret, code)) {
    await sql`INSERT INTO auth_attempts (type, key, success, ip) VALUES ('totp', ${lockoutKey}, false, ${ip})`.catch(() => {});
    const nowFails = failCount + 1;
    const remaining = TOTP_FAIL_MAX - nowFails;
    return NextResponse.json(
      remaining > 0
        ? { error: 'bad_code', attemptsLeft: remaining }
        : { error: 'locked', message: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 400 }
    );
  }

  // Success
  await sql`INSERT INTO auth_attempts (type, key, success, ip) VALUES ('totp', ${lockoutKey}, true, ${ip})`.catch(() => {});
  await sql`UPDATE auth_users SET totp_verified_at = COALESCE(totp_verified_at, now()), last_login_at = now() WHERE email = ${pre.email}`;

  const ua = req.headers.get('user-agent') || null;
  const s = await sql`INSERT INTO sessions (email, expires_at, ip, user_agent) VALUES (${pre.email}, now() + interval '7 days', ${ip}, ${ua}) RETURNING id`;
  const sid = s[0].id;

  const res = NextResponse.json({ ok: true, redirect: '/' });
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(pre.email, sid), cookieOptions(SESSION_MAXAGE));
  res.cookies.set(PRE_COOKIE, '', cookieOptions(0));
  return res;
}
