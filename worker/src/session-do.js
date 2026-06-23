// Durable Object: one instance per session, manages WebSocket connections
// and accumulates audio chunks before sending to the STT provider.
export class SessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    // Accumulate audio bytes per speaker until flush threshold
    this.buffers = { me: [], others: [] };
    this.FLUSH_BYTES = 64 * 1024; // flush after ~64 KB of audio per channel
    this.lang = null; // language hint set on WS connect or via config message
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      return this._handleWebSocket(request);
    }
    return new Response('Not found', { status: 404 });
  }

  async _handleWebSocket(request) {
    // Accept optional ?lang= hint from connecting client
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || null;
    if (lang) this.lang = lang;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    this.sockets.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the Workers runtime when a message arrives on any accepted WebSocket.
  async webSocketMessage(ws, message) {
    try {
      // Text frames are control messages; binary frames are audio chunks.
      if (typeof message === 'string') {
        const ctrl = JSON.parse(message);
        if (ctrl.type === 'flush') {
          await this._flushChannel(ctrl.speaker || 'me');
        } else if (ctrl.type === 'config') {
          if (ctrl.lang !== undefined) this.lang = ctrl.lang || null;
        }
        return;
      }

      // Binary: first byte encodes speaker (0 = me, 1 = others)
      const bytes = new Uint8Array(message);
      if (bytes.length < 2) return;
      const speaker = bytes[0] === 1 ? 'others' : 'me';
      const audio = bytes.slice(1);
      this.buffers[speaker].push(audio);
      const totalBytes = this.buffers[speaker].reduce((s, b) => s + b.length, 0);
      if (totalBytes >= this.FLUSH_BYTES) {
        await this._flushChannel(speaker);
      }
    } catch (err) {
      this._broadcast({ type: 'error', message: String(err) });
    }
  }

  async webSocketClose(ws) {
    this.sockets.delete(ws);
    // Flush remaining buffers on close
    for (const speaker of ['me', 'others']) {
      if (this.buffers[speaker].length > 0) {
        await this._flushChannel(speaker);
      }
    }
  }

  async webSocketError(ws, error) {
    this.sockets.delete(ws);
    console.error('WebSocket error:', error);
  }

  async _flushChannel(speaker) {
    const chunks = this.buffers[speaker];
    if (chunks.length === 0) return;
    this.buffers[speaker] = [];

    // Concatenate chunks into a single Uint8Array
    const totalLen = chunks.reduce((s, b) => s + b.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const result = await transcribeAndClean(combined, this.env, this.lang);
    if (result.raw) {
      this._broadcast({ type: 'transcript', speaker, ...result });
    }
  }

  _broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets) {
      try { ws.send(text); } catch (_) { this.sockets.delete(ws); }
    }
  }
}

// Deepgram prerecorded REST transcription (nova-2, multilingual including Hindi/Urdu).
// Only called when env.DEEPGRAM_API_KEY is set.
// To enable: wrangler secret put DEEPGRAM_API_KEY  (then enter your key)
async function transcribeDeepgram(audioBytes, apiKey, lang) {
  const params = new URLSearchParams({ model: 'nova-2', smart_format: 'true' });
  if (lang) {
    params.set('language', lang);
  } else {
    params.set('detect_language', 'true');
  }

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/octet-stream',
    },
    body: audioBytes,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Deepgram error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return transcript.trim();
}

// Shared transcription + cleanup used by both SessionDO and POST /transcribe.
//
// Provider selection (automatic):
//   DEEPGRAM_API_KEY present in Worker env → Deepgram nova-2 (better multilingual, Hindi/Urdu)
//   No key                                 → Cloudflare Workers AI Whisper (free, default)
//
// Confirmed working Cloudflare models (probed 2026-06-23):
//   ASR: @cf/openai/whisper               (multilingual base, number-array input)
//   LLM: @cf/meta/llama-3.2-3b-instruct   (llama-3.1 deprecated 2026-05-30)
export async function transcribeAndClean(audioBytes, env, lang = null) {
  const provider = env.DEEPGRAM_API_KEY ? 'deepgram' : 'cloudflare';
  let raw = '';

  if (provider === 'deepgram') {
    raw = await transcribeDeepgram(audioBytes, env.DEEPGRAM_API_KEY, lang);
  } else {
    // Cloudflare Workers AI Whisper — input must be a number array
    const input = { audio: [...audioBytes] };
    if (lang) input.language = lang;
    const result = await env.AI.run('@cf/openai/whisper', input);
    raw = (result.text || '').trim();
  }

  if (!raw) return { raw: '', cleaned: '', provider };

  // LLM cleanup pass: fix punctuation/capitalisation, preserve original language.
  const llmResult = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
    messages: [
      {
        role: 'system',
        content:
          'You are a meeting transcript editor. Fix punctuation, capitalisation, and obvious transcription errors. PRESERVE the original language (English, Hindi, Urdu, or mixed code-switching). Do NOT translate, summarise, or expand. Return ONLY the corrected text.',
      },
      { role: 'user', content: raw },
    ],
    max_tokens: 1024,
  });

  const cleaned = (llmResult.response || raw).trim();
  return { raw, cleaned, provider };
}
