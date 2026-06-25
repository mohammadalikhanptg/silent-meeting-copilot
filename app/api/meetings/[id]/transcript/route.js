import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/meetings/[id]/transcript — full transcript as a downloadable text file.
export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const [meeting] = await sql`
    SELECT title, started_at FROM meetings WHERE id = ${id} AND user_email = ${session.email}
  `;
  if (!meeting) return new Response('Not found', { status: 404 });

  const segments = await sql`
    SELECT speaker, cleaned, corrected_text, ts
    FROM transcript_segments
    WHERE meeting_id = ${id}
    ORDER BY ts
  `;

  const date = new Date(meeting.started_at).toISOString().slice(0, 10);
  const head = `Transcript — ${meeting.title || 'Untitled session'}\n${date}\n\n`;
  const body = segments.map(s => {
    const who = s.speaker === 'others' ? 'OTHERS' : 'ME';
    const text = s.speaker === 'others' ? (s.corrected_text || s.cleaned) : s.cleaned;
    const t = s.ts ? new Date(s.ts).toLocaleTimeString('en-GB') : '';
    return `[${t}] ${who}: ${text}`;
  }).join('\n');
  const out = head + (body || 'No transcript recorded.') + '\n';

  const safe = (meeting.title || 'session').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
  return new Response(out, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="transcript-${safe}-${date}.txt"`,
    },
  });
}
