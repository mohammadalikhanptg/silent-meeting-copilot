import { SessionDO, transcribeAndClean, generateCoaching, enrichFlaggedItem, generateMinutes } from './session-do.js';

export { SessionDO };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function cors(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS, ...extra } });
}

function json(obj, status = 200) {
  return cors(JSON.stringify(obj), status, { 'Content-Type': 'application/json' });
}

// Validate a helper pairing key by calling the Next.js internal endpoint.
// Returns {valid: true, email} or {valid: false, reason}.
async function validateHelperKey(key, sessionCode, env) {
  const secret = env.HELPER_SIGNING_SECRET;
  if (!secret) return { valid: false, reason: 'server misconfigured' };

  const appUrl = env.APP_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
  const validateUrl = new URL(`${appUrl}/api/internal/validate-helper-key`);
  validateUrl.searchParams.set('key', key);
  if (sessionCode) validateUrl.searchParams.set('session_code', sessionCode);

  try {
    const res = await fetch(validateUrl.toString(), {
      headers: { Authorization: `Bearer ${secret}` },
      cf: { cacheTtl: 0 },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { valid: false, reason: body.reason || 'validation failed' };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('validateHelperKey fetch error:', err);
    return { valid: false, reason: 'validation service unreachable' };
  }
}

// Validate a browser session token (issued by the app to a logged-in user).
async function validateSessionToken(token, env) {
  const secret = env.HELPER_SIGNING_SECRET;
  if (!secret) return { valid: false, reason: 'server misconfigured' };
  if (!token) return { valid: false, reason: 'missing token' };
  const appUrl = env.APP_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
  const validateUrl = new URL(`${appUrl}/api/internal/validate-session-token`);
  validateUrl.searchParams.set('token', token);
  try {
    const res = await fetch(validateUrl.toString(), {
      headers: { Authorization: `Bearer ${secret}` },
      cf: { cacheTtl: 0 },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { valid: false, reason: body.reason || 'validation failed' };
    }
    return await res.json();
  } catch (err) {
    console.error('validateSessionToken fetch error:', err);
    return { valid: false, reason: 'validation service unreachable' };
  }
}

// One Durable Object per user (email-derived). Browser and helper both land here,
// so no session code is needed.
function userDoId(env, email) {
  return env.SESSIONS.idFromName('u:' + String(email).toLowerCase());
}

// Accept the socket only to deliver a clean auth_error, then close it.
function wsAuthError(reason) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  try { server.send(JSON.stringify({ type: 'auth_error', reason: reason || 'unauthorized' })); } catch (_) {}
  server.close(4401, reason || 'unauthorized');
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(null, 204);

    // Health check — reports active provider and whether Deepgram key is configured
    if (url.pathname === '/health') {
      // Deepgram nova-3 runs on Workers AI (env.AI), so multilingual transcription
      // is always available with no external key.
      return json({ ok: true, ts: Date.now(), provider: 'deepgram-nova3', deepgramAvailable: true });
    }

    // POST /transcribe — one-shot audio transcription for testing
    // Query params: ?lang=hi (language hint), ?mode=english|hindi-urdu|auto
    if (url.pathname === '/transcribe' && request.method === 'POST') {
      try {
        const buf = await request.arrayBuffer();
        if (!buf || buf.byteLength === 0) {
          return json({ error: 'Empty audio body' }, 400);
        }
        const audioBytes = new Uint8Array(buf);
        const lang = url.searchParams.get('lang') || null;
        const mode = url.searchParams.get('mode') || 'auto';
        const result = await transcribeAndClean(audioBytes, env, lang, mode);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Transcribe error:', err);
        return json({ error: String(err) }, 500);
      }
    }

    // POST /coach — live coaching from accumulated transcript
    // Body: {me: string[], others: string[], objective?: string}
    // Returns: {ok, talkBalance, openItems, suggestions, alignment}
    if (url.pathname === '/coach' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await generateCoaching(body, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Coach error:', err);
        return json({ error: String(err) }, 500);
      }
    }

    // POST /enrich-flag — secondary pipeline: LLM help + search for a flagged transcript item
    // Body: {text, speaker, context?, profile?}
    // Returns: {ok, assist_text, references}
    // Called by the Next.js /api/flagged-items/[id]/process route (fire-and-forget from client)
    if (url.pathname === '/enrich-flag' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await enrichFlaggedItem(body, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Enrich-flag error:', err);
        return json({ error: String(err) }, 500);
      }
    }

    // POST /minutes — generate structured meeting minutes from a full transcript
    // Body: {me: string[], others: string[], title: string, date: string, objective?: string, contextNotes?: string}
    // Returns: {ok, emptyState, title, date, participants, executiveSummary, keyPoints, decisions, actionItems}
    if (url.pathname === '/minutes' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await generateMinutes(body, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Minutes error:', err);
        return json({ error: String(err) }, 500);
      }
    }

    // ── Email-routed endpoints (no session code) ──────────────────────────────
    // Helper standby: connects on launch with just the pairing key. The engine
    // routes it into the user's personal session DO; it captures only when the
    // browser cockpit tells it to (control relay lives in the DO).
    if (url.pathname === '/helper/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected WebSocket upgrade' }, 426);
      }
      const key = url.searchParams.get('key');
      const v = await validateHelperKey(key, null, env);
      if (!v.valid) return wsAuthError(v.reason);
      const authedUrl = new URL(request.url);
      authedUrl.searchParams.set('role', 'helper');
      authedUrl.searchParams.set('_authed_email', v.email);
      const stub = env.SESSIONS.get(userDoId(env, v.email));
      return stub.fetch(new Request(authedUrl, request));
    }

    // Browser cockpit: connects with a short-lived session token. Same DO as the
    // user's helper, so they meet automatically.
    if (url.pathname === '/app/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected WebSocket upgrade' }, 426);
      }
      const token = url.searchParams.get('token');
      const v = await validateSessionToken(token, env);
      if (!v.valid) return wsAuthError(v.reason);
      const authedUrl = new URL(request.url);
      authedUrl.searchParams.set('role', 'browser');
      authedUrl.searchParams.set('_authed_email', v.email);
      const stub = env.SESSIONS.get(userDoId(env, v.email));
      return stub.fetch(new Request(authedUrl, request));
    }

    // GET /session/:id/ws — WebSocket upgrade routed to Durable Object
    // Query params: ?lang=hi&mode=hindi-urdu&key=smc1_xxx.yyy (key required for helper connections)
    const wsMatch = url.pathname.match(/^\/session\/([^/]+)\/ws$/);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected WebSocket upgrade' }, 426);
      }
      const sessionId = wsMatch[1];
      const pairingKey = url.searchParams.get('key');

      // If a pairing key is presented, validate it before routing to the DO.
      // Browser connections omit ?key= and are forwarded unchanged (existing behaviour).
      // Helper connections MUST supply a valid key that owns this session.
      if (pairingKey) {
        const validationResult = await validateHelperKey(pairingKey, sessionId, env);
        if (!validationResult.valid) {
          const pair = new WebSocketPair();
          const [client, server] = Object.values(pair);
          server.accept();
          server.send(JSON.stringify({ type: 'auth_error', reason: validationResult.reason || 'invalid key' }));
          server.close(4401, validationResult.reason || 'invalid pairing key');
          return new Response(null, { status: 101, webSocket: client });
        }
        // Attach authenticated email to the request URL so the DO can record it
        const authedUrl = new URL(request.url);
        authedUrl.searchParams.set('_authed_email', validationResult.email);
        request = new Request(authedUrl, request);
      }

      const doId = env.SESSIONS.idFromName(sessionId);
      const stub = env.SESSIONS.get(doId);
      return stub.fetch(request);
    }

    // GET /session/:id/info — lightweight session status
    const infoMatch = url.pathname.match(/^\/session\/([^/]+)\/info$/);
    if (infoMatch) {
      return json({ sessionId: infoMatch[1], ok: true });
    }

    return json({ error: 'Not found' }, 404);
  },
};
