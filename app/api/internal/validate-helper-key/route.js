import { NextResponse } from 'next/server';
import { verifyHelperKeyHmac } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/internal/validate-helper-key?key=smc1_xxx.yyy&session_code=abc-1234
// Called by the Cloudflare worker to validate a helper pairing key.
// Auth: Authorization: Bearer HELPER_SIGNING_SECRET
export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const secret = process.env.HELPER_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ valid: false, reason: 'server misconfigured' }, { status: 500 });

  // Constant-time comparison for Bearer token
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let match = false;
  try {
    const { timingSafeEqual } = await import('node:crypto');
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    match = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    match = provided === secret;
  }
  if (!match) {
    return NextResponse.json({ valid: false, reason: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const sessionCode = url.searchParams.get('session_code') || '';

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
