import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';
import { getSql } from '../../../lib/db';
import { hardDeleteSession } from '../../../lib/retention';

export const dynamic = 'force-dynamic';

// POST /api/meetings/bulk-delete
// Body: { ids: string[] }  — max 50 per request.
//
// Each id is ownership-checked against the authenticated session's email via
// hardDeleteSession before deletion. Cross-account ids return ok:false and
// delete nothing (IDOR-safe — same guarantee as DELETE /api/meetings/[id]).
// Returns per-id results so the client can refresh exactly the cleared rows.
export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let ids;
  try {
    const body = await request.json();
    ids = body?.ids;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 sessions per request' }, { status: 400 });
  }
  if (ids.some(id => typeof id !== 'string' || !id.trim())) {
    return NextResponse.json({ error: 'All ids must be non-empty strings' }, { status: 400 });
  }

  const sql = getSql();
  const results = [];

  for (const id of ids) {
    const result = await hardDeleteSession(sql, { meetingId: id, ownerEmail: session.email });
    results.push({
      id,
      ok: result.ok,
      ...(result.ok
        ? { deleted: result.deleted, purged: result.remaining?.total === 0 }
        : { reason: result.reason }),
    });
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  return NextResponse.json({ ok: true, succeeded, failed, results });
}
