import { SessionDO, transcribeAndClean, generateCoaching, enrichFlaggedItem, generateMinutes, generateActionPoints, generateInterviewAssessment } from './session-do.js';
import { clientIp, checkIpLimit, checkUserLimit, RL_PERIOD_SECONDS } from './ratelimit.js';

export { SessionDO };

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// POST-endpoint auth: accept the internal service secret (server-to-server) or a valid
// short-lived browser engine token. Keeps the stateless generation endpoints non-public.
// (H3) Only INTERNAL_SHARED_SECRET is accepted as the service bearer — the
// HELPER_SIGNING_SECRET fallback has been removed. The session-token path here is
// non-consuming (POST endpoints may be called repeatedly within the token TTL);
// single-use replay protection applies only to the WebSocket-upgrade path.
async function requirePostAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!bearer) return { ok: false };
  if (env.INTERNAL_SHARED_SECRET && ctEq(bearer, env.INTERNAL_SHARED_SECRET)) {
    return { ok: true, svc: true };
  }
  const v = await validateSessionToken(bearer, env, { consume: false });
  if (v && v.valid) return { ok: true, email: v.email };
  return { ok: false };
}

// ── WebSocket subprotocol token carriage (H2) ─────────────────────────────────
// Browsers/Electron cannot set headers on a WebSocket handshake, so auth tokens
// travel in Sec-WebSocket-Protocol (never the URL). The client offers two
// subprotocols: the marker "smc.v1" plus a value entry "smc.token.<token>" or
// "smc.key.<key>". The engine reads the value entry and echoes only the marker,
// so the secret is never reflected back in a response header.
function offeredProtocols(request) {
  const h = request.headers.get('Sec-WebSocket-Protocol') || '';
  return h.split(',').map((s) => s.trim()).filter(Boolean);
}
function extractProtoValue(protos, prefix) {
  for (const p of protos) if (p.startsWith(prefix)) return p.slice(prefix.length);
  return null;
}
function echoProto(protos) {
  return protos.includes('smc.v1') ? 'smc.v1' : null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  // Engine responses are JSON/data, never documents; lock them down anyway (CSP).
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
};

function cors(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS, ...extra } });
}

function json(obj, status = 200) {
  return cors(JSON.stringify(obj), status, { 'Content-Type': 'application/json' });
}

// 429 with Retry-After (F1). The native limiter does not expose remaining time,
// so we advise the binding's window length.
function tooMany() {
  return cors(JSON.stringify({ error: 'rate limited' }), 429, {
    'Content-Type': 'application/json',
    'Retry-After': String(RL_PERIOD_SECONDS),
  });
}

