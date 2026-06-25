import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

// GET /api/meetings/[id]/minutes
// Returns structured meeting minutes as JSON.
// If the transcript is empty, returns an emptyState: true object (never a fabricated document).
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
  const others = segments
    .filter(s => s.speaker === 'others')
    .map(s => s.corrected_text || s.cleaned);

  const date = new Date(meeting.started_at).toISOString().slice(0, 10);

  // Empty transcript — return clear empty state, never a fabricated document
  if (me.length + others.length < 2) {
    return Response.json({
      ok: true,
      emptyState: true,
      title: meeting.title || 'Untitled session',
      date,
      participants: [],
      executiveSummary: 'No transcript was recorded for this session.',
      keyPoints: [],
      decisions: [],
      actionItems: [],
    });
  }

  try {
    const res = await fetch(`${ENGINE_URL}/minutes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INTERNAL_SHARED_SECRET || process.env.HELPER_SIGNING_SECRET || ''}` },
      body: JSON.stringify({
        me,
        others,
        title: meeting.title || 'Untitled session',
        date,
        objective: meeting.objective || '',
        contextNotes: meeting.context_notes || '',
      }),
    });

    if (!res.ok) throw new Error(`Engine ${res.status}`);
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
