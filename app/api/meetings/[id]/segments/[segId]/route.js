import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../../lib/auth';
import { getSql } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/meetings/:id/segments/:segId
// Applies a repeat-back correction to an OTHERS segment.
// Body: { corrected_text: string, clarified_by_me: boolean }
export async function PATCH(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, segId } = await params;
  const body = await request.json().catch(() => ({}));
  const { corrected_text, clarified_by_me } = body;

  if (!corrected_text) {
    return NextResponse.json({ error: 'corrected_text is required' }, { status: 400 });
  }

  const sql = getSql();
  // Verify the meeting belongs to this user
  const [meeting] = await sql`SELECT id FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql`
    UPDATE transcript_segments
    SET
      corrected_text = ${corrected_text},
      clarified_by_me = ${clarified_by_me === true}
    WHERE id = ${segId} AND meeting_id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
