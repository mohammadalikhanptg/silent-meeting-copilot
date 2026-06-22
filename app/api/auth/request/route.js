import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db';
import { isAllowed, randomToken, sha256 } from '../../../lib/auth';
import { sendMagicLink } from '../../../lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const email = (body.email || '').trim().toLowerCase();
  const generic = NextResponse.json({ ok: true });
  if (!email || !isAllowed(email)) return generic;

  const sql = getSql();
  const recent = await sql`SELECT count(*)::int AS n FROM magic_links WHERE email = ${email} AND created_at > now() - interval '10 minutes'`;
  if ((recent[0]?.n || 0) >= 5) return generic;

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent') || null;
  await sql`INSERT INTO magic_links (email, token_hash, expires_at, ip, user_agent) VALUES (${email}, ${tokenHash}, now() + interval '15 minutes', ${ip}, ${ua})`;

  const base = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`;
  const link = `${base}/api/auth/verify?token=${token}`;
  try { await sendMagicLink(email, link); } catch (e) { console.error('magic link email failed:', e.message); }
  return generic;
}
