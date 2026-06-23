import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { title, objective, language_mode, context_notes } = body;

  const sql = getSql();
  const [row] = await sql`
    INSERT INTO meetings (user_email, title, objective, language_mode, context_notes)
    VALUES (${session.email}, ${title || null}, ${objective || null}, ${language_mode || null}, ${context_notes || null})
    RETURNING id
  `;

  return NextResponse.json({ id: row.id });
}

export async function GET(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const meetings = await sql`
    SELECT id, title, objective, language_mode, started_at, ended_at
    FROM meetings
    WHERE user_email = ${session.email}
    ORDER BY started_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ meetings });
}
