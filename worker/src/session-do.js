// Durable Object: one instance per session, manages WebSocket connections
// and accumulates audio chunks before sending to Whisper.
export class SessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    // Accumulate audio bytes per speaker until flush threshold
    this.buffers = { me: [], others: [] };
    this.FLUSH_BYTES = 64 * 1024; // flush after ~64 KB of audio per channel
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this._handleWebSocket(request);
    }
    return new Response('Not found', { status: 404 });
  }

  async _handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    this.sockets.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the Workers runtime when a message arrives on any accepted WebSocket.
  async webSocketMessage(ws, message) {
    try {
      // Binary frames are audio chunks; text frames are control messages.
      if (typeof message === 'string') {
        const ctrl = JSON.parse(message);
        if (ctrl.type === 'flush') {
          await this._flushChannel(ctrl.speaker || 'me');
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

    const result = await transcribeAndClean(combined, this.env);
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

// Shared transcription + cleanup logic used by both DO and POST /transcribe
// Confirmed working models (probed 2026-06-23):
//   ASR: @cf/openai/whisper (multilingual, number-array input)
//   LLM: @cf/meta/llama-3.2-3b-instruct (llama-3.1 and 3 deprecated 2026-05-30)
export async function transcribeAndClean(audioBytes, env) {
  const whisperResult = await env.AI.run('@cf/openai/whisper', {
    audio: [...audioBytes],
  });

  const raw = (whisperResult.text || '').trim();
  if (!raw) return { raw: '', cleaned: '' };

  // LLM cleanup pass: fix punctuation and grammar, preserve language.
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
  return { raw, cleaned };
}
