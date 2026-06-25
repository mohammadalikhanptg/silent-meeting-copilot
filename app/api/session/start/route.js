import { NextResponse } from 'next/server';
import { getSessionPayload, generateSessionToken } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/session/start
// Cookie-authenticated. Returns a short-lived engine WS token for the logged-in
// user. The engine derives the user's single session from the token's email, so
// no session code is needed anywhere.
export async function POST() {
  const session = await getSessionPayload();
  if (!session?.email || !session?.sid) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // H4 — bind the engine token to this app session id so it dies when the session
  // is revoked/expires, and carries a jti the engine consumes as single-use.
  const token = generateSessionToken(session.email, session.sid);
  return NextResponse.json({ token });
}
