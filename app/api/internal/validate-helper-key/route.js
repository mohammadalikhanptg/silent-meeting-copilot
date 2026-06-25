import { NextResponse } from 'next/server';
import { verifyHelperKeyHmac, checkInternalBearer } from '../../../lib/auth';
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

  const { email, version } = decoded;
  const sql = getSql();

  // Check version matches current DB version (rotation invalidates old keys)
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
