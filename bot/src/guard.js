// ---------------------------------------------------------------------------
// Capture guard — the runtime-side HARD GATE (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// Mirrors the engine-side hard guard (worker/src/bot-ingest.js). Belt and braces:
// the runtime refuses to begin REAL capture unless every precondition is met, and
// — in this increment — refuses real capture outright because the live capture
// path is not built. Only the synthetic FakeAdapter is permitted to produce frames.

// Increment-1 invariant: no real per-participant capture path exists yet. Flipping
// this is a deliberate later increment, gated on the consent + security review.
export const REAL_CAPTURE_IMPLEMENTED = false;

/**
 * @param {Object} p
 * @param {string}  p.adapterKind  'fake' for synthetic; a platform id for real adapters.
 * @param {boolean} p.flagEnabled  Operator/engine bot feature flag.
 * @param {Object|null} p.consent  ConsentState (must be affirmed for real capture).
 * @param {Object} [p.boundaries]  BOUNDARIES policy.
 * @param {Object} p.session       { activeSessions:number } for one-active-session enforcement.
 * @returns {{ ok:boolean, mode?:string, reason?:string }}
 */
export function assertCaptureAllowed({ adapterKind, flagEnabled, consent, boundaries, session }) {
  // Product boundary: exactly one active SMC session.
  if (boundaries && boundaries.oneActiveSession && session && session.activeSessions > 1) {
    return { ok: false, reason: 'more_than_one_active_session' };
  }

  // Synthetic capture is the ONLY thing this increment performs. It never opens a
  // network socket or joins a real meeting.
  if (adapterKind === 'fake') {
    return { ok: true, mode: 'synthetic' };
  }

  // Real-capture path — fully gated.
  if (!REAL_CAPTURE_IMPLEMENTED) {
    return { ok: false, reason: 'real_capture_not_built_in_this_increment' };
  }
  if (!flagEnabled) {
    return { ok: false, reason: 'bot_capture_flag_disabled' };
  }
  // Boundary: never auto-join silently — a real join requires affirmed consent
  // captured per session (no standing/implicit consent).
  if (!consent || consent.affirmed !== true) {
    return { ok: false, reason: 'all_party_consent_not_affirmed' };
  }
  if (!consent.meetingRef) return { ok: false, reason: 'consent_missing_meeting_ref' };
  if (!consent.operator) return { ok: false, reason: 'consent_missing_operator' };

  return { ok: true, mode: 'live' };
}
