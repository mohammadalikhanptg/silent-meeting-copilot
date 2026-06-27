# Self-hosted meeting-bot — design & increment 1 (Bot build 1/N)

Owner: Mohammad Ali Khan (Pacific Technology Group). Commit author: ali@khan.vg.
Status of this increment: **scaffolding, synthetic-audio only, feature-flagged OFF, no real meeting joins.** Delivered as a PR for orchestrator review/merge.

## 1. Where this fits

SMC's engine is **source-agnostic**: a session is a set of speaker/channel-labelled audio
frames flowing through one transcription path. The Electron **helper** supplies two channels
(ME / OTHERS) and remains the **default** capture source. The meeting bot is an *additional*
feed source for online meetings, where the platform can hand us **clean per-participant audio**
already attributed to a named speaker — better than the loopback OTHERS blob for coaching,
minutes, and the interview vertical.

This supersedes the earlier roadmap note that suggested a managed Recall.ai-class API. The
**committed architecture is self-hosted**, with a provider-adapter so platforms are pluggable.

## 2. Committed architecture (do not deviate)

- **Self-hosted**, not a managed third-party bot API.
- **Provider-adapter pattern**: every platform implements one `MeetingCaptureSource` interface.
- **First real platform: Zoom** via its official **Meeting SDK** (raw per-participant audio).
  That is a **later increment** — it needs operator Zoom Marketplace SDK credentials and a Linux
  host, and is **out of scope here**.
- **Keyless transcription** (reuses the existing Whisper / Deepgram-nova-3-on-Workers-AI path).
- **No audio retention** beyond the existing policy. Bot sessions inherit the short **7-day**
  retention window already wired in `app/lib/retention.js` (`mode_type='bot'`).
- **No real third-party data** is introduced in this increment.

## 3. Components delivered in increment 1

### Isolated bot runtime (`bot/`) — a separate, low-privilege package
- `src/capture-source.js` — `MeetingCaptureSource` interface: `join/leave/reconnect/teardown`,
  emits `participant_audio` frames `{participantId, displayName, frame, tStart, tEnd, provenance,
  confidence}`, roster events, and `getConsentState()`. Declares `BOT_IDENTITY = 'SMC Recording
  Bot'` and the `BOUNDARIES` policy.
- `src/fake-adapter.js` — `FakeAdapter`, a synthetic source replaying scripted per-participant
  utterances. **No network, no platform, no microphone.** `provenance = 'synthetic'`.
- `src/consent.js` — `ConsentGate`: disclosure text, operator **all-party-consent affirmation**,
  and a verifiable **evidence record** (timestamp, confirmation text, disclosure method, meeting
  ref, participant join/leave log). No audio, no transcript in the evidence.
- `src/credential.js` — the **session-bound bot credential** (see §5).
- `src/guard.js` — the runtime-side **hard gate** (see §4).
- `src/index.js` — `BotRuntime` skeleton wiring adapter → consent → guard → an injected `sink`.
  Holds **NO core app/db credentials** — only a session-scoped bot credential.

### Engine side (`worker/`)
- `src/bot-ingest.js` — pure, offline-testable seam: `botCaptureEnabled(env)`,
  `assertBotCaptureAllowed(...)`, `ingestParticipantFrame(...)`. Turns one participant frame into
  one **participant-labelled** transcript segment by **reusing** `transcribeAndClean` (injected,
  so it is testable without Workers AI).
- `src/session-do.js` — an **additive, flag-gated** `bot_frame` branch in `webSocketMessage`.
  Dormant unless `BOT_CAPTURE_ENABLED` is on; the ME/OTHERS hot path is unchanged.
- `wrangler.toml` — ships `BOT_CAPTURE_ENABLED = "false"`.

## 4. Hard gate (the safety invariant)

Two independent layers refuse real capture in this increment:

1. **Engine** (`bot-ingest.js`) and **runtime** (`guard.js`) both carry
   `REAL_CAPTURE_IMPLEMENTED = false`. A non-synthetic frame / real adapter is refused **even
   with the flag on and consent affirmed**, because the live capture path is not built yet.
