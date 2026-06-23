import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { docId } = await params;
  const sql = getSql();

  // Verify ownership before deleting
  const [doc] = await sql`
    SELECT id FROM profile_docs WHERE id = ${docId} AND user_email = ${session.email}
  `;
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql`DELETE FROM profile_docs WHERE id = ${docId}`;

  return NextResponse.json({ ok: true });
}
