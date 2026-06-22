import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSql } from '../../../lib/db';
import { getPrePayload, generateTotpSecret, otpauthUri, verifyTotp, sessionCookieValue, cookieOptions, SESSION_COOKIE, SESSION_MAXAGE, PRE_COOKIE } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const code = (body.code || '').toString();

  const sql = getSql();
  const rows = await sql`SELECT totp_secret FROM auth_users WHERE email = ${pre.email} LIMIT 1`;
  const secret = rows[0]?.totp_secret;
  if (!secret) return NextResponse.json({ error: 'no_secret' }, { status: 400 });
  if (!verifyTotp(secret, code)) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  await sql`UPDATE auth_users SET totp_verified_at = COALESCE(totp_verified_at, now()), last_login_at = now() WHERE email = ${pre.email}`;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent') || null;
  const s = await sql`INSERT INTO sessions (email, expires_at, ip, user_agent) VALUES (${pre.email}, now() + interval '7 days', ${ip}, ${ua}) RETURNING id`;
  const sid = s[0].id;

  const res = NextResponse.json({ ok: true, redirect: '/' });
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(pre.email, sid), cookieOptions(SESSION_MAXAGE));
  res.cookies.set(PRE_COOKIE, '', cookieOptions(0));
  return res;
}
