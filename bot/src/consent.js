// ---------------------------------------------------------------------------
// ConsentGate — in-product consent as a HARD precondition (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// A meeting bot records third parties, so consent is not advisory: NO capture
// may begin until the operator has been shown the disclosure and has affirmed
// that all parties consent for THIS session. The bot also presents a visible
// identity ('SMC Recording Bot') so participants can see a recorder is present.
//
// The gate produces a verifiable CONSENT EVIDENCE record — timestamp, the exact
// confirmation, the disclosure method, the meeting reference, and the live
// participant join/leave log — so the basis for capture can be independently
// reviewed after the fact. The system never needs to be taken at its word.

import { BOT_IDENTITY } from './capture-source.js';

export const DISCLOSURE_TEXT =
  'This meeting will be joined by "SMC Recording Bot", which captures per-participant ' +
  'audio for live assistance and post-meeting notes. Everyone present should be informed ' +
  'and consent. You confirm that you have lawful basis and all-party consent to record and ' +
  'analyse this meeting; ensuring compliance with local law is your responsibility.';

export const DISCLOSURE_METHODS = Object.freeze({
  IN_MEETING_ANNOUNCEMENT: 'in-meeting-announcement',
  BOT_DISPLAY_NAME: 'bot-display-name',
  CALENDAR_NOTICE: 'calendar-notice',
});

export class ConsentGate {
  /**
   * @param {Object} opts
   * @param {string} opts.operator   Operator account (email).
   * @param {string} opts.meetingRef Opaque meeting reference.
   * @param {() => number} [opts.clock] Injectable clock (epoch ms) for deterministic tests.
   */
  constructor({ operator, meetingRef, clock } = {}) {
    this.operator = operator || '';
    this.meetingRef = meetingRef || '';
    this._clock = typeof clock === 'function' ? clock : () => Date.now();
    this._affirmed = false;
    this._affirmedAt = null;
    this._disclosureMethod = null;
    this._confirmationText = null;
    this._roster = []; // { participantId, displayName?, event:'join'|'leave', at }
    this.botIdentity = BOT_IDENTITY;
  }

  // The disclosure shown to the operator before they may affirm.
  disclosure() { return DISCLOSURE_TEXT; }

  // Operator affirms all-party consent for this session. Required before capture.
  affirm({ confirmationText, disclosureMethod }) {
    if (!this.operator) throw new Error('consent affirm: missing operator');
    if (!this.meetingRef) throw new Error('consent affirm: missing meetingRef');
    if (!confirmationText || typeof confirmationText !== 'string') {
      throw new Error('consent affirm: missing confirmationText');
    }
    const method = disclosureMethod || DISCLOSURE_METHODS.BOT_DISPLAY_NAME;
    this._affirmed = true;
    this._affirmedAt = this._clock();
    this._disclosureMethod = method;
    this._confirmationText = confirmationText;
    return this.state();
  }

  // Record a participant join/leave for the evidence log.
  recordJoin(participantId, displayName) {
    this._roster.push({ participantId, displayName: displayName || participantId, event: 'join', at: this._clock() });
  }
  recordLeave(participantId) {
    this._roster.push({ participantId, event: 'leave', at: this._clock() });
  }

  // The ConsentState consumed by the engine hard guard.
  state() {
    return {
      affirmed: this._affirmed === true,
      disclosureMethod: this._disclosureMethod,
      meetingRef: this.meetingRef,
      operator: this.operator,
      affirmedAt: this._affirmedAt,
    };
  }

  isAffirmed() { return this._affirmed === true; }

  // The verifiable evidence record, structured for independent after-the-fact
  // review (human or another system). Contains no audio and no transcript.
  evidence() {
    return {
      botIdentity: this.botIdentity,
      operator: this.operator,
      meetingRef: this.meetingRef,
      affirmed: this._affirmed === true,
      affirmedAt: this._affirmedAt,
      disclosureMethod: this._disclosureMethod,
      disclosureText: DISCLOSURE_TEXT,
      confirmationText: this._confirmationText,
      participantLog: this._roster.slice(),
    };
  }
}