2. The engine **feature flag** `BOT_CAPTURE_ENABLED` is **OFF** by default (only `"true"`/`"1"`
   enable it), and **no `/bot/ws` route is exposed**, so no real bot can connect to the engine.

Synthetic frames are permitted (they are all this increment does) and never open a socket or join
a meeting. When real capture is later built, flipping `REAL_CAPTURE_IMPLEMENTED` is gated on the
consent + security review called out in the job brief, and additionally requires: flag on,
affirmed all-party consent bound to a meeting + operator.

## 5. Session-bound bot credential (aligns with merged H4)

The bot runtime is low-privilege: its only secret is a short-lived, session-scoped credential.
It deliberately **mirrors the merged H4 engine-token model** (`app/lib/auth.js`
`generateSessionToken`/`verifySessionToken` + the `used_engine_tokens` replay table):

| Property            | Engine token (H4)            | Bot credential (this module)        |
|---------------------|------------------------------|-------------------------------------|
| Prefix              | `smcs1_`                     | `smcb1_`                            |
| Signing             | HMAC-SHA256, keyring kid     | HMAC-SHA256 (secret injected)       |
| Bound to            | app session `sid`            | `sid` **+ meeting ref** **+ operator** |
| Claims              | `typ/aud/iat/exp/jti`        | `typ='bot-capture'`, `aud='smc-engine-bot'`, `iat/exp/jti` |
| Replay protection   | `used_engine_tokens` (jti)   | `ReplayStore` (jti single-use)      |
| Revocation          | revoke app session           | `RevocationStore.revokeSession(sid)` / `revokeCredential(jti)` |
| Lifetime            | ~15 min                      | ~10 min (short-lived)               |

This module is the self-contained, offline-tested **reference** of that contract. It is **not**
wired into the live app endpoints in this increment (flag off, no real joins); when live capture
is built, minting/validation move into the app internal routes against `used_engine_tokens`.

## 6. Consent (hard precondition)

A meeting bot records third parties, so consent is not advisory. `ConsentGate` requires the
operator to be shown the disclosure and to **affirm all-party consent for the session** before
any real capture. The bot presents `SMC Recording Bot` so participants can see a recorder is
present. The evidence record is structured for **independent after-the-fact review** (human or
another system), consistent with SMC's "never taken at its word" principle.

Every session already begins with the in-product compliance acknowledgement (cockpit, Wave 4);
the bot consent gate is the per-meeting, all-party extension of it, mandatory before a real join.

## 7. Product boundaries (enforced)

One operator; one active session; **no archive, no admin/cross-account, no search, no silent
auto-join** (every join needs explicit per-session operator action + affirmed consent). Encoded
in `BOUNDARIES` and enforced by the guard.

## 8. Wire contract (engine ↔ bot)

A participant frame (synthetic in this increment) is delivered to the SessionDO as a `bot_frame`
control message carrying base64 audio plus `{participantId, displayName, tStart, tEnd, provenance,
confidence}`. The engine ingests it only when the flag is on and (for real frames) the hard gate
passes, producing a `transcript` segment with `channel:'participant'` and the participant identity.
The real path will use a binary envelope (not base64-in-JSON) for efficiency — a later increment.

## 9. Verification (this increment)

- `node scripts/test-bot-synthetic.mjs` (`npm run test:bot`) → **31/31**. Drives the FakeAdapter
  through the runtime and the engine ingestion (injected transcriber) to a **participant-labelled
  transcript**; asserts the hard guard refuses real/flag-off/consent-missing capture; exercises the
  credential mint/verify/replay/revoke; checks the flag defaults off and the DO branch is gated.
- `npm run build` → success (exit 0). No `app/` files changed; the Next surface is untouched.
- `node --check` clean on every changed/new JS file.

## 10. Next increments (out of scope here)

1. Zoom Meeting SDK adapter (raw per-participant audio) — needs operator Zoom SDK credentials +
   a Linux host; binary frame envelope; the real `/bot/ws` engine route with bot-credential auth.
2. Wire the bot credential mint/validate into the app internal endpoints against `used_engine_tokens`.
3. In-product consent UI + persistence of the consent evidence record.
4. Bot session lifecycle in the cockpit (create from a meeting link, join, leave).
Each gated behind the consent + final security review before real participant audio is processed.
