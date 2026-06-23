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
    this.mode = 'auto'; // per-session provider mode: 'auto' | 'english' | 'hindi-urdu'
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      return this._handleWebSocket(request);
    }
    return new Response('Not found', { status: 404 });
  }

  async _handleWebSocket(request) {
    // Accept optional ?lang= and ?mode= from connecting client
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || null;
    const mode = url.searchParams.get('mode') || 'auto';
    if (lang) this.lang = lang;
    this.mode = mode;

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
          if (ctrl.mode !== undefined) this.mode = ctrl.mode || 'auto';
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

    const result = await transcribeAndClean(combined, this.env, this.lang, this.mode);
    if (result.error === 'deepgram_unavailable') {
      // Notify client explicitly — do NOT silently fall back to English
      this._broadcast({
        type: 'error',
        code: 'deepgram_unavailable',
        message:
          'Hindi/Urdu mode requires a Deepgram API key that has not been configured on this server. ' +
          'Please switch to English mode or contact the administrator.',
      });
    } else if (result.raw) {
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
// Diarization is enabled when Deepgram is used — speaker labels are embedded inline
// in the returned text as "[Speaker N] ..." segments. Cloudflare Whisper has no
// diarization capability; that path always returns a single unlabelled string.
async function transcribeDeepgram(audioBytes, apiKey, lang) {
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    diarize: 'true',      // P3: speaker diarization — Deepgram path only
  });
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
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const transcript = (alt?.transcript || '').trim();
  const words = alt?.words;

  // If diarization returned per-word speaker labels, reconstruct with [Speaker N] markers.
  // Group consecutive words from the same speaker into runs.
  if (words && words.length > 0 && words[0]?.speaker !== undefined) {
    let labeled = '';
    let currentSpeaker = -1;
    for (const w of words) {
      const spk = w.speaker;
      if (spk !== currentSpeaker) {
        currentSpeaker = spk;
        if (labeled) labeled += ' ';
        labeled += `[Speaker ${spk + 1}] `;
      }
      labeled += (w.punctuated_word || w.word) + ' ';
    }
    return labeled.trim();
  }

  return transcript;
}

// Shared transcription + cleanup used by both SessionDO and POST /transcribe.
//
// Per-session mode selection:
//   mode='english'    → always Cloudflare Whisper (free, fast, no key needed)
//   mode='hindi-urdu' → Deepgram nova-2 if key set; returns {error:'deepgram_unavailable'} if absent
//   mode='auto'       → Deepgram if key present, else Cloudflare (legacy behaviour)
//
// Diarization note: speaker labels are only available via the Deepgram path.
// Cloudflare Whisper has no diarization; its output is always a single unlabelled string.
//
// Confirmed working Cloudflare models (probed 2026-06-23):
//   ASR: @cf/openai/whisper               (multilingual base, number-array input)
//   LLM: @cf/meta/llama-3.2-3b-instruct   (llama-3.1 deprecated 2026-05-30)
export async function transcribeAndClean(audioBytes, env, lang = null, mode = 'auto') {
  let provider;

  if (mode === 'english') {
    // Explicit English → always Cloudflare, regardless of key
    provider = 'cloudflare';
  } else if (mode === 'hindi-urdu') {
    // Explicit Hindi/Urdu → Deepgram required; never silently fall back
    if (!env.DEEPGRAM_API_KEY) {
      return { raw: '', cleaned: '', provider: 'deepgram', error: 'deepgram_unavailable' };
    }
    provider = 'deepgram';
  } else {
    // auto: use Deepgram if key is configured, otherwise Cloudflare
    provider = env.DEEPGRAM_API_KEY ? 'deepgram' : 'cloudflare';
  }

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
          'You are a meeting transcript editor. Fix punctuation, capitalisation, and obvious transcription errors. PRESERVE the original language (English, Hindi, Urdu, or mixed code-switching). PRESERVE any [Speaker N] labels exactly as written. Do NOT translate, summarise, or expand. Return ONLY the corrected text.',
      },
      { role: 'user', content: raw },
    ],
    max_tokens: 1024,
  });

  const cleaned = (llmResult.response || raw).trim();
  return { raw, cleaned, provider };
}

// ---------------------------------------------------------------------------
// P1 — Repeat-back repair
// ---------------------------------------------------------------------------

