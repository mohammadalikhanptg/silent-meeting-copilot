import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db';
import { preCookieValue, cookieOptions, PRE_COOKIE, PRE_MAXAGE } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();
  const base = process.env.NEXT_PUBLIC_BASE_URL || `${url.protocol}//${url.host}`;

  if (!token) return NextResponse.redirect(`${base}/login?error=invalid_invite`);

  const sql = getSql();
  const rows = await sql`SELECT id, email, status FROM invites WHERE token = ${token} LIMIT 1`;
  const invite = rows[0];

  if (!invite) return NextResponse.redirect(`${base}/login?error=invalid_invite`);
  if (invite.status === 'revoked') return NextResponse.redirect(`${base}/login?error=invite_revoked`);

  // Create auth_users row if not exists (upsert — does nothing if already registered)
  await sql`INSERT INTO auth_users (email) VALUES (${invite.email}) ON CONFLICT (email) DO NOTHING`;

  // Mark invite accepted (idempotent — re-visiting the link is allowed for re-enrollment)
  if (invite.status === 'pending') {
    await sql`UPDATE invites SET status = 'accepted', accepted_at = now() WHERE id = ${invite.id}`;
  }

  const users = await sql`SELECT totp_verified_at FROM auth_users WHERE email = ${invite.email} LIMIT 1`;
  const stage = users[0]?.totp_verified_at ? 'verify' : 'enroll';

  const res = NextResponse.redirect(`${base}/totp`);
  res.cookies.set(PRE_COOKIE, preCookieValue(invite.email, stage), cookieOptions(PRE_MAXAGE));
  return res;
}
