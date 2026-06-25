import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// Returns meeting metadata for the session preparation form — no transcript segments.
export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const [meeting] = await sql`
    SELECT id, title, objective, language_mode, mode_type, context_notes, started_at, ended_at
    FROM meetings
    WHERE id = ${id} AND user_email = ${session.email}
  `;

  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true, meeting });
}
