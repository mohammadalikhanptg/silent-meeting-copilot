// ---------------------------------------------------------------------------
// FakeAdapter — synthetic per-participant capture source (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// Implements MeetingCaptureSource by REPLAYING a scripted set of synthetic
// per-participant utterances. It joins/leaves/reconnects/teardowns like a real
// adapter and emits the same events, but it never touches a network, a meeting
// platform, or a microphone. provenance is always 'synthetic'.
//
// "Audio" here is a deterministic placeholder byte buffer — enough to exercise
// the ingestion contract end to end. The engine-side transcriber is injected in
// tests, so no real audio decoding happens.

import { MeetingCaptureSource } from './capture-source.js';
import { PROVENANCE } from './provenance.js';

// Marker prefixing the synthetic placeholder buffer. A colon separator (no
// whitespace) keeps the encoding unambiguous. This is NOT real audio and is
// never decoded as audio; an injected test transcriber recovers the text.
const SYNTH_MARKER = 'SYNTH:';

// Build a deterministic, non-empty placeholder "audio" buffer for an utterance.
function synthAudio(text) {
  return new TextEncoder().encode(SYNTH_MARKER + text); // Uint8Array
}

// Recover the scripted text from a synthetic buffer (used by test transcribers).
export function readSynthText(audioBytes) {
  const decoded = new TextDecoder().decode(audioBytes);
  return decoded.startsWith(SYNTH_MARKER) ? decoded.slice(SYNTH_MARKER.length) : decoded;
}

export class FakeAdapter extends MeetingCaptureSource {
  /**
   * @param {Object} opts
   * @param {Array<{participantId:string, displayName:string}>} opts.participants
   * @param {Array<{participantId:string, text:string, tStart?:number, tEnd?:number, confidence?:number}>} opts.script
   */
  constructor({ participants = [], script = [] } = {}) {
    super({ kind: 'fake' });
    this.participants = participants;
    this.script = script;
    this._reconnects = 0;
  }

  async join() {
    this._joined = true;
    for (const p of this.participants) {
      this.emit('participant_join', { participantId: p.participantId, displayName: p.displayName, at: this._now() });
    }
    return { ok: true, identity: 'SMC Recording Bot' };
  }

  // Replay the scripted utterances as participant_audio events. Returns the
  // number of frames emitted. Synchronous emission keeps the synthetic test
  // deterministic (no timers).
  async replay() {
    if (!this._joined) throw new Error('replay() before join()');
    let n = 0;
    for (const u of this.script) {
      const p = this.participants.find((x) => x.participantId === u.participantId) || {};
      /** @type {import('./capture-source.js').ParticipantAudioFrame} */
      const frame = {
        participantId: u.participantId,
        displayName: p.displayName || u.participantId,
        frame: synthAudio(u.text),
        tStart: typeof u.tStart === 'number' ? u.tStart : n * 1000,
        tEnd: typeof u.tEnd === 'number' ? u.tEnd : n * 1000 + 800,
        provenance: PROVENANCE.SYNTHETIC,
        confidence: typeof u.confidence === 'number' ? u.confidence : 1,
      };
      this.emit('participant_audio', frame);
      n++;
    }
    return n;
  }

  async reconnect() {
    this._reconnects++;
    this.emit('reconnected', { count: this._reconnects, at: this._now() });
    return { ok: true, reconnects: this._reconnects };
  }

  async leave() {
    for (const p of this.participants) {
      this.emit('participant_leave', { participantId: p.participantId, at: this._now() });
    }
    this._joined = false;
    return { ok: true };
  }

  async teardown() {
    this._joined = false;
    this.emit('teardown', { at: this._now() });
    return { ok: true };
  }

  // Monotonic-ish synthetic clock; deterministic counter, not wall time.
  _now() { return (this._tick = (this._tick || 0) + 1); }
}
