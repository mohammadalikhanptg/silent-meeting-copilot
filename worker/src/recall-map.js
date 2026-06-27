// ---------------------------------------------------------------------------
// Recall.ai realtime payload -> internal bot_frame mapping (Recall integration 1/N)
// ---------------------------------------------------------------------------
//
// PURE functions, no side effects, no network, no DB. They translate Recall's
// realtime event payloads into the internal `bot_frame` shape the engine's
// bot-ingest seam works in terms of.
//
// IMPORTANT shape note (read worker/src/bot-ingest.js):
//   The existing synthetic/Zoom-raw-audio path in bot-ingest.js consumes an
//   AUDIO frame: { participantId, displayName, frame:Uint8Array, tStart, tEnd,
//   provenance, confidence } and runs it through the transcriber. Recall is
//   different: it does the transcription itself and delivers TEXT over its
//   realtime "transcript.data" events. So a Recall frame is a TEXT-bearing
//   bot_frame, defined by the brief as:
//
//     { participantId, participantName, text, tsStart, tsEnd, isFinal }
//
//   This module produces exactly that shape. It deliberately does NOT import or
//   modify bot-ingest.js. Increment 2 reconciles the two (teaching the ingest
//   seam to accept a pre-transcribed text frame, bypassing the transcriber) —
//   that is out of scope here and bot-ingest.js stays untouched.
//
// All extraction is defensive: Recall nests the useful data under data.data in
// its webhook envelope, but the same fields may arrive un-nested on the realtime
// websocket. Both are handled, and any missing field degrades to a safe default
// rather than throwing.

// Pull the inner payload object regardless of nesting depth. Recall webhook
// envelopes look like { event, data: { data: {...}, bot, recording, ... } };
// the realtime socket may deliver { event, data: {...} } directly.
function innerData(evt) {
  if (!evt || typeof evt !== 'object') return {};
  const d = evt.data;
  if (d && typeof d === 'object') {
    if (d.data && typeof d.data === 'object') return d.data;
    return d;
  }
  return {};
}

// Normalise a Recall participant object to { id, name }. Recall participant ids
// are numeric; the engine keys on strings.
function mapParticipant(p) {
  if (!p || typeof p !== 'object') return { id: '', name: '' };
  const id = p.id === 0 || p.id ? String(p.id) : '';
  const name = typeof p.name === 'string' ? p.name : '';
  return { id, name };
}

// Read the relative (seconds-from-recording-start) timestamp from a Recall
// timestamp, which is either { relative, absolute } or a bare number.
function relativeTs(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof ts === 'object' && Number.isFinite(ts.relative)) return ts.relative;
  return null;
}

// Map a Recall realtime transcript event ("transcript.data" /
// "transcript.partial_data") to a bot_frame.
//
//   { participantId, participantName, text, tsStart, tsEnd, isFinal }
//
// - text is the space-joined word texts (Recall delivers per-word objects).
// - tsStart/tsEnd come from the first/last word's relative timestamps.
// - isFinal is false for partial events, true for finalised ones (Recall uses a
//   "...partial_data" event name for partials; an explicit is_final flag on the
//   inner data, when present, takes precedence).
export function mapTranscriptData(evt) {
  const data = innerData(evt);
  const { id: participantId, name: participantName } = mapParticipant(data.participant);

  const words = Array.isArray(data.words) ? data.words : [];
  const text = words
    .map((w) => (w && typeof w.text === 'string' ? w.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let tsStart = null;
  let tsEnd = null;
  if (words.length) {
    tsStart = relativeTs(words[0] && words[0].start_timestamp);
    tsEnd = relativeTs(words[words.length - 1] && words[words.length - 1].end_timestamp);
  }

  // Prefer an explicit flag; otherwise infer from the event name.
  let isFinal;
  if (typeof data.is_final === 'boolean') {
    isFinal = data.is_final;
  } else {
    const name = (evt && typeof evt.event === 'string' ? evt.event : '').toLowerCase();
    isFinal = !name.includes('partial');
  }

  return { participantId, participantName, text, tsStart, tsEnd, isFinal };
}

// Map a Recall participant lifecycle event ("participant_events.join" /
// ".leave" / ".update" / ".speech_on" / ".speech_off") to a participant
// descriptor. These carry no transcript text; they exist so later increments can
// maintain the live roster and enrich speaker names. Returns:
//
//   { participantId, participantName, action, ts }
//
// `action` is the lifecycle action (e.g. "join"), derived from the inner data
// or the trailing segment of the event name; `ts` is the relative timestamp.
export function mapParticipantEvent(evt) {
  const data = innerData(evt);
  const { id: participantId, name: participantName } = mapParticipant(data.participant);

  let action = typeof data.action === 'string' ? data.action : '';
  if (!action && evt && typeof evt.event === 'string') {
    const dot = evt.event.lastIndexOf('.');
    action = dot >= 0 ? evt.event.slice(dot + 1) : evt.event;
  }

  const ts = relativeTs(data.timestamp) ?? relativeTs(data.ts);

  return { participantId, participantName, action, ts };
}
