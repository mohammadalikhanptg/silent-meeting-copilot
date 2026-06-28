// Streaming transcription relay — the engine-agnostic "provider slot".
//
// Holds one long-lived outbound WebSocket to a streaming STT provider per audio
// channel (me / others). PCM frames are pushed in; transcript text and speech
// events come back via callbacks. The default provider is Sarvam Saaras v3, but
// the class is deliberately provider-shaped: a UK provider (Speechmatics) can be
// dropped into the same slot by swapping _buildUrl / _buildAudioMessage /
// _parseInbound without touching SessionDO.
//
// Cloudflare Workers cannot use `new WebSocket()` for outbound connections, and
// cannot set request headers on a hibernatable socket. The supported pattern is
// fetch() with an `Upgrade: websocket` header; the live socket comes back on
// response.webSocket and must be .accept()-ed. This relay socket is a plain
// (non-hibernatable) client socket: it lives only while capture is active and is
// torn down on stop/close. If the DO is evicted mid-capture the socket dies and
// is lazily re-established on the next frame.
//
// Reconnect policy (per integration plan): exponential backoff on transport
// closes (1006/1011); NEVER auto-retry on application closes in the 4xxx range
// (auth / quota) — those are surfaced to the operator instead of hammering.

const RECONNECT_CODES = new Set([1006, 1011]);
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
const MAX_RECONNECTS = 5;
// Floor between lazy (push-triggered) reconnect attempts. Frames arrive ~every
// 100ms, so without this a socket that opens then immediately closes would
// reconnect ~10x/sec and trip provider rate limits (observed: Sarvam close 1003).
const MIN_RECONNECT_GAP_MS = 1000;

