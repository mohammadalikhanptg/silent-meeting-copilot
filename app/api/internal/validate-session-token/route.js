import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/internal/validate-session-token?token=smcs1_...
// Called by the Cloudflare engine to validate a browser session token.
// Auth: Authorization: Bearer HELPER_SIGNING_SECRET
export async function GET(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const secret = process.env.HELPER_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ valid: false, reason: 'server misconfigured' }, { status: 500 });

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
  if (!match) return NextResponse.json({ valid: false, reason: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const decoded = verifySessionToken(token);
  if (!decoded) return NextResponse.json({ valid: false, reason: 'invalid or expired token' });
  return NextResponse.json({ valid: true, email: decoded.email });
}
