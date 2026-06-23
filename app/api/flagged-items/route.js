import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/flagged-items?meetingId=X — list flagged items for a meeting (with latest DB state)
export async function GET(request) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get('meetingId');
  if (!meetingId) return Response.json({ error: 'meetingId required' }, { status: 400 });

  const sql = getSql();

  const [meeting] = await sql`
    SELECT id FROM meetings WHERE id = ${meetingId} AND user_email = ${session.email}
  `;
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  const items = await sql`
    SELECT id, speaker, text, ts, status, assist_text, reference_json, addressed_at
    FROM flagged_items
    WHERE meeting_id = ${meetingId}
    ORDER BY ts
  `;

  return Response.json({ ok: true, items });
}

// POST /api/flagged-items — create a flagged item
export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { meeting_id, source_segment, speaker, text, ts } = body;
  if (!meeting_id || !speaker || !text) {
    return Response.json({ error: 'meeting_id, speaker, text required' }, { status: 400 });
  }

  const sql = getSql();

  const [meeting] = await sql`
    SELECT id FROM meetings WHERE id = ${meeting_id} AND user_email = ${session.email}
  `;
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  const [row] = await sql`
    INSERT INTO flagged_items (meeting_id, source_segment, speaker, text, ts)
    VALUES (
      ${meeting_id},
      ${source_segment || null},
      ${speaker},
      ${text},
      ${ts ? new Date(ts).toISOString() : new Date().toISOString()}
    )
    RETURNING id
  `;

  return Response.json({ ok: true, id: row.id });
}
