import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db';
import { sha256, preCookieValue, cookieOptions, PRE_COOKIE, PRE_MAXAGE } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const token = (body.token || '').toString();
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const sql = getSql();
  const hash = sha256(token);
  const rows = await sql`SELECT id, email, expires_at, consumed_at FROM magic_links WHERE token_hash = ${hash} LIMIT 1`;
  const row = rows[0];
  if (!row || row.consumed_at || new Date(row.expires_at) < new Date()) return NextResponse.json({ ok: false }, { status: 400 });

  const upd = await sql`UPDATE magic_links SET consumed_at = now() WHERE id = ${row.id} AND consumed_at IS NULL RETURNING id`;
  if (!upd[0]) return NextResponse.json({ ok: false }, { status: 400 });

  const us = await sql`INSERT INTO auth_users (email) VALUES (${row.email}) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING totp_verified_at`;
  const enrolled = !!us[0]?.totp_verified_at;
  const stage = enrolled ? 'verify' : 'enroll';

  const res = NextResponse.json({ ok: true, redirect: '/totp' });
  res.cookies.set(PRE_COOKIE, preCookieValue(row.email, stage), cookieOptions(PRE_MAXAGE));
  return res;
}

export async function GET(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const base = process.env.NEXT_PUBLIC_BASE_URL || `${url.protocol}//${url.host}`;
  return NextResponse.redirect(`${base}/verify?token=${encodeURIComponent(token)}`);
}
