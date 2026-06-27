// ---------------------------------------------------------------------------
// Meeting-bot ingestion (engine side) — Bot build 1/N
// ---------------------------------------------------------------------------
//
// The SMC engine is source-agnostic: a session is a set of speaker/channel-
// labelled audio frames that flow through one transcription path. The Electron
// helper supplies two channels (ME / OTHERS); a future self-hosted meeting bot
// supplies one channel PER MEETING PARTICIPANT, each already attributed to a
// named speaker by the platform (e.g. Zoom Meeting SDK raw per-participant
// audio). This module is the engine-side seam that turns one bot participant
// frame into one participant-labelled transcript segment, REUSING the existing
// transcription path.
//
// Posture for THIS increment (do not relax without the gate review):
//   • Feature-flagged OFF by default (BOT_CAPTURE_ENABLED).
//   • Synthetic audio ONLY — no real meeting joins happen anywhere in the engine.
//   • A hard guard refuses real (non-synthetic) capture while preconditions are
//     unmet, AND refuses it outright in this increment because the live capture
//     path is not built yet.
//
// This file is intentionally pure and dependency-free at import time (it never
// touches env.AI at module scope) so it can be unit-tested offline with an
// injected transcriber, exactly like the rest of the engine's testable seams.

// The engine feature flag. Default OFF: anything other than an explicit
// "true" / "1" / boolean true leaves bot ingestion dormant.
export function botCaptureEnabled(env) {
  const v = env && env.BOT_CAPTURE_ENABLED;
  return v === true || v === 'true' || v === '1';
}

// Provenance values the engine recognises. 'synthetic' is the ONLY value this
// increment ever processes; the platform values are declared so the wire
// contract is stable for later increments but are hard-refused below.
export const PROVENANCE = Object.freeze({
  SYNTHETIC: 'synthetic',
  ZOOM_MEETING_SDK: 'zoom-meeting-sdk',
  TEAMS: 'teams',
  MEET: 'meet',
});

// Increment-1 invariant: the engine has NO real per-participant capture path yet.
// Even with the flag on and consent affirmed, a non-synthetic frame is refused.
// Flipping this to true is a deliberate later increment, gated on the consent +
// security review called out in the job brief.
export const REAL_CAPTURE_IMPLEMENTED = false;

// Hard gate. Decides whether a participant frame may be ingested.
//   • synthetic frames: allowed (this is all the increment does) — but the
//     caller must still have constructed them from a Fake/synthetic source.
//   • real frames: refused outright in this increment, and additionally require
//     the flag ON + an affirmed all-party-consent state bound to a meeting +
//     operator before they could ever be processed.
// Returns { ok, mode, reason }.
export function assertBotCaptureAllowed({ env, frame, consentState }) {
  const provenance = frame && frame.provenance;

  if (provenance === PROVENANCE.SYNTHETIC) {
    return { ok: true, mode: 'synthetic' };
  }

  // Everything below is the REAL-capture path.
  if (!REAL_CAPTURE_IMPLEMENTED) {
    return { ok: false, reason: 'real_capture_not_built_in_this_increment' };
  }
  if (!botCaptureEnabled(env)) {
    return { ok: false, reason: 'bot_capture_flag_disabled' };
  }
  if (!consentState || consentState.affirmed !== true) {
    return { ok: false, reason: 'all_party_consent_not_affirmed' };
  }
  if (!consentState.meetingRef) {
    return { ok: false, reason: 'consent_missing_meeting_ref' };
  }
  if (!consentState.operator) {
    return { ok: false, reason: 'consent_missing_operator' };
  }
  return { ok: true, mode: 'live' };
}

// Shape-check a participant frame. Keeps malformed bot input from ever reaching
// the transcriber. Returns a normalised frame or null.
export function normalizeParticipantFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const participantId = String(frame.participantId || '').trim();
  if (!participantId) return null;
  const audio = frame.frame || frame.audio;
  if (!(audio instanceof Uint8Array) || audio.byteLength === 0) return null;
  const confidence = typeof frame.confidence === 'number' ? frame.confidence : null;
  return {
    participantId,
    displayName: String(frame.displayName || '').trim() || participantId,
    frame: audio,
    tStart: Number.isFinite(frame.tStart) ? frame.tStart : null,
    tEnd: Number.isFinite(frame.tEnd) ? frame.tEnd : null,
    provenance: String(frame.provenance || '').trim() || PROVENANCE.SYNTHETIC,
    confidence,
  };
}

// Ingest a single participant frame and produce a participant-labelled transcript
// segment by REUSING the engine transcription path. `transcribe` is injected so
// this is offline-testable; the SessionDO passes the real `transcribeAndClean`.
//
//   transcribe(audioBytes, env, lang, mode) -> { raw, cleaned, provider, ... }
//
// Returns:
//   { ok:true, segment } on success (segment is null when the transcript is empty)
//   { ok:false, reason } when the guard refuses or the frame is malformed.
export async function ingestParticipantFrame(
  { env, frame, consentState, lang = null, mode = 'auto' },
  transcribe
) {
  const norm = normalizeParticipantFrame(frame);
  if (!norm) return { ok: false, reason: 'malformed_frame' };

  const gate = assertBotCaptureAllowed({ env, frame: norm, consentState });
  if (!gate.ok) return { ok: false, reason: gate.reason };

  if (typeof transcribe !== 'function') return { ok: false, reason: 'no_transcriber' };

  const result = await transcribe(norm.frame, env, lang, mode);
  const text = (result && (result.cleaned || result.raw) || '').trim();
  if (!text) {
    return { ok: true, segment: null, mode: gate.mode };
  }

  // Participant-labelled segment. Unlike the helper's ME/OTHERS binary channels,
  // bot channels carry a real per-speaker identity, so the segment is labelled
  // with the participant rather than a fixed me/others slot.
  return {
    ok: true,
    mode: gate.mode,
    segment: {
      type: 'transcript',
      channel: 'participant',
      participantId: norm.participantId,
      displayName: norm.displayName,
      provenance: norm.provenance,
      confidence: norm.confidence,
      tStart: norm.tStart,
      tEnd: norm.tEnd,
      raw: text,
      cleaned: text,
      provider: (result && result.provider) || null,
    },
  };
}
