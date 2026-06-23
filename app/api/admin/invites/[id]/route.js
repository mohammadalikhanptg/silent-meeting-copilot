import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/admin/invites/[id] — revoke a user's invite + kill their sessions
export async function DELETE(req, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const sql = getSql();

  const rows = await sql`SELECT id, email, status FROM invites WHERE id = ${id} LIMIT 1`;
  const invite = rows[0];
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Already revoked' }, { status: 409 });

  await sql`UPDATE invites SET status = 'revoked' WHERE id = ${id}`;
  // Revoke all active sessions for that user
  const revoked = await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE email = ${invite.email} AND revoked_at IS NULL
    RETURNING id
  `;

  return NextResponse.json({ ok: true, email: invite.email, sessionsRevoked: revoked.length });
}
