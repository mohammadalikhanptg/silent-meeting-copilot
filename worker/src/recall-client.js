// ---------------------------------------------------------------------------
// Recall.ai control-plane client (Recall integration 1/N)
// ---------------------------------------------------------------------------
//
// A thin, region-aware wrapper over the Recall.ai bot control-plane REST API.
// It exists so a later increment can create/retrieve/delete the meeting bot
// that streams per-participant realtime transcripts into the source-agnostic
// engine. THIS increment ships the client dormant:
//
//   • HARD MASTER GATE: every method throws RecallDisabledError unless the
//     environment variable RECALL_ENABLED === "true". Default OFF. With the
//     gate closed no network call is ever made, so importing or constructing
//     the client has zero side effects and cannot reach Recall.
//   • Region-aware: the base URL is derived from RECALL_REGION (default
//     "eu-central-1", the workspace's EU/Frankfurt region) so the same code
//     works across Recall regions without edits.
//   • Secret hygiene: the RECALL_API_KEY is read from env at call time and is
//     placed ONLY into the Authorization header. It is NEVER logged, echoed,
//     returned, or included in any thrown error. There are deliberately no
//     console.* calls in this module.
//
// Cloudflare Workers do not expose env as a global, so the client is built via
// a factory that closes over `env`; the returned object's methods then match
// the brief's signatures exactly: createBot(meetingUrl, opts), retrieveBot(id),
// deleteBot(id), listBots().

export class RecallDisabledError extends Error {
  constructor(method) {
    super(
      `Recall integration is disabled (RECALL_ENABLED !== "true"); refused ${method}. ` +
        'This increment ships flag-OFF; no Recall network call is permitted.'
    );
    this.name = 'RecallDisabledError';
    this.method = method;
  }
}

// An error carrying the HTTP status of a failed Recall response. The response
// body is captured for diagnostics but the request Authorization header (and
// therefore the API key) is never part of it.
export class RecallApiError extends Error {
  constructor(method, status, bodyText) {
    super(`Recall ${method} failed: HTTP ${status}`);
    this.name = 'RecallApiError';
    this.method = method;
    this.status = status;
    this.body = bodyText;
  }
}

export const DEFAULT_RECALL_REGION = 'eu-central-1';

// Whether the master gate is open. Anything other than the exact string "true"
// (the Worker [vars] value type) leaves the integration dormant.
export function recallEnabled(env) {
  return !!env && env.RECALL_ENABLED === 'true';
}

// Region-aware API base, no trailing slash. e.g. https://eu-central-1.recall.ai/api/v1
export function recallBaseUrl(env) {
  const region = (env && env.RECALL_REGION) || DEFAULT_RECALL_REGION;
  return `https://${region}.recall.ai/api/v1`;
}

// Build the request headers. The API key lives only here. This function is not
// exported so the assembled Authorization header cannot leak through the public
// surface; callers only ever see the parsed response body.
function authHeaders(env) {
  return {
    Authorization: `Token ${env.RECALL_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Create a Recall control-plane client bound to `env`. The factory itself is
// side-effect free; the gate is enforced inside each method so merely creating
// a client never reaches the network.
export function createRecallClient(env, fetchImpl) {
  // `fetchImpl` is injectable for offline testing; production passes nothing
  // and the global fetch is used. The gate runs BEFORE fetchImpl is touched, so
  // a disabled client never invokes it.
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);

  function ensureEnabled(method) {
    if (!recallEnabled(env)) throw new RecallDisabledError(method);
  }

  async function request(method, label, path, body) {
    if (!doFetch) throw new RecallApiError(label, 0, 'no_fetch_available');
    const res = await doFetch(`${recallBaseUrl(env)}${path}`, {
      method,
      headers: authHeaders(env),
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new RecallApiError(label, res.status, text);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    // Ask Recall to send a bot into a meeting. `opts` are passed through to the
    // Recall payload (e.g. realtime endpoints, transcription config); they are
    // never inspected or logged here. Synchronous gate: a disabled client throws
    // before any promise/network work begins.
    createBot(meetingUrl, opts = {}) {
      ensureEnabled('createBot');
      return request('POST', 'createBot', '/bot', { meeting_url: meetingUrl, ...opts });
    },

    retrieveBot(id) {
      ensureEnabled('retrieveBot');
      return request('GET', 'retrieveBot', `/bot/${encodeURIComponent(id)}`);
    },

    deleteBot(id) {
      ensureEnabled('deleteBot');
      return request('DELETE', 'deleteBot', `/bot/${encodeURIComponent(id)}`);
    },

    listBots() {
      ensureEnabled('listBots');
      return request('GET', 'listBots', '/bot');
    },
  };
}
