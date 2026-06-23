import { NextResponse } from 'next/server';
import { getSessionPayload, generateHelperKey } from '../../lib/auth';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/helper-key — return the user's current pairing key
export async function GET() {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const rows = await sql`
    SELECT helper_key_version FROM auth_users WHERE email = ${session.email} LIMIT 1
  `;
  if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const version = rows[0].helper_key_version ?? 1;
  const key = generateHelperKey(session.email, version);
  return NextResponse.json({ key, version });
}

// POST /api/helper-key — rotate the pairing key (bumps version, invalidates old key)
export async function POST() {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const rows = await sql`
    UPDATE auth_users
    SET helper_key_version = helper_key_version + 1
    WHERE email = ${session.email}
    RETURNING helper_key_version
  `;
  if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const version = rows[0].helper_key_version;
  const key = generateHelperKey(session.email, version);
  return NextResponse.json({ key, version, rotated: true });
}
