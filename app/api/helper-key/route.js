import { NextResponse } from 'next/server';
import { getSessionPayload, generateHelperKey } from '../../lib/auth';
import { newHelperDeviceId } from '../../lib/helper-devices';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

async function currentVersion(sql, email) {
  const rows = await sql`SELECT helper_key_version FROM auth_users WHERE email = ${email} LIMIT 1`;
  if (!rows[0]) return null;
  return rows[0].helper_key_version ?? 1;
}

async function listDevices(sql, email) {
  return sql`
    SELECT device_id, label, created_at, last_seen_at, revoked_at
    FROM helper_devices
    WHERE user_email = ${email}
    ORDER BY created_at DESC
  `;
}

// GET /api/helper-key — list the user's registered helper devices (F2).
// The pairing key itself is shown only once, at issue time (POST action:'issue'),
// so it is never re-served here.
export async function GET() {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const version = await currentVersion(sql, session.email);
  if (version === null) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const devices = await listDevices(sql, session.email);
  return NextResponse.json({ version, devices });
}

// POST /api/helper-key — manage pairing (F2). Actions:
//   { action: 'issue', label? }     → register a NEW device, return its key once
//   { action: 'revoke', device_id } → revoke ONE device (others keep working)
//   { action: 'rotate-all' }        → bump version + revoke every device (panic button)
// (default / no action = 'rotate-all', preserving the original rotate behaviour.)
export async function POST(request) {
  const session = await getSessionPayload();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'rotate-all';
  const sql = getSql();

  if (action === 'issue') {
    const version = await currentVersion(sql, session.email);
    if (version === null) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const label = typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : 'Helper device';
    const deviceId = newHelperDeviceId();
    await sql`
      INSERT INTO helper_devices (device_id, user_email, label)
      VALUES (${deviceId}, ${session.email}, ${label})
    `;
    const key = generateHelperKey(session.email, version, deviceId);
    // Key returned once; only the device_id is queryable afterward.
    return NextResponse.json({ issued: true, key, device_id: deviceId, label });
  }

  if (action === 'revoke') {
    const deviceId = body.device_id;
    if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 });
    // Ownership-scoped: a user can only revoke their own devices.
    const rows = await sql`
      UPDATE helper_devices
      SET revoked_at = now()
      WHERE device_id = ${deviceId} AND user_email = ${session.email} AND revoked_at IS NULL
      RETURNING device_id
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    return NextResponse.json({ revoked: true, device_id: deviceId });
  }

  // rotate-all (default): bump the version (invalidates every issued key, legacy
  // and per-device alike) AND mark all devices revoked for an accurate device list.
  const rows = await sql`
    UPDATE auth_users
    SET helper_key_version = helper_key_version + 1
    WHERE email = ${session.email}
    RETURNING helper_key_version
  `;
  if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  await sql`
    UPDATE helper_devices SET revoked_at = now()
    WHERE user_email = ${session.email} AND revoked_at IS NULL
  `;
  return NextResponse.json({ version: rows[0].helper_key_version, rotated: true });
}