// Validate a helper pairing key by calling the Next.js internal endpoint.
// Returns {valid: true, email} or {valid: false, reason}.
async function validateHelperKey(key, sessionCode, env) {
  const secret = env.INTERNAL_SHARED_SECRET;
  if (!secret) return { valid: false, reason: 'server misconfigured' };
  if (!key) return { valid: false, reason: 'missing key' };

  const appUrl = env.APP_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
  // (H2) Carry the pairing key and session code in headers, not the URL query.
  const headers = { Authorization: `Bearer ${secret}`, 'X-Helper-Key': key };
  if (sessionCode) headers['X-Session-Code'] = sessionCode;

  try {
    const res = await fetch(`${appUrl}/api/internal/validate-helper-key`, {
      headers,
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
// opts.consume=true records the token's jti as single-use (replay protection for
// the WebSocket-upgrade path); the POST path validates without consuming.
async function validateSessionToken(token, env, opts = {}) {
  const secret = env.INTERNAL_SHARED_SECRET;
  if (!secret) return { valid: false, reason: 'server misconfigured' };
  if (!token) return { valid: false, reason: 'missing token' };
  const appUrl = env.APP_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
  // (H2) Carry the token in a header, not the URL query.
  const headers = { Authorization: `Bearer ${secret}`, 'X-Session-Token': token };
  if (opts.consume) headers['X-Consume'] = '1';
  try {
    const res = await fetch(`${appUrl}/api/internal/validate-session-token`, {
      headers,
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
// Echo the marker subprotocol when offered so the browser completes the handshake
// and actually receives the auth_error before the close.
function wsAuthError(reason, echo) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  try { server.send(JSON.stringify({ type: 'auth_error', reason: reason || 'unauthorized' })); } catch (_) {}
  server.close(4401, reason || 'unauthorized');
  const headers = echo ? { 'Sec-WebSocket-Protocol': echo } : undefined;
  return new Response(null, { status: 101, webSocket: client, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    CORS['Access-Control-Allow-Origin'] = env.APP_BASE_URL || 'https://silent-meeting-copilot.vercel.app';
    if (request.method === 'OPTIONS') return cors(null, 204);

    // Health check — reports active provider and whether Deepgram key is configured
    if (url.pathname === '/health') {
      // Deepgram nova-3 runs on Workers AI (env.AI), so multilingual transcription
      // is always available with no external key.
      return json({ ok: true, ts: Date.now(), provider: 'deepgram-nova3', deepgramAvailable: true });
    }

    // POST /transcribe — one-shot audio transcription for testing
    // Query params: ?lang=hi (language hint), ?mode=english|hindi-urdu|auto
    const PROTECTED_POST = new Set(['/transcribe', '/coach', '/enrich-flag', '/minutes', '/action-points', '/interview-assessment']);
    if (request.method === 'POST' && PROTECTED_POST.has(url.pathname)) {
      const clen = Number(request.headers.get('Content-Length') || 0);
      const maxBytes = url.pathname === '/transcribe' ? 12000000 : 1000000;
      if (clen > maxBytes) return json({ error: 'payload too large' }, 413);

      // (F1) Rate limiting. Trusted server-to-server callers presenting
      // INTERNAL_SHARED_SECRET (boundary B4) are exempt; peek for that before the
      // auth callback so the per-IP backstop protects the validate fetch from a
      // bad-token flood. Limiter fails open (see ratelimit.js).
      const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      const isSvc = !!(env.INTERNAL_SHARED_SECRET && ctEq(bearer, env.INTERNAL_SHARED_SECRET));
      if (!isSvc) {
        const ipCheck = await checkIpLimit(env, clientIp(request));
        if (!ipCheck.ok) return tooMany();
      }

      const a = await requirePostAuth(request, env);
      if (!a.ok) return json({ error: 'unauthorized' }, 401);

      // Per-user, per-endpoint limit (plus a tighter bucket for /transcribe).
      if (!a.svc) {
        const userCheck = await checkUserLimit(env, { id: a.email, path: url.pathname });
        if (!userCheck.ok) return tooMany();
      }
    }

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
        return json({ error: 'internal error' }, 500);
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
        return json({ error: 'internal error' }, 500);
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
        return json({ error: 'internal error' }, 500);
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
        return json({ error: 'internal error' }, 500);
      }
    }

    // POST /action-points — generate speaker + others action points from a transcript
    // Body: {me, others, title, date, objective?, contextNotes?, speakerName?}
    if (url.pathname === '/action-points' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await generateActionPoints(body, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Action points error:', err);
        return json({ error: 'internal error' }, 500);
      }
    }

    // POST /interview-assessment — post-session interview evidence review + three-state signal
    // Body: {me, others, title, date, objective?, contextNotes?, candidateName?, refDocs?}
    if (url.pathname === '/interview-assessment' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await generateInterviewAssessment(body, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Interview assessment error:', err);
        return json({ error: 'internal error' }, 500);
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
      const protos = offeredProtocols(request);
      // (H2) pairing key arrives in the subprotocol, not the URL query.
      const key = extractProtoValue(protos, 'smc.key.');
      const v = await validateHelperKey(key, null, env);
      if (!v.valid) return wsAuthError(v.reason, echoProto(protos));
      const authedUrl = new URL(request.url);
      authedUrl.searchParams.delete('key');
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
      const protos = offeredProtocols(request);
      // (H2) session token arrives in the subprotocol, not the URL query.
      // (H4) consume=true → the app records this token's jti as single-use, so a
      // captured token cannot re-open the capture channel.
      const token = extractProtoValue(protos, 'smc.token.');
      const v = await validateSessionToken(token, env, { consume: true });
      if (!v.valid) return wsAuthError(v.reason, echoProto(protos));
      const authedUrl = new URL(request.url);
      authedUrl.searchParams.delete('token');
      authedUrl.searchParams.set('role', 'browser');
      authedUrl.searchParams.set('_authed_email', v.email);
      const stub = env.SESSIONS.get(userDoId(env, v.email));
      return stub.fetch(new Request(authedUrl, request));
    }

// Legacy /session/:id/ws and /session/:id/info routes removed (were unauthenticated; superseded by token-authed /app/ws and key-authed /helper/ws).

        return json({ error: 'Not found' }, 404);
  },
};
