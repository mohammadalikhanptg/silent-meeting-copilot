import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// Valid forward transitions. Terminal states (failed, left, passcode_required) have no outgoing edges.
const TRANSITIONS = {
  queued: ['joining', 'failed', 'left', 'passcode_required'],
  joining: ['waiting_room', 'in_meeting', 'passcode_required', 'failed', 'left'],
  waiting_room: ['in_meeting', 'failed', 'left', 'passcode_required'],
  in_meeting: ['left', 'failed'],
  passcode_required: ['left', 'failed'],
  failed: [],
  left: [],
};

function checkBotAuth(request) {
  const authHeader = request.headers.get('authorization') || '';
  const secret = process.env.BOT_QUEUE_SECRET || '';
  if (!secret || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  try {
    const a = Buffer.from(provided.padEnd(secret.length, '\0'));
    const b = Buffer.from(secret.padEnd(provided.length, '\0'));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b) && provided === secret;
  } catch {
    return false;
  }
}

// GET /api/bot-queue/[id]/status
// Bot-facing: returns the current status and leave_requested flag for a claimed request.
export async function GET(request, { params }) {
  if (!checkBotAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const sql = getSql();
  const [row] = await sql`SELECT id, status, leave_requested FROM bot_requests WHERE id = ${id}`;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ id: row.id, status: row.status, leave_requested: row.leave_requested });
}

// POST /api/bot-queue/[id]/status
// Body: { status: string }
// Bot-facing: update status with transition validation.
export async function POST(request, { params }) {
  if (!checkBotAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status: newStatus } = body;

  const validStatuses = Object.keys(TRANSITIONS);
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: `Invalid status: ${newStatus}` }, { status: 400 });
  }

  const sql = getSql();
  const [current] = await sql`
    SELECT id, status, leave_requested FROM bot_requests WHERE id = ${id}
  `;

  if (!current) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const allowed = TRANSITIONS[current.status] || [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json({
      error: `Illegal transition: ${current.status} → ${newStatus}`,
    }, { status: 422 });
  }

  const [updated] = await sql`
    UPDATE bot_requests
    SET status = ${newStatus}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, status, leave_requested
  `;

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    leave_requested: updated.leave_requested,
  });
}
