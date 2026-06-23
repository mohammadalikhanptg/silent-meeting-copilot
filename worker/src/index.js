import { SessionDO, transcribeAndClean } from './session-do.js';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(null, 204);

    // Health check
    if (url.pathname === '/health') {
      return json({ ok: true, ts: Date.now() });
    }

    // POST /transcribe — one-shot audio file transcription for testing
    if (url.pathname === '/transcribe' && request.method === 'POST') {
      try {
        const buf = await request.arrayBuffer();
        if (!buf || buf.byteLength === 0) {
          return json({ error: 'Empty audio body' }, 400);
        }
        const audioBytes = new Uint8Array(buf);
        const result = await transcribeAndClean(audioBytes, env);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('Transcribe error:', err);
        return json({ error: String(err) }, 500);
      }
    }

    // GET /session/:id/ws — WebSocket upgrade routed to Durable Object
    const wsMatch = url.pathname.match(/^\/session\/([^/]+)\/ws$/);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected WebSocket upgrade' }, 426);
      }
      const sessionId = wsMatch[1];
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
