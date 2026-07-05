import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// POST /api/session/bot-request
// Cookie-authenticated. Creates a bot join request bound to the caller's active session.
// Body: { meetingNumber: string, passcode?: string, botName: string, sessionCode?: string, meetingId?: string }
export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { meetingNumber, passcode, botName, sessionCode, meetingId } = body;

  if (!meetingNumber || !/^\d{9,12}$/.test(String(meetingNumber))) {
    return NextResponse.json({ error: 'meetingNumber must be 9-12 digits' }, { status: 400 });
  }
  if (!botName || !botName.trim()) {
    return NextResponse.json({ error: 'botName is required' }, { status: 400 });
  }

  const sql = getSql();

  // Cancel any prior active bot request for this user/session (idempotent re-dispatch)
  if (sessionCode) {
    await sql`
      UPDATE bot_requests
      SET status = 'left', updated_at = now()
      WHERE user_email = ${session.email}
        AND session_code = ${sessionCode}
        AND status NOT IN ('left','failed','passcode_required')
    `;
  }

  const [row] = await sql`
    INSERT INTO bot_requests (user_email, meeting_id, session_code, meeting_number, passcode, bot_name)
    VALUES (
      ${session.email},
      ${meetingId || null},
      ${sessionCode || null},
      ${BigInt(String(meetingNumber))},
      ${passcode || null},
      ${botName.trim()}
    )
    RETURNING id, status, leave_requested, created_at
  `;

  return NextResponse.json({
    id: row.id,
    status: row.status,
    leave_requested: row.leave_requested,
  }, { status: 201 });
}

// GET /api/session/bot-request?session_code=...
// Cookie-authenticated. Returns the most recent bot request status for this session.
export async function GET(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionCode = searchParams.get('session_code');

  const sql = getSql();
  let rows;
  if (sessionCode) {
    rows = await sql`
      SELECT id, status, leave_requested, updated_at
      FROM bot_requests
      WHERE user_email = ${session.email} AND session_code = ${sessionCode}
      ORDER BY created_at DESC
      LIMIT 1
    `;
  } else {
    rows = await sql`
      SELECT id, status, leave_requested, updated_at
      FROM bot_requests
      WHERE user_email = ${session.email}
      ORDER BY created_at DESC
      LIMIT 1
    `;
  }

  if (rows.length === 0) return NextResponse.json({ botRequest: null });
  const r = rows[0];
  return NextResponse.json({ botRequest: { id: r.id, status: r.status, leave_requested: r.leave_requested } });
}
