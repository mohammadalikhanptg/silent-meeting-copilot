import { NextResponse } from 'next/server';
import { getSql } from '../../../lib/db';
import { getSessionPayload, cookieOptions, SESSION_COOKIE } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const p = await getSessionPayload();
  if (p?.sid) {
    try { const sql = getSql(); await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${p.sid}`; } catch (e) { console.error('logout revoke failed:', e.message); }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
}