// Chunked base64 for Int16 PCM. String.fromCharCode.apply blows the stack on
// large inputs, so we window it. Frames are ~100ms (3200 bytes) so this is cheap.
function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export class StreamingTranscriber {
  // opts:
  //   apiKey         (required) Sarvam Api-Subscription-Key
  //   channel        'me' | 'others' (label only, echoed to callbacks)
  //   mode           output mode: codemix | transcribe | translate | verbatim | translit
  //   languageCode   BCP-47 e.g. 'hi-IN', or null/'unknown' for auto
  //   codec          input_audio_codec connection param: pcm_s16le | pcm_l16 | pcm_raw | wav
  //   encoding       per-message AudioData.encoding token
  //   sampleRate     16000
  //   highVad        boolean
  //   vadSignals     boolean
  //   debug          boolean — log raw inbound shapes + lifecycle (no audio bytes)
  //   onTranscript({channel, text, isFinal, raw})
  //   onEvent({channel, signal})          START_SPEECH / END_SPEECH
  //   onError({channel, code, reason, fatal})
  //   onStatus({channel, state})          connecting | open | closed | reconnecting | dead
  constructor(opts) {
    this.opts = opts;
    this.channel = opts.channel || 'me';
    this.ws = null;
    this.state = 'idle';
    this._reconnects = 0;
    this._closing = false;
    this._opening = null; // in-flight connect promise (dedupe concurrent pushes)
  }

  _log(...a) { if (this.opts.debug) { try { console.log('[sarvam:' + this.channel + ']', ...a); } catch (_) {} } }
  _status(s) { this.state = s; try { this.opts.onStatus && this.opts.onStatus({ channel: this.channel, state: s }); } catch (_) {} }

  _buildUrl() {
    const o = this.opts;
    const p = new URLSearchParams();
    p.set('model', 'saaras:v3');
    p.set('mode', o.mode || 'codemix');
    // AsyncAPI ws binding uses the hyphenated `language-code`; the SDK passes the
    // same. Omit for auto-detect when null/'unknown'.
    if (o.languageCode && o.languageCode !== 'unknown') p.set('language-code', o.languageCode);
    p.set('sample_rate', String(o.sampleRate || 16000));
    p.set('input_audio_codec', o.codec || 'pcm_s16le');
    if (o.highVad) p.set('high_vad_sensitivity', 'true');
    if (o.vadSignals) p.set('vad_signals', 'true');
    return 'https://api.sarvam.ai/speech-to-text/ws?' + p.toString();
  }

  _buildAudioMessage(int16Bytes) {
    // AudioData wire schema (Sarvam AsyncAPI speechToTextStreaming_audioMessage):
    // the AudioData object MUST be nested under an `audio` key. Sending the fields
    // at the top level makes Sarvam report "Invalid request: 'audio' must not be
    // None" and close the stream. Required fields: data, sample_rate, encoding.
    return JSON.stringify({
      audio: {
        data: bytesToBase64(int16Bytes),
        sample_rate: this.opts.sampleRate || 16000,
        encoding: this.opts.encoding || 'audio/wav',
      },
    });
  }

  _parseInbound(text) {
    // Defensive: the response schema is parsed across the likely field paths so a
    // minor doc/shape drift does not silently swallow transcripts. Real shapes are
    // confirmed by the debug log on the first live run, then this can be tightened.
    let msg;
    try { msg = JSON.parse(text); } catch (_) { this._log('non-json inbound', text && text.slice(0, 120)); return; }
    if (this.opts.debug) this._log('inbound', JSON.stringify(msg).slice(0, 300));

    const type = (msg.type || msg.event || '').toString().toUpperCase();
    const signal = (msg.signal || msg.data?.signal || '').toString().toUpperCase();

    // Provider pipeline / validation errors arrive as {type:'error', data:{message}}.
    // Surface them (fatal) so the operator sees the real cause instead of a silently
    // dead panel, and so format probes can detect a rejected audio frame.
    if (type === 'ERROR') {
      const emsg = (msg.data?.message || msg.message || 'provider pipeline error').toString();
      this._log('provider error', emsg);
      try { this.opts.onError && this.opts.onError({ channel: this.channel, code: 0, reason: 'Sarvam: ' + emsg, fatal: true }); } catch (_) {}
      return;
    }

    // Speech start/end events (vad_signals=true).
    if (type === 'EVENTS' || signal === 'START_SPEECH' || signal === 'END_SPEECH' || type === 'START_SPEECH' || type === 'END_SPEECH') {
      const sig = signal || type;
      try { this.opts.onEvent && this.opts.onEvent({ channel: this.channel, signal: sig }); } catch (_) {}
      if (!msg.data?.transcript && !msg.transcript) return;
    }

    const d = msg.data || msg;
    const textOut = (d.transcript ?? d.text ?? d.transcription ?? '').toString().trim();
    if (textOut) {
      const isFinal = (d.is_final ?? d.final ?? (type === 'DATA') ?? true) === true;
      try { this.opts.onTranscript && this.opts.onTranscript({ channel: this.channel, text: textOut, isFinal, raw: msg }); } catch (_) {}
    }
  }

  async _connect() {
    if (this.ws && this.state === 'open') return;
    if (this._opening) return this._opening;
    this._lastConnectAt = Date.now();
    this._opening = (async () => {
      this._status(this._reconnects ? 'reconnecting' : 'connecting');
      const url = this._buildUrl();
      this._log('connect', url.replace(/language-code=[^&]*/, 'language-code=…'));
      const resp = await fetch(url, {
        headers: { Upgrade: 'websocket', 'Api-Subscription-Key': this.opts.apiKey },
      });
      const ws = resp.webSocket;
      if (!ws) {
        const body = await resp.text().catch(() => '');
        this._log('no webSocket on response', resp.status, body.slice(0, 200));
        // 4xx from the upgrade is an auth/quota/config failure — fatal, no retry.
        const fatal = resp.status >= 400 && resp.status < 500;
        try { this.opts.onError && this.opts.onError({ channel: this.channel, code: resp.status, reason: body.slice(0, 200) || 'upgrade failed', fatal }); } catch (_) {}
        this._status('dead');
        throw new Error('sarvam upgrade failed ' + resp.status);
      }
      ws.accept();
      this.ws = ws;
      this._reconnects = 0;
      this._status('open');
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') this._parseInbound(ev.data);
        // Binary inbound is not expected from the STT stream; ignore.
      });
      ws.addEventListener('close', (ev) => this._onClose(ev.code, ev.reason));
      ws.addEventListener('error', () => this._log('ws error event'));
    })();
    try { await this._opening; } finally { this._opening = null; }
  }

  _onClose(code, reason) {
    this.ws = null;
    this._log('close', code, reason);
    if (this._closing) { this._status('closed'); return; }
    const reasonStr = (reason || '').toString();
    // Rate limit / subscription / quota: Sarvam signals this with close 1003 (and a
    // descriptive reason). Treat it like a 4xxx application reject: surface a clear,
    // actionable message and do NOT retry (retrying a rate/quota limit makes it worse).
    const rateLimited = code === 1003 || /rate limit|subscription|quota|exceeded/i.test(reasonStr);
    if ((code >= 4000 && code < 5000) || rateLimited) {
      const msg = rateLimited
        ? ('Sarvam rejected the stream: ' + (reasonStr || 'rate limit / subscription limit') + ' (check the Sarvam dashboard subscription and quota).')
        : (reasonStr || 'provider rejected the connection');
      try { this.opts.onError && this.opts.onError({ channel: this.channel, code, reason: msg, fatal: true }); } catch (_) {}
      this._status('dead');
      return;
    }
    if (RECONNECT_CODES.has(code) || code === 1005 || code === 1001) {
      if (this._reconnects >= MAX_RECONNECTS) {
        try { this.opts.onError && this.opts.onError({ channel: this.channel, code, reason: 'max reconnects', fatal: true }); } catch (_) {}
        this._status('dead');
        return;
      }
      const delay = BACKOFF_MS[Math.min(this._reconnects, BACKOFF_MS.length - 1)];
      this._reconnects += 1;
      this._status('reconnecting');
      this._log('reconnect in', delay, 'attempt', this._reconnects);
      setTimeout(() => { this._connect().catch((e) => this._log('reconnect failed', e && e.message)); }, delay);
      return;
    }
    // Unknown non-clean close: surface a non-fatal notice so the cockpit is not left
    // silently dead, then stop (no reconnect).
    if (code !== 1000) {
      try { this.opts.onError && this.opts.onError({ channel: this.channel, code, reason: reasonStr || ('connection closed (' + code + ')'), fatal: false }); } catch (_) {}
    }
    this._status('closed');
  }

  // Push one PCM frame (Int16LE bytes). Lazily opens the socket. Frames that
  // arrive while not OPEN are dropped (a few hundred ms gap across a reconnect is
  // acceptable for the live coach); the drop is logged under debug.
  async push(int16Bytes) {
    if (this._closing) return;
    if (!this.ws || this.state !== 'open') {
      // Throttle push-triggered reconnects so a socket that opens then immediately
      // closes cannot reconnect every frame and trip the provider rate limit.
      const now = Date.now();
      if (this.state !== 'connecting' && (now - (this._lastConnectAt || 0)) >= MIN_RECONNECT_GAP_MS) {
        this._connect().catch((e) => this._log('connect failed', e && e.message));
      }
      return;
    }
    try { this.ws.send(this._buildAudioMessage(int16Bytes)); }
    catch (e) { this._log('send failed', e && e.message); }
  }

  close() {
    this._closing = true;
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(1000, 'session stop'); } catch (_) {} }
    this._status('closed');
  }
}
