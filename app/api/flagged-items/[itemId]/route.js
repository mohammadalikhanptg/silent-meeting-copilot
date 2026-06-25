import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/flagged-items/[itemId] — mark addressed or un-addressed
export async function PATCH(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const body = await request.json().catch(() => ({}));
  const sql = getSql();

  // Verify ownership via meeting join
  const [item] = await sql`
    SELECT fi.id FROM flagged_items fi
    JOIN meetings m ON m.id = fi.meeting_id
    WHERE fi.id = ${itemId} AND m.user_email = ${session.email}
  `;
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });

  if (body.addressed === true) {
    await sql`
      UPDATE flagged_items
      SET addressed_at = now(), status = 'addressed'
      WHERE id = ${itemId}
    `;
  } else if (body.addressed === false) {
    await sql`
      UPDATE flagged_items
      SET addressed_at = null, status = 'enriched'
      WHERE id = ${itemId}
    `;
  }

  return Response.json({ ok: true });
}

// DELETE /api/flagged-items/[itemId] — remove a flag entirely (un-flag a line)
export async function DELETE(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const sql = getSql();

  const [item] = await sql`
    SELECT fi.id FROM flagged_items fi
    JOIN meetings m ON m.id = fi.meeting_id
    WHERE fi.id = ${itemId} AND m.user_email = ${session.email}
  `;
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });

  await sql`DELETE FROM flagged_items WHERE id = ${itemId}`;
  return Response.json({ ok: true });
}