// Signpost phrases indicating the operator is restating/clarifying what an OTHERS speaker said.
// English + common Hindi/Urdu transliterated equivalents.
const REPEAT_BACK_SIGNPOSTS = [
  'if i understand correctly',
  'if i understand you correctly',
  'if i understood correctly',
  "so you're saying",
  'so you are saying',
  "so what you mean",
  "so what you're saying",
  "let me repeat",
  "let me make sure i got that",
  "let me make sure i got that right",
  "just to confirm",
  "to confirm",
  "you said",
  "your point is",
  "what you're saying is",
  "what you are saying is",
  "so if i understand",
  "so to summarize",
  "so to recap",
  "so basically you're saying",
  "so what you mean is",
  "in other words",
  "to paraphrase",
  "let me paraphrase",
  "so your point is",
  "so you're telling me",
  "so you are telling me",
  "you're saying that",
  "you are saying that",
  "am i correct that",
  "did you say",
  "did i hear you correctly",
  // Hindi/Urdu equivalents (common spoken forms, transliterated)
  'matlab',
  'yaani',
  'toh aap keh rahe hain',
  'toh aap keh rahe the',
  'matlab aap keh rahe',
  'agar main sahi samjha',
  'agar main sahi samjhi',
  'mujhe sahi se samjha',
  'aap ne kaha',
  'aapka matlab',
  'toh matlab',
];

// Detect whether any recent ME turn is a paraphrase/restatement of a recent OTHERS turn.
// Conservative: only triggers on explicit signpost phrases (no pure semantic-only detection).
// A false correction is worse than no correction.
//
// Returns [{meIndex, othersIndex, meTurn, othersTurn}] for each detected repeat-back.
function detectRepeatBacks(meLines, othersLines) {
  if (meLines.length === 0 || othersLines.length === 0) return [];

  const results = [];
  // Check only the most recent 5 ME turns
  const recentMeStart = Math.max(0, meLines.length - 5);

  for (let mi = meLines.length - 1; mi >= recentMeStart; mi--) {
    const meTurnLower = meLines[mi].toLowerCase();

    // Require an explicit signpost phrase — no signpost means no correction
    const hasSignpost = REPEAT_BACK_SIGNPOSTS.some(phrase => meTurnLower.includes(phrase));
    if (!hasSignpost) continue;

    // Require substantive content: at least 8 words
    // Short phrases like "so you're saying yes" are acknowledgements, not restatements
    const meWordCount = meTurnLower.split(/\s+/).filter(Boolean).length;
    if (meWordCount < 8) continue;

    // Find the most recent OTHERS turn with meaningful content (at least 3 words)
    const recentOthersStart = Math.max(0, othersLines.length - 6);
    let targetOthersIdx = -1;
    for (let oi = othersLines.length - 1; oi >= recentOthersStart; oi--) {
      const othersWordCount = othersLines[oi].split(/\s+/).filter(Boolean).length;
      if (othersWordCount >= 3) {
        targetOthersIdx = oi;
        break;
      }
    }
    if (targetOthersIdx < 0) continue;

    // Avoid duplicate corrections for the same ME or OTHERS index
    const alreadyCaptured = results.some(
      r => r.meIndex === mi || r.othersIndex === targetOthersIdx
    );
    if (alreadyCaptured) continue;

    results.push({
      meIndex: mi,
      othersIndex: targetOthersIdx,
      meTurn: meLines[mi],
      othersTurn: othersLines[targetOthersIdx],
    });
  }

  return results;
}

// Use the LLM to infer what the OTHERS speaker most likely said, given their garbled
// transcription and the operator's clean restatement of it.
async function inferCorrectedText(garbled, restatement, env) {
  const prompt = `A speaker's words were garbled in a meeting transcription. The meeting operator then restated what they heard clearly.

Garbled transcription: "${garbled}"
Operator's restatement: "${restatement}"

Based on the restatement, reconstruct what the original speaker most likely said. Write it naturally in first person as if they said it. Keep it concise. Return ONLY the reconstructed text, no explanation, no preamble, no quotes.`;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are a transcript corrector. Reconstruct garbled speech based on a clear restatement of it. Return only the corrected text in first person, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 256,
    });
    const corrected = (result.response || '').trim();
    return corrected || garbled;
  } catch (_) {
    return garbled; // LLM failure → preserve original unchanged
  }
}

