// ---------------------------------------------------------------------------
// MeetingCaptureSource — provider-adapter interface (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// Committed architecture: the SMC meeting bot is SELF-HOSTED (not a managed
// Recall.ai-class API). Each online-meeting platform is a pluggable provider
// behind this one interface, so the runtime never knows which platform it is
// talking to. The FIRST real provider will be Zoom via its official Meeting SDK
// (raw per-participant audio) — a later increment that needs operator Zoom
// credentials and a Linux host, and is OUT OF SCOPE here.
//
// The Electron helper remains the DEFAULT capture source for SMC. The bot is an
// additional, opt-in source for online meetings where the platform can hand us
// clean per-participant audio.
//
// A concrete adapter MUST:
//   • implement join / leave / reconnect / teardown
//   • emit 'participant_audio' events carrying ParticipantAudioFrame objects
//   • emit 'participant_join' / 'participant_leave' roster events
//   • expose its consent state via getConsentState()
//   • declare its kind ('fake' for synthetic; a platform id for real adapters)

// Fixed identity the bot presents in every meeting. All-party transparency:
// participants must be able to see that a recording bot is present.
export const BOT_IDENTITY = 'SMC Recording Bot';

// Product boundaries enforced across the bot runtime. These are deliberate
// limits, not TODOs: one operator, one active session, and no surveillance-style
// behaviours. The guard and runtime read these.
export const BOUNDARIES = Object.freeze({
  oneOperator: true,        // a runtime instance serves exactly one operator account
  oneActiveSession: true,   // exactly one active SMC session at a time
  noArchive: true,          // the bot keeps no archive of meetings it has joined
  noAdmin: true,            // the bot has no admin/cross-account capability
  noSearch: true,           // the bot exposes no search over captured content
  noSilentAutoJoin: true,   // never auto-joins; every join needs explicit per-session operator action + consent
});

/**
 * @typedef {Object} ParticipantAudioFrame
 * @property {string}     participantId  Stable per-participant id within the meeting.
 * @property {string}     displayName    Human label from the platform roster.
 * @property {Uint8Array} frame          Complete audio-file bytes for this slice.
 * @property {number}     tStart         ms since session start — frame start.
 * @property {number}     tEnd           ms since session start — frame end.
 * @property {string}     provenance     'synthetic' | 'zoom-meeting-sdk' | ...
 * @property {number}     confidence     0..1 source confidence in the attribution.
 */

/**
 * @typedef {Object} ConsentState
 * @property {boolean} affirmed         Operator affirmed all-party consent for THIS session.
 * @property {string}  disclosureMethod How participants were told (e.g. 'in-meeting-announcement').
 * @property {string}  meetingRef       Opaque reference to the meeting.
 * @property {string}  operator         Operator account (email) that affirmed.
 * @property {number}  affirmedAt       Epoch ms of affirmation.
 */

// Minimal synchronous event emitter (no Node 'events' dependency, so this module
// runs unchanged in any JS runtime). Listeners are invoked in registration order.
export class TinyEmitter {
  constructor() { this._listeners = new Map(); }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }
  emit(event, payload) {
    const fns = this._listeners.get(event);
    if (!fns) return false;
    for (const fn of fns.slice()) { try { fn(payload); } catch (_) {} }
    return true;
  }
}

// Abstract base. Concrete adapters extend this and override the lifecycle methods.
// The base intentionally throws for the lifecycle so a half-built adapter fails
// loudly rather than silently doing nothing.
export class MeetingCaptureSource extends TinyEmitter {
  constructor({ kind = 'abstract' } = {}) {
    super();
    this.kind = kind;
    /** @type {ConsentState|null} */
    this._consent = null;
    this._joined = false;
  }

  // Bind the affirmed consent state before any join. The runtime/guard refuses
  // capture unless this is present for real adapters.
  setConsentState(consent) { this._consent = consent || null; return this; }

  /** @returns {ConsentState|null} */
  getConsentState() { return this._consent; }

  // Lifecycle — adapters MUST override.
  async join() { throw new Error('join() not implemented'); }
  async leave() { throw new Error('leave() not implemented'); }
  async reconnect() { throw new Error('reconnect() not implemented'); }
  async teardown() { throw new Error('teardown() not implemented'); }
}
