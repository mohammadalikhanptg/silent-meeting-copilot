import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sql = getSql();

  // All registered users with their most recent non-revoked invite
  const users = await sql`
    SELECT
      u.email,
      u.role,
      u.totp_verified_at,
      u.last_login_at,
      u.created_at,
      i.id          AS invite_id,
      i.status      AS invite_status,
      i.invited_by,
      i.created_at  AS invited_at
    FROM auth_users u
    LEFT JOIN LATERAL (
      SELECT id, status, invited_by, created_at
      FROM invites
      WHERE email = u.email
      ORDER BY created_at DESC
      LIMIT 1
    ) i ON true
    ORDER BY u.created_at DESC
  `;

  // Pending invites where the user has not yet accepted (not yet in auth_users)
  const pending = await sql`
    SELECT id, email, status, invited_by, created_at AS invited_at
    FROM invites
    WHERE email NOT IN (SELECT email FROM auth_users)
      AND status = 'pending'
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ users, pending });
}