// Generate live coaching from accumulated ME/OTHERS transcript lines.
// Called by POST /coach. Returns structured coaching object.
//
// P1: Also detects repeat-back patterns (ME restating garbled OTHERS) and returns
// corrections. Coaching analysis uses corrected OTHERS text and excludes ME
// restatement turns from argument analysis (though they still count for talk balance).
export async function generateCoaching({ me = [], others = [], objective = '' }, env) {
  // Talk time balance — computed from ALL ME words including restatements
  const countWords = (lines) => lines.join(' ').split(/\s+/).filter(Boolean).length;
  const meWords = countWords(me);
  const othersWords = countWords(others);
  const total = meWords + othersWords;
  const mePercent = total > 0 ? Math.round((meWords / total) * 100) : 50;
  const othersPercent = 100 - mePercent;

  // P1: Detect repeat-back patterns and infer corrected OTHERS text
  const repeatBackDetections = detectRepeatBacks(me, others);
  const corrections = [];

  for (const rb of repeatBackDetections) {
    const corrected = await inferCorrectedText(rb.othersTurn, rb.meTurn, env);
    // Only record if the LLM actually produced a meaningfully different result
    if (corrected && corrected.toLowerCase().trim() !== rb.othersTurn.toLowerCase().trim()) {
      corrections.push({
        meIndex: rb.meIndex,
        othersIndex: rb.othersIndex,
        original: rb.othersTurn,
        corrected,
      });
    }
  }

  // Build effective transcript arrays for coaching LLM analysis:
  // - effectiveOthers: corrected text substituted where repairs were found
  // - effectiveMe: restatement turns excluded (they're not new ME arguments)
  const effectiveOthers = [...others];
  for (const c of corrections) {
    effectiveOthers[c.othersIndex] = c.corrected;
  }
  const restatementIndices = new Set(corrections.map(c => c.meIndex));
  const effectiveMe = me.filter((_, i) => !restatementIndices.has(i));

  // Return fast defaults if there's not enough content to analyse
  if (effectiveMe.length + effectiveOthers.length < 3 || total < 20) {
    return {
      talkBalance: { mePercent, othersPercent },
      openItems: [],
      suggestions: ['Keep speaking — coaching will appear once there is enough transcript.'],
      alignment: '',
      corrections,
    };
  }

  // Build a truncated transcript (last 80 lines to stay within token budget)
  const meRecent = effectiveMe.slice(-40);
  const othersRecent = effectiveOthers.slice(-40);
  const transcriptLines = [
    ...meRecent.map(t => `ME: ${t}`),
    ...othersRecent.map(t => `OTHERS: ${t}`),
  ].join('\n');

  const objectiveLine = objective ? `Meeting objective: "${objective}"\n\n` : '';
  const alignmentField = objective
    ? '"alignment": "<one sentence on whether ME is staying on the stated objective, or empty string if on track>"'
    : '"alignment": ""';

  const correctionNote =
    corrections.length > 0
      ? `\n\nNote: ${corrections.length} OTHERS turn(s) have been auto-corrected based on the operator\'s restatements. The corrected meanings are already incorporated in the transcript above.\n`
      : '';

  const prompt = `${objectiveLine}Meeting transcript (recent segments):\n\n${transcriptLines}${correctionNote}\nReturn a JSON object with exactly these fields:\n{\n  "openItems": ["<question or issue raised by OTHERS not yet addressed by ME>", ...],\n  "suggestions": ["<concrete thing ME could say next>", ...],\n  ${alignmentField}\n}\n\nRules:\n- openItems: max 4 items, empty array if none\n- suggestions: 1 to 3 items, actionable and specific\n- alignment: only if objective is given; empty string otherwise\n- Return ONLY the JSON object, no other text`;

  let parsed = { openItems: [], suggestions: [], alignment: '' };
  try {
    const llmResult = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        {
          role: 'system',
          content:
            'You are a real-time meeting coach. Analyse meeting transcripts and return structured coaching advice as a JSON object. Return ONLY valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 512,
    });

    const text = (llmResult.response || '').trim();
    // Extract JSON object from response (handle markdown code blocks or extra text)
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }
  } catch (_) {
    // LLM failed — return safe defaults rather than crashing
  }

  return {
    talkBalance: { mePercent, othersPercent },
    openItems: Array.isArray(parsed.openItems) ? parsed.openItems.slice(0, 4) : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
    alignment: typeof parsed.alignment === 'string' ? parsed.alignment : '',
    corrections,
  };
}
