import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { speaker, raw, cleaned, lang } = body;

  if (!speaker || !raw) {
    return NextResponse.json({ error: 'speaker and raw are required' }, { status: 400 });
  }

  const sql = getSql();
  // Verify the meeting belongs to this user before inserting
  const [meeting] = await sql`SELECT id FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql`
    INSERT INTO transcript_segments (meeting_id, speaker, raw, cleaned, lang)
    VALUES (${id}, ${speaker}, ${raw}, ${cleaned || raw}, ${lang || null})
  `;

  return NextResponse.json({ ok: true });
}
