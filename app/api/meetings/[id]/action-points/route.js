import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

// GET /api/meetings/[id]/action-points
// Returns two-section action points (speaker + others) as JSON.
// Empty transcript returns emptyState: true (never a fabricated document).
export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const [meeting] = await sql`
    SELECT id, title, objective, language_mode, context_notes, started_at
    FROM meetings
    WHERE id = ${id} AND user_email = ${session.email}
  `;
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  const segments = await sql`
    SELECT speaker, corrected_text, cleaned
    FROM transcript_segments
    WHERE meeting_id = ${id}
    ORDER BY ts
  `;

  const me = segments.filter(s => s.speaker === 'me').map(s => s.cleaned);
  const others = segments.filter(s => s.speaker === 'others').map(s => s.corrected_text || s.cleaned);
  const date = new Date(meeting.started_at).toISOString().slice(0, 10);

  // Speaker name from profile if present, else a tidy form of the email local part.
  let speakerName = '';
  try {
    const [p] = await sql`SELECT * FROM user_profiles WHERE user_email = ${session.email} LIMIT 1`;
    if (p) speakerName = (p.full_name || p.name || p.display_name || '').trim();
  } catch (_) {}
  if (!speakerName) {
    const lp = (session.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    speakerName = lp ? lp.replace(/\b\w/g, c => c.toUpperCase()) : 'You';
  }

  if (me.length + others.length < 2) {
    return Response.json({
      ok: true, emptyState: true,
      title: meeting.title || 'Untitled session',
      date, speakerName, speakerActions: [], othersActions: [],
    });
  }

  try {
    const res = await fetch(`${ENGINE_URL}/action-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        me, others,
        title: meeting.title || 'Untitled session',
        date,
        objective: meeting.objective || '',
        contextNotes: meeting.context_notes || '',
        speakerName,
      }),
    });
    if (!res.ok) throw new Error(`Engine ${res.status}`);
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
