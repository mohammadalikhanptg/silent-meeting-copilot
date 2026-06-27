// ---------------------------------------------------------------------------
// Binary participant-frame envelope — wire codec (Bot build 2/N)
// ---------------------------------------------------------------------------
//
// The increment-1 bot path carried per-participant audio as base64-in-JSON
// (the `bot_frame` control message with `audioB64`). Base64 inflates the audio
// by ~33% and costs CPU on both ends. For the real capture path — raw per-
// participant audio from a platform SDK (e.g. Zoom) — the design (docs/meeting-
// bot-design.md §8, §10.1) commits to a BINARY frame envelope instead.
//
// This module is that codec: it packs one ParticipantAudioFrame (see
// capture-source.js) into a compact, self-describing binary envelope and back.
// It is pure and dependency-free (DataView + TextEncoder/TextDecoder, present in
// both Node and Cloudflare Workers), so it is fully offline-testable.
//
// WIRE CONTRACT. This file is duplicated in worker/src/frame-envelope.js and the
// two copies MUST stay byte-for-byte identical, exactly like the duplicated
// PROVENANCE enum (provenance.js). The bot runtime stays an isolated package
// with no dependency on the engine bundle; a cross-decode test
// (scripts/test-bot-envelope.mjs) fails CI if the two copies ever drift.
//
// Layout (little-endian for multi-byte fields), header = 40 bytes:
//   off  size  field
//   0    4     magic  = ASCII "SMCB"
//   4    1     version = 1
//   5    1     provenance code (see PROV_TO_CODE)
//   6    2     reserved (0) — future flags / alignment
//   8    8     tStart      float64 (NaN => null)
//   16   8     tEnd        float64 (NaN => null)
//   24   8     confidence  float64 (NaN => null)
//   32   2     idLen       uint16  — participantId UTF-8 byte length
//   34   2     nameLen     uint16  — displayName  UTF-8 byte length
//   36   4     audioLen    uint32  — audio byte length
//   40   ...   participantId bytes ++ displayName bytes ++ audio bytes

export const ENVELOPE_MAGIC = 'SMCB';
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_HEADER_BYTES = 40;

const MAGIC_BYTES = [0x53, 0x4d, 0x43, 0x42]; // "SMCB"

// Provenance string <-> wire code. Mirrors PROVENANCE in provenance.js /
// worker/src/bot-ingest.js. Codes are append-only; never renumber.
const PROV_TO_CODE = Object.freeze({
  'synthetic': 0,
  'zoom-meeting-sdk': 1,
  'teams': 2,
  'meet': 3,
});
const CODE_TO_PROV = Object.freeze(
  Object.fromEntries(Object.entries(PROV_TO_CODE).map(([k, v]) => [v, k]))
);

const _enc = new TextEncoder();
const _dec = new TextDecoder('utf-8', { fatal: false });

// Encode a ParticipantAudioFrame into a binary envelope (Uint8Array).
// Throws on an unknown provenance, an empty participantId, or non-byte audio —
// malformed input must never be silently turned into a frame.
export function encodeFrameEnvelope(frame) {
  if (!frame || typeof frame !== 'object') throw new Error('envelope: frame must be an object');

  const provCode = PROV_TO_CODE[String(frame.provenance || '')];
  if (provCode === undefined) throw new Error(`envelope: unknown provenance '${frame.provenance}'`);

  const idBytes = _enc.encode(String(frame.participantId || ''));
  if (idBytes.byteLength === 0) throw new Error('envelope: participantId is required');
  if (idBytes.byteLength > 0xffff) throw new Error('envelope: participantId too long');

  const nameBytes = _enc.encode(String(frame.displayName || ''));
  if (nameBytes.byteLength > 0xffff) throw new Error('envelope: displayName too long');

  const audio = frame.frame instanceof Uint8Array ? frame.frame
    : frame.audio instanceof Uint8Array ? frame.audio : null;
  if (!audio) throw new Error('envelope: audio (frame) must be a Uint8Array');

  const total = ENVELOPE_HEADER_BYTES + idBytes.byteLength + nameBytes.byteLength + audio.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  out.set(MAGIC_BYTES, 0);
  view.setUint8(4, ENVELOPE_VERSION);
  view.setUint8(5, provCode);
  view.setUint16(6, 0, true); // reserved
  view.setFloat64(8, numOrNaN(frame.tStart), true);
  view.setFloat64(16, numOrNaN(frame.tEnd), true);
  view.setFloat64(24, numOrNaN(frame.confidence), true);
  view.setUint16(32, idBytes.byteLength, true);
  view.setUint16(34, nameBytes.byteLength, true);
  view.setUint32(36, audio.byteLength, true);

  let o = ENVELOPE_HEADER_BYTES;
  out.set(idBytes, o); o += idBytes.byteLength;
  out.set(nameBytes, o); o += nameBytes.byteLength;
  out.set(audio, o);

  return out;
}

// Decode a binary envelope back into a frame. Throws on any malformation (bad
// magic, unknown version, unknown provenance code, truncation). Callers in the
// engine wrap this in try/catch and DROP the frame on throw, exactly like the
// base64 path did.
export function decodeFrameEnvelope(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes
    : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  if (!buf) throw new Error('envelope: input must be bytes');
  if (buf.byteLength < ENVELOPE_HEADER_BYTES) throw new Error('envelope: truncated header');

  if (buf[0] !== MAGIC_BYTES[0] || buf[1] !== MAGIC_BYTES[1] ||
      buf[2] !== MAGIC_BYTES[2] || buf[3] !== MAGIC_BYTES[3]) {
    throw new Error('envelope: bad magic');
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = view.getUint8(4);
  if (version !== ENVELOPE_VERSION) throw new Error(`envelope: unsupported version ${version}`);

  const provCode = view.getUint8(5);
  const provenance = CODE_TO_PROV[provCode];
  if (provenance === undefined) throw new Error(`envelope: unknown provenance code ${provCode}`);

  const tStart = nanToNull(view.getFloat64(8, true));
  const tEnd = nanToNull(view.getFloat64(16, true));
  const confidence = nanToNull(view.getFloat64(24, true));
  const idLen = view.getUint16(32, true);
  const nameLen = view.getUint16(34, true);
  const audioLen = view.getUint32(36, true);

  const need = ENVELOPE_HEADER_BYTES + idLen + nameLen + audioLen;
  if (buf.byteLength < need) throw new Error('envelope: truncated payload');

  let o = ENVELOPE_HEADER_BYTES;
  const participantId = _dec.decode(buf.subarray(o, o + idLen)); o += idLen;
  const displayName = _dec.decode(buf.subarray(o, o + nameLen)); o += nameLen;
  const frame = buf.slice(o, o + audioLen);

  return { participantId, displayName, frame, tStart, tEnd, provenance, confidence };
}

function numOrNaN(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
function nanToNull(v) { return Number.isNaN(v) ? null : v; }
