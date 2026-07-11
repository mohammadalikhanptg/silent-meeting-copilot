import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';
import { hardDeleteSession } from '../../../lib/retention';
import { meteredSecondsFor, periodFor, ensureUsageSchema } from '../../../lib/entitlements';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const sql = getSql();

  // Verify ownership
  const [existing] = await sql`SELECT id, started_at, ended_at FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build update fields from body — support both lifecycle (ended_at) and prep (title/objective/context_notes)
  if (body.ended_at !== undefined) {
    await sql`UPDATE meetings SET ended_at = ${body.ended_at} WHERE id = ${id} AND user_email = ${session.email}`;
    // Phase 3 metering: record processed minutes once, on the first end only,
    // so repeated PATCHes cannot double-count. Metering must never break the
    // session-stop path, so any failure here is logged and swallowed.
    if (!existing.ended_at && existing.started_at) {
      try {
        await ensureUsageSchema(sql);
        const seconds = meteredSecondsFor(existing.started_at, body.ended_at);
        const period = periodFor(body.ended_at);
        await sql`UPDATE meetings SET metered_seconds = ${seconds} WHERE id = ${id} AND user_email = ${session.email}`;
        await sql`
          INSERT INTO account_usage (user_email, period, seconds_used, sessions, updated_at)
          VALUES (${session.email}, ${period}, ${seconds}, 1, now())
          ON CONFLICT (user_email, period)
          DO UPDATE SET seconds_used = account_usage.seconds_used + ${seconds},
                        sessions = account_usage.sessions + 1,
                        updated_at = now()`;
      } catch (err) {
        console.error('[metering] failed to record usage for meeting', id, err?.message);
      }
    }
  }
  if (body.title !== undefined) {
    await sql`UPDATE meetings SET title = ${body.title || null} WHERE id = ${id} AND user_email = ${session.email}`;
  }
  if (body.objective !== undefined) {
    await sql`UPDATE meetings SET objective = ${body.objective || null} WHERE id = ${id} AND user_email = ${session.email}`;
  }
  if (body.context_notes !== undefined) {
    await sql`UPDATE meetings SET context_notes = ${body.context_notes || null} WHERE id = ${id} AND user_email = ${session.email}`;
  }
  if (body.session_code !== undefined) {
    await sql`UPDATE meetings SET session_code = ${body.session_code || null} WHERE id = ${id} AND user_email = ${session.email}`;
  }
  if (body.mode_type !== undefined) {
    await sql`UPDATE meetings SET mode_type = ${body.mode_type || 'meeting'} WHERE id = ${id} AND user_email = ${session.email}`;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/meetings/[id] — operator-triggerable HARD delete of one session.
// Removes the meeting plus every child row (transcript segments, flagged
// coaching artifacts, reference docs) and returns proof that nothing remains.
// Ownership-scoped: a user can only hard-delete their own session; a cross-
// account id returns 404 and deletes nothing (IDOR-safe — see lib/retention).
export async function DELETE(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const result = await hardDeleteSession(sql, { meetingId: id, ownerEmail: session.email });
  if (!result.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // remaining.total === 0 is the verifiable guarantee the session is gone.
  return NextResponse.json({
    ok: true,
    deleted: result.deleted,
    purged: result.remaining.total === 0,
    remaining: result.remaining,
  });
}
