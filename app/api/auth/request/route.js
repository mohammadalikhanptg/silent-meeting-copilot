import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db';
import { isAllowedFull, randomToken, sha256 } from '../../../lib/auth';
import { sendMagicLink } from '../../../lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LINK_WINDOW_MIN = 15;
const LINK_MAX = 5;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const email = (body.email || '').trim().toLowerCase();
  const generic = NextResponse.json({ ok: true });
  if (!email) return generic;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent') || null;
  const sql = getSql();

  if (!await isAllowedFull(email, sql)) return generic;

  // Rate limit: per-email (existing) and per-IP (new)
  const [byEmail, byIp] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM magic_links WHERE email = ${email} AND created_at > now() - interval '15 minutes'`,
    ip
      ? sql`SELECT count(*)::int AS n FROM auth_attempts WHERE type = 'link_ip' AND key = ${ip} AND created_at > now() - interval '15 minutes'`
      : Promise.resolve([{ n: 0 }]),
  ]);
  if ((byEmail[0]?.n || 0) >= LINK_MAX) return generic;
  if ((byIp[0]?.n || 0) >= LINK_MAX) return generic;

  // Record IP attempt
  if (ip) {
    await sql`INSERT INTO auth_attempts (type, key, success, ip) VALUES ('link_ip', ${ip}, false, ${ip})`;
  }

  const token = randomToken(32);
  const tokenHash = sha256(token);
  await sql`INSERT INTO magic_links (email, token_hash, expires_at, ip, user_agent) VALUES (${email}, ${tokenHash}, now() + interval '15 minutes', ${ip}, ${ua})`;

  const base = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`;
  const link = `${base}/api/auth/verify?token=${token}`;
  try { await sendMagicLink(email, link); } catch (e) { console.error('magic link email failed:', e.message); }
  return generic;
}
