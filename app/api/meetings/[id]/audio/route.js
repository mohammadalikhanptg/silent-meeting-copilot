import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';
import { getMeetingAudioUrls } from '../../../../lib/r2';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  // Ownership guard: only the meeting owner may retrieve audio.
  const [meeting] = await sql`SELECT id FROM meetings WHERE id = ${id} AND user_email = ${session.email}`;
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // getMeetingAudioUrls returns empty arrays when no audio was retained — not an error.
  const { me, others } = await getMeetingAudioUrls(id);

  return NextResponse.json({ ok: true, me, others, meetingId: id });
}
