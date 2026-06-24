import { NextResponse } from 'next/server';
import { verifySessionToken, checkInternalBearer } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/internal/validate-session-token?token=smcs1_...
// Called by the Cloudflare engine to validate a browser session token.
// Auth: Authorization: Bearer INTERNAL_SHARED_SECRET (HELPER_SIGNING_SECRET accepted during migration)
export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const auth = checkInternalBearer(authHeader);
  if (auth === 'misconfig') return NextResponse.json({ valid: false, reason: 'server misconfigured' }, { status: 500 });
  if (auth !== 'ok') return NextResponse.json({ valid: false, reason: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const decoded = verifySessionToken(token);
  if (!decoded) return NextResponse.json({ valid: false, reason: 'invalid or expired token' });
  return NextResponse.json({ valid: true, email: decoded.email });
}
