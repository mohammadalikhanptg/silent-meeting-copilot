// Binary frame-envelope codec test (Bot build 2/N).
//
// The increment-1 bot wire path carried per-participant audio as base64-in-JSON
// (the `bot_frame` control message, `audioB64`). The design doc (docs/meeting-
// bot-design.md §8, §10.1) calls for a BINARY frame envelope "not base64-in-JSON"
// for the real capture path, for efficiency on raw per-participant audio.
//
// This suite proves, fully offline (synthetic only, no network, no Workers AI):
//   1. The envelope round-trips every field with full fidelity, incl. null
//      sentinels and non-ASCII display names.
//   2. The bot-runtime codec and the engine codec agree on the wire bytes
//      (cross-decode both directions) — the contract is stable across the two
//      isolated copies, exactly as the duplicated PROVENANCE enum is.
//   3. The binary envelope avoids base64 inflation (it is smaller than the
//      equivalent base64-in-JSON message).
//   4. Malformed envelopes (bad magic / version / truncation / unknown
//      provenance) are rejected by a throw, so the engine drops the frame.
//   5. A decoded envelope plugs straight into the existing engine ingestion seam
//      (`ingestParticipantFrame`) to produce a participant-labelled segment.
//   6. The SessionDO binary bot-envelope branch is gated behind role==='bot' +
//      botCaptureEnabled, and the helper ME/OTHERS binary path is untouched.
//
// Run: node scripts/test-bot-envelope.mjs   (chained into `npm run test:bot`)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  encodeFrameEnvelope as botEncode,
  decodeFrameEnvelope as botDecode,
  ENVELOPE_MAGIC, ENVELOPE_VERSION, ENVELOPE_HEADER_BYTES,
} from '../bot/src/frame-envelope.js';
import {
  encodeFrameEnvelope as engEncode,
  decodeFrameEnvelope as engDecode,
} from '../worker/src/frame-envelope.js';
import {
  ingestParticipantFrame, PROVENANCE,
} from '../worker/src/bot-ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
}
function section(t) { console.log('\n' + t); }
function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

