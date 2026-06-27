import { NextResponse } from 'next/server';
import { verifyHelperKeyHmac, checkInternalBearer } from '../../../lib/auth';
import { helperDeviceDecision } from '../../../lib/helper-devices';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/internal/validate-helper-key
// Called by the Cloudflare worker to validate a helper pairing key.
// Auth: Authorization: Bearer INTERNAL_SHARED_SECRET   (H3 — no fallback)
// Key:  X-Helper-Key header; optional X-Session-Code    (H2 — never in the URL)
export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const auth = checkInternalBearer(authHeader);
  if (auth === 'misconfig') return NextResponse.json({ valid: false, reason: 'server misconfigured' }, { status: 500 });
  if (auth !== 'ok') return NextResponse.json({ valid: false, reason: 'unauthorized' }, { status: 401 });

  const key = request.headers.get('X-Helper-Key') || '';
  const sessionCode = request.headers.get('X-Session-Code') || '';

  if (!key) return NextResponse.json({ valid: false, reason: 'missing key' }, { status: 400 });

  // Verify HMAC — proves key was issued by this server
  const decoded = verifyHelperKeyHmac(key);
  if (!decoded) {
    return NextResponse.json({ valid: false, reason: 'invalid signature' });
  }

  const { email, version, deviceId } = decoded;
  const sql = getSql();

  // Coarse check: version matches current DB version (a version bump revokes ALL
  // of this user's devices at once — the panic button).
  const userRows = await sql`
    SELECT helper_key_version FROM auth_users WHERE email = ${email} LIMIT 1
  `;
  if (!userRows[0]) {
    return NextResponse.json({ valid: false, reason: 'unknown user' });
  }
  const currentVersion = userRows[0].helper_key_version ?? 1;
  if (currentVersion !== version) {
    return NextResponse.json({ valid: false, reason: 'key rotated' });
  }

  // F2: per-device check. Look up the registered device and reject if it has been
  // individually revoked or is unknown. Legacy keys (no device id) skip this layer
  // — the migration bridge — so currently-paired helpers keep working until they
  // re-pair (helperDeviceDecision returns { ok:true, legacy:true }).
  let deviceRow = null;
  if (deviceId) {
    const deviceRows = await sql`
      SELECT device_id, user_email, revoked_at FROM helper_devices
      WHERE device_id = ${deviceId} AND user_email = ${email} LIMIT 1
    `;
    deviceRow = deviceRows[0] || null;
  }
  const decision = helperDeviceDecision(decoded, deviceRow);
  if (!decision.ok) {
    return NextResponse.json({ valid: false, reason: decision.reason });
  }
  // Touch last_seen_at for a registered (non-legacy) device. Fire-and-forget:
  // a bookkeeping write must never block or fail an otherwise-valid connection.
  if (deviceId && !decision.legacy) {
    sql`UPDATE helper_devices SET last_seen_at = now() WHERE device_id = ${deviceId} AND user_email = ${email}`
      .catch(() => {});
  }

  // If session_code provided, verify ownership
  if (sessionCode) {
    const meetingRows = await sql`
      SELECT id FROM meetings
      WHERE session_code = ${sessionCode} AND user_email = ${email}
      LIMIT 1
    `;
    if (!meetingRows[0]) {
      return NextResponse.json({ valid: false, reason: 'session not owned by this user' });
    }
  }

  return NextResponse.json({ valid: true, email });
}
