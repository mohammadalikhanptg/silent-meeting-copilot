// ---------------------------------------------------------------------------
// BotRuntime — isolated self-hosted meeting-bot skeleton (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// This is the ISOLATED bot-runtime process skeleton. It holds NO core app/db
// credentials: the only secret it is ever given is a short-lived, session-scoped
// bot credential (see credential.js). It wires an adapter → consent gate → hard
// guard → the engine ingestion contract.
//
// In THIS increment it runs ONLY against the FakeAdapter (synthetic audio) and
// performs NO real meeting joins. The `sink` it streams frames to is injected, so
// the runtime can be exercised offline without any network. Wiring a real engine
// WebSocket sink (and a real platform adapter) is a later increment.

import { BOUNDARIES, BOT_IDENTITY } from './capture-source.js';
import { assertCaptureAllowed } from './guard.js';

export class BotRuntime {
  /**
   * @param {Object} opts
   * @param {import('./capture-source.js').MeetingCaptureSource} opts.adapter
   * @param {import('./consent.js').ConsentGate} opts.consentGate
   * @param {string} opts.credential       The session-scoped bot credential (opaque to the runtime).
   * @param {boolean} [opts.flagEnabled]   The operator/engine bot feature flag (default false).
   * @param {(frame:Object) => void|Promise<void>} opts.sink  Receives participant audio frames.
   */
  constructor({ adapter, consentGate, credential, flagEnabled = false, sink }) {
    if (!adapter) throw new Error('BotRuntime: adapter required');
    if (!credential) throw new Error('BotRuntime: session-scoped credential required');
    if (typeof sink !== 'function') throw new Error('BotRuntime: sink function required');
    this.adapter = adapter;
    this.consentGate = consentGate || null;
    this.credential = credential; // session-scoped ONLY; never an app/db secret
    this.flagEnabled = flagEnabled;
    this.sink = sink;
    this.identity = BOT_IDENTITY;
    this.boundaries = BOUNDARIES;
    this._activeSessions = 0;
    this._framesForwarded = 0;
    this._started = false;

    // Forward roster events into the consent evidence log if a gate is present.
    this.adapter.on('participant_join', (e) => {
      if (this.consentGate) this.consentGate.recordJoin(e.participantId, e.displayName);
    });
    this.adapter.on('participant_leave', (e) => {
      if (this.consentGate) this.consentGate.recordLeave(e.participantId);
    });
    // Each captured frame passes the guard before reaching the sink.
    this.adapter.on('participant_audio', (frame) => { this._onFrame(frame); });
  }

  // Start the (synthetic) session: enforce one-active-session, run the hard guard,
  // bind consent to the adapter, and join. Returns the guard decision.
  async start() {
    this._activeSessions++;
    const consent = this.consentGate ? this.consentGate.state() : null;
    const decision = assertCaptureAllowed({
      adapterKind: this.adapter.kind,
      flagEnabled: this.flagEnabled,
      consent,
      boundaries: this.boundaries,
      session: { activeSessions: this._activeSessions },
    });
    if (!decision.ok) {
      this._activeSessions--;
      return decision;
    }
    if (consent) this.adapter.setConsentState(consent);
    this._started = true;
    await this.adapter.join();
    return decision;
  }

  // Guard each frame again at forward time (defence in depth) and stream allowed
  // frames to the injected sink.
  _onFrame(frame) {
    if (!this._started) return;
    const decision = assertCaptureAllowed({
      adapterKind: this.adapter.kind,
      flagEnabled: this.flagEnabled,
      consent: this.consentGate ? this.consentGate.state() : null,
      boundaries: this.boundaries,
      session: { activeSessions: this._activeSessions },
    });
    if (!decision.ok) return;
    this._framesForwarded++;
    this.sink(frame);
  }

  async stop() {
    if (this._started) {
      await this.adapter.leave();
      await this.adapter.teardown();
      this._started = false;
      this._activeSessions = Math.max(0, this._activeSessions - 1);
    }
  }

  stats() { return { framesForwarded: this._framesForwarded, identity: this.identity }; }
}