await (async function main() {
  // ── 1. Round-trip fidelity ───────────────────────────────────────────────
  section('Test 1: envelope round-trips every field');

  const audio = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 250, 0, 255]);
  const frame = {
    participantId: 'p-2',
    displayName: 'Bob (Candidate)',
    frame: audio,
    tStart: 1234.5,
    tEnd: 5678.25,
    provenance: PROVENANCE.SYNTHETIC,
    confidence: 0.875,
  };

  const env = botEncode(frame);
  ok(env instanceof Uint8Array, 'encode returns a Uint8Array');
  const back = botDecode(env);
  ok(back.participantId === 'p-2', 'participantId round-trips');
  ok(back.displayName === 'Bob (Candidate)', 'displayName round-trips');
  ok(bytesEqual(back.frame, audio), 'audio bytes round-trip exactly');
  ok(back.tStart === 1234.5, 'tStart round-trips');
  ok(back.tEnd === 5678.25, 'tEnd round-trips');
  ok(back.provenance === PROVENANCE.SYNTHETIC, 'provenance round-trips');
  ok(Math.abs(back.confidence - 0.875) < 1e-12, 'confidence round-trips');

  // ── 2. Null sentinels + non-ASCII ────────────────────────────────────────
  section('Test 2: null fields and non-ASCII names');

  const frame2 = {
    participantId: 'p-9',
    displayName: 'Zoë 候选人',           // Zoë 候选人
    frame: new Uint8Array([9]),
    tStart: null, tEnd: null, provenance: PROVENANCE.SYNTHETIC, confidence: null,
  };
  const back2 = botDecode(botEncode(frame2));
  ok(back2.tStart === null, 'missing tStart decodes to null (NaN sentinel)');
  ok(back2.tEnd === null, 'missing tEnd decodes to null');
  ok(back2.confidence === null, 'missing confidence decodes to null');
  ok(back2.displayName === 'Zoë 候选人', 'non-ASCII UTF-8 display name round-trips');

  // ── 3. Cross-implementation wire agreement ───────────────────────────────
  section('Test 3: bot codec and engine codec agree on the wire bytes');

  ok(bytesEqual(botEncode(frame), engEncode(frame)), 'bot and engine encode identical bytes');
  const fromBotOnEngine = engDecode(botEncode(frame));
  ok(fromBotOnEngine.participantId === 'p-2' && bytesEqual(fromBotOnEngine.frame, audio),
    'engine decodes a bot-encoded envelope');
  const fromEngineOnBot = botDecode(engEncode(frame));
  ok(fromEngineOnBot.displayName === 'Bob (Candidate)' && fromEngineOnBot.tEnd === 5678.25,
    'bot decodes an engine-encoded envelope');

  // ── 4. Binary efficiency (no base64 inflation) ───────────────────────────
  section('Test 4: binary envelope beats base64-in-JSON size');

  const bigAudio = new Uint8Array(4096).map((_, i) => i & 0xff);
  const bigFrame = { ...frame, frame: bigAudio };
  const binLen = botEncode(bigFrame).byteLength;
  // The equivalent base64-in-JSON control message the old path sent:
  const b64 = Buffer.from(bigAudio).toString('base64');
  const jsonMsg = JSON.stringify({
    type: 'bot_frame', participantId: bigFrame.participantId, displayName: bigFrame.displayName,
    tStart: bigFrame.tStart, tEnd: bigFrame.tEnd, provenance: bigFrame.provenance,
    confidence: bigFrame.confidence, audioB64: b64,
  });
  ok(binLen < jsonMsg.length, `binary envelope (${binLen}B) smaller than base64-JSON (${jsonMsg.length}B)`);
  ok(binLen === ENVELOPE_HEADER_BYTES + Buffer.byteLength(bigFrame.participantId) +
      Buffer.byteLength(bigFrame.displayName) + bigAudio.byteLength,
    'envelope length = header + idLen + nameLen + audioLen (no padding/inflation)');

  // ── 5. Malformed envelopes are rejected by a throw ───────────────────────
  section('Test 5: malformed envelopes throw (engine drops the frame)');

  function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

  const good = botEncode(frame);

  const badMagic = good.slice();
  badMagic[0] = 0x00;
  ok(throws(() => botDecode(badMagic)), 'bad magic throws');

  const badVersion = good.slice();
  badVersion[4] = 0x7f;
  ok(throws(() => botDecode(badVersion)), 'unknown version throws');

  ok(throws(() => botDecode(good.slice(0, ENVELOPE_HEADER_BYTES - 1))), 'truncated header throws');
  ok(throws(() => botDecode(good.slice(0, good.byteLength - 3))), 'truncated payload throws');

  const badProv = good.slice();
  badProv[5] = 0x63;        // provenance code that maps to nothing
  ok(throws(() => botDecode(badProv)), 'unknown provenance code throws');

  ok(throws(() => botEncode({ ...frame, provenance: 'totally-unknown' })),
    'encode rejects an unknown provenance string');
  ok(throws(() => botEncode({ ...frame, participantId: '' })),
    'encode rejects an empty participantId');

  ok(ENVELOPE_MAGIC === 'SMCB' && ENVELOPE_VERSION === 1, 'magic/version constants exposed');

  // ── 6. Decoded envelope plugs into the engine ingestion seam ─────────────
  section('Test 6: decoded envelope -> participant-labelled transcript segment');

  function fakeTranscribe(audioBytes) {
    // Recover a text marker the test wrote into the audio bytes.
    return { raw: new TextDecoder().decode(audioBytes), cleaned: new TextDecoder().decode(audioBytes), provider: 'fake' };
  }
  const speech = new TextEncoder().encode('I led the billing migration.');
  const wireBytes = engEncode({
    participantId: 'p-2', displayName: 'Bob (Candidate)', frame: speech,
    tStart: 0, tEnd: 1000, provenance: PROVENANCE.SYNTHETIC, confidence: 0.9,
  });
  const decoded = engDecode(wireBytes);
  const out = await ingestParticipantFrame(
    { env: { BOT_CAPTURE_ENABLED: 'true' }, frame: decoded, consentState: null, lang: null, mode: 'auto' },
    fakeTranscribe
  );
  ok(out.ok && out.segment && out.segment.channel === 'participant', 'ingestion yields a participant segment');
  ok(out.segment.participantId === 'p-2' && out.segment.displayName === 'Bob (Candidate)', 'segment carries the decoded identity');
  ok(out.segment.raw === 'I led the billing migration.', 'transcript text flows from the decoded envelope');

  // ── 7. SessionDO gating is structurally intact ───────────────────────────
  section('Test 7: SessionDO binary bot-envelope branch is gated, hot path untouched');

  const doSrc = readFileSync(join(__dirname, '..', 'worker', 'src', 'session-do.js'), 'utf8');
  ok(/decodeFrameEnvelope/.test(doSrc) && /frame-envelope\.js/.test(doSrc),
    'SessionDO imports the engine frame-envelope decoder');
  ok(/role === 'bot'[\s\S]{0,200}botCaptureEnabled\(this\.env\)/.test(doSrc),
    'binary bot-envelope branch is gated behind role===bot + botCaptureEnabled');
  ok(/byte 0 = speaker \(0 me, 1 others\)/.test(doSrc),
    'helper ME/OTHERS binary path (byte0 speaker) is still present and unchanged');

  // ── summary ──
  console.log('\n' + '─'.repeat(60));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('SOME TESTS FAILED ❌'); process.exit(1); }
  console.log('All tests passed ✅');
})();
