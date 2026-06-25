import { getSessionPayload } from '../../../../lib/auth';
import { getSql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

// POST /api/flagged-items/[itemId]/process
// Triggers background LLM enrichment + optional search for a flagged item.
// Client fires this without awaiting (fire-and-forget) — latency 1-5 min is acceptable.
export async function POST(request, { params }) {
  const session = await getSessionPayload();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const body = await request.json().catch(() => ({}));
  const { profile } = body;

  const sql = getSql();

  // Verify ownership and get item + meeting context
  const [item] = await sql`
    SELECT fi.id, fi.text, fi.speaker, fi.status, m.context_notes, m.objective
    FROM flagged_items fi
    JOIN meetings m ON m.id = fi.meeting_id
    WHERE fi.id = ${itemId} AND m.user_email = ${session.email}
  `;
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 });

  // Skip if already enriched (idempotent)
  if (item.status === 'enriched' || item.status === 'addressed') {
    return Response.json({ ok: true, skipped: true });
  }

  // Mark as processing so UI shows working state
  await sql`UPDATE flagged_items SET status = 'processing' WHERE id = ${itemId}`;

  const context = [item.context_notes, item.objective].filter(Boolean).join(' | ');

  try {
    const res = await fetch(`${ENGINE_URL}/enrich-flag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SHARED_SECRET || ''}`,
      },
      body: JSON.stringify({
        text: item.text,
        speaker: item.speaker,
        context,
        profile: profile || null,
      }),
    });

    if (!res.ok) throw new Error(`Engine ${res.status}`);
    const data = await res.json();

    await sql`
      UPDATE flagged_items
      SET status        = 'enriched',
          assist_text   = ${data.assist_text || null},
          reference_json = ${JSON.stringify(data.references || [])}
      WHERE id = ${itemId}
    `;

    return Response.json({ ok: true });
  } catch (err) {
    // Reset to pending so the UI can retry later
    await sql`UPDATE flagged_items SET status = 'pending' WHERE id = ${itemId}`;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
