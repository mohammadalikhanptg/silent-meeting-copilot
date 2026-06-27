import { NextResponse } from 'next/server';
import { verifySessionToken, checkInternalBearer } from '../../../lib/auth';
import { getSql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/internal/validate-session-token
// Called by the Cloudflare engine to validate a browser session token.
// Auth:  Authorization: Bearer INTERNAL_SHARED_SECRET   (H3 — no fallback)
// Token: X-Session-Token header                          (H2 — never in the URL)
// X-Consume: 1 → record the token's jti as single-use    (H4 — replay protection)
//   on the WebSocket-upgrade path. POST endpoints validate without consuming.
export async function GET(request) {
  const auth = checkInternalBearer(request.headers.get('Authorization') || '');
  if (auth === 'misconfig') return NextResponse.json({ valid: false, reason: 'server misconfigured' }, { status: 500 });
  if (auth !== 'ok') return NextResponse.json({ valid: false, reason: 'unauthorized' }, { status: 401 });

  const token = request.headers.get('X-Session-Token') || '';
  const decoded = verifySessionToken(token);
  if (!decoded) return NextResponse.json({ valid: false, reason: 'invalid or expired token' });

  // H4 — bind to the issuing app session: it must still exist, be unrevoked and
  // unexpired. Revoking the app session (logout / admin revoke) invalidates every
  // engine token minted for it: the revocation path.
  if (!decoded.sid) return NextResponse.json({ valid: false, reason: 'token not bound to a session' });
  const sql = getSql();
  let sessionRow;
  try {
    const rows = await sql`SELECT revoked_at, expires_at FROM sessions WHERE id = ${decoded.sid} LIMIT 1`;
    sessionRow = rows[0];
  } catch {
    return NextResponse.json({ valid: false, reason: 'validation error' }, { status: 500 });
  }
  if (!sessionRow) return NextResponse.json({ valid: false, reason: 'session not found' });
  if (sessionRow.revoked_at) return NextResponse.json({ valid: false, reason: 'session revoked' });
  if (new Date(sessionRow.expires_at) < new Date()) return NextResponse.json({ valid: false, reason: 'session expired' });

  // H4 — replay protection on the consuming (WebSocket-upgrade) path: each jti is
  // accepted exactly once. A captured token cannot re-open the capture channel.
  if (request.headers.get('X-Consume') === '1') {
    if (!decoded.jti) return NextResponse.json({ valid: false, reason: 'token missing jti' });
    try {
      await sql`DELETE FROM used_engine_tokens WHERE exp < now()`;
      const inserted = await sql`
        INSERT INTO used_engine_tokens (jti, sid, email, exp)
        VALUES (${decoded.jti}, ${decoded.sid}, ${decoded.email}, to_timestamp(${decoded.exp}))
        ON CONFLICT (jti) DO NOTHING
        RETURNING jti
      `;
      if (!inserted[0]) return NextResponse.json({ valid: false, reason: 'token already used' });
    } catch {
      return NextResponse.json({ valid: false, reason: 'validation error' }, { status: 500 });
    }
  }

  return NextResponse.json({ valid: true, email: decoded.email });
}
