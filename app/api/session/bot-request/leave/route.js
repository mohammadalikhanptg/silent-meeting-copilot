import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// POST /api/session/bot-request/leave
// Cookie-authenticated. Sets leave_requested=true on the caller's active bot request.
// Body: { id: string }  — the bot_request id
export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sql = getSql();
  const [row] = await sql`
    UPDATE bot_requests
    SET leave_requested = true, updated_at = now()
    WHERE id = ${id} AND user_email = ${session.email}
    RETURNING id, status, leave_requested
  `;

  if (!row) return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 });

  return NextResponse.json({ id: row.id, status: row.status, leave_requested: row.leave_requested });
}
