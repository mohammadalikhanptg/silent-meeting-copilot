import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../../lib/auth';
import { getSql } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, docId } = await params;
  const sql = getSql();

  // Verify ownership via meeting join
  const result = await sql`
    DELETE FROM session_reference_docs
    WHERE id = ${docId}
      AND meeting_id = ${id}
      AND meeting_id IN (SELECT id FROM meetings WHERE user_email = ${session.email})
    RETURNING id
  `;

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
