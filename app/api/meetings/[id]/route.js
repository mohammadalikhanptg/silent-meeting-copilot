import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const sql = getSql();
  await sql`
    UPDATE meetings
    SET ended_at = ${body.ended_at || new Date().toISOString()}
    WHERE id = ${id} AND user_email = ${session.email}
  `;

  return NextResponse.json({ ok: true });
}
