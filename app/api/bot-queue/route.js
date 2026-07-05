import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

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

// GET /api/bot-queue
// Bot-facing: claim the next queued request atomically. Returns 200 with the
// request or 204 if queue is empty. Claim semantics: claimed_at is set on the
// returned row so a second immediate poll will not return the same request.
export async function GET(request) {
  if (!checkBotAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getSql();

  // Atomically claim one queued, unclaimed request using a CTE UPDATE … RETURNING.
  const rows = await sql`
    WITH claimed AS (
      UPDATE bot_requests
      SET claimed_at = now(), updated_at = now()
      WHERE id = (
        SELECT id FROM bot_requests
        WHERE status = 'queued' AND claimed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    )
    SELECT * FROM claimed
  `;

  if (rows.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const row = rows[0];
  // Never expose passcodes in logs — return them in the response body only
  return NextResponse.json({
    id: row.id,
    meeting_number: row.meeting_number.toString(),
    passcode: row.passcode || '',
    bot_name: row.bot_name,
    leave_requested: row.leave_requested,
    status: row.status,
  });
}
