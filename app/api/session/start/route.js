import { NextResponse } from 'next/server';
import { getSessionPayload, generateSessionToken } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/session/start
// Cookie-authenticated. Returns a short-lived engine WS token for the logged-in
// user. The engine derives the user's single session from the token's email, so
// no session code is needed anywhere.
export async function POST() {
  const session = await getSessionPayload();
  if (!session?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = generateSessionToken(session.email);
  return NextResponse.json({ token });
}
