import { NextResponse } from 'next/server';
import { getSessionPayload, randomToken, isAllowed } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const email = (body.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Env-allowlist users don't need invites
  if (isAllowed(email)) {
    return NextResponse.json({ error: 'That email is already in the env allowlist' }, { status: 409 });
  }

  const sql = getSql();

  // Block if user already has an active (pending or accepted) invite
  const existing = await sql`
    SELECT id, status FROM invites WHERE email = ${email} AND status != 'revoked' LIMIT 1
  `;
  if (existing[0]) {
    return NextResponse.json({
      error: `${email} already has an ${existing[0].status} invite. Revoke it first to re-invite.`,
    }, { status: 409 });
  }

  const token = randomToken(32);
  const result = await sql`
    INSERT INTO invites (email, token, invited_by)
    VALUES (${email}, ${token}, ${session.email})
    RETURNING id
  `;

  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
  const inviteUrl = `${base}/api/auth/accept-invite?token=${token}`;

  return NextResponse.json({ ok: true, id: result[0].id, email, inviteUrl }, { status: 201 });
}
