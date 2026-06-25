import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

// GET /api/meetings/[id]/interview-assessment
// Post-session interview evidence review + three-state signal. Interview sessions only.
export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const [meeting] = await sql`
    SELECT id, title, objective, context_notes, mode_type, started_at
    FROM meetings WHERE id = ${id} AND user_email = ${session.email}
  `;
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });
  if (meeting.mode_type !== 'interview') return Response.json({ ok: true, notInterview: true });

  const segments = await sql`
    SELECT speaker, corrected_text, cleaned FROM transcript_segments
    WHERE meeting_id = ${id} ORDER BY ts
  `;
  const me = segments.filter(s => s.speaker === 'me').map(s => s.cleaned);
  const others = segments.filter(s => s.speaker === 'others').map(s => s.corrected_text || s.cleaned);

  let refDocs = [];
  try {
    refDocs = await sql`SELECT filename, content_text FROM session_reference_docs WHERE meeting_id = ${id} ORDER BY added_at`;
  } catch (_) { refDocs = []; }

  const date = new Date(meeting.started_at).toISOString().slice(0, 10);
  let candidateName = 'Candidate';
  const m = (meeting.title || '').match(/with\s+(.+)$/i);
  if (m) candidateName = m[1].trim();

  if (me.length + others.length < 4) {
    return Response.json({
      ok: true, emptyState: true, title: meeting.title || 'Interview', date, candidateName,
      signal: 'none', dataSufficiency: 'insufficient', claims: [], competencies: [],
    });
  }

  try {
    const res = await fetch(`${ENGINE_URL}/interview-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INTERNAL_SHARED_SECRET || ''}` },
      body: JSON.stringify({
        me, others, title: meeting.title || 'Interview', date,
        objective: meeting.objective || '', contextNotes: meeting.context_notes || '',
        candidateName, refDocs,
      }),
    });
    if (!res.ok) throw new Error(`Engine ${res.status}`);
    const data = await res.json();
    return Response.json({ ok: true, ...data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
