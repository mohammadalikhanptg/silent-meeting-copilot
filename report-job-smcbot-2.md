# Job report — job-smcbot-2

**Bot build 1/N: self-hosted meeting-bot scaffolding — synthetic-only, feature-flag OFF**

Author: ali@khan.vg · Branch: `worker/job-smcbot-2` → **PR to `main`** (not merged — orchestrator reviews and merges). Re-dispatch of job-smcbot-1, which reported done with no branch/PR. This increment delivers a live PR with verified work.

Committed architecture honoured: **self-hosted** (not a managed Recall.ai-class API); **provider-adapter** so platforms are pluggable; first real platform (Zoom Meeting SDK raw per-participant audio) is a **later increment** (needs operator Zoom credentials + a Linux host — out of scope); the Electron helper stays the default capture source. Keyless; no audio retention beyond policy; **no real third-party data, no real meeting joins** in this increment.

## Acceptance criteria — per item

### (1) `MeetingCaptureSource` provider-adapter interface + `FakeAdapter`
- **`bot/src/capture-source.js` (new)** — `MeetingCaptureSource` abstract interface: `join` / `leave` / `reconnect` / `teardown`; emits `participant_audio` frames `{participantId, displayName, frame, tStart, tEnd, provenance, confidence}` plus `participant_join` / `participant_leave` roster events; `setConsentState` / `getConsentState`. Declares `BOT_IDENTITY = 'SMC Recording Bot'` and the `BOUNDARIES` policy. Includes a dependency-free `TinyEmitter` so the module runs in any JS runtime.
- **`bot/src/fake-adapter.js` (new)** — `FakeAdapter extends MeetingCaptureSource`, replays a scripted set of synthetic per-participant utterances as `participant_audio` events. No network, no platform, no microphone; `provenance = 'synthetic'`. Exports `readSynthText` so an injected test transcriber can recover the scripted text.

### (2) SessionDO ingests bot-sourced per-participant labelled channels (flag default off)
- **`worker/src/bot-ingest.js` (new)** — pure, import-time dependency-free engine seam: `botCaptureEnabled(env)`, `PROVENANCE`, `assertBotCaptureAllowed(...)`, `normalizeParticipantFrame(...)`, `ingestParticipantFrame(...)`. Turns one participant frame into one **participant-labelled** transcript segment (`channel:'participant'`, `participantId`, `displayName`) by **reusing the existing transcription path** — `transcribeAndClean` is injected, so the seam is offline-testable without Workers AI.
- **`worker/src/session-do.js`** — additive, **flag-gated** `bot_frame` branch in `webSocketMessage` (calls `ingestParticipantFrame` with the real `transcribeAndClean`, broadcasts the participant-labelled segment to browsers). Dormant unless `BOT_CAPTURE_ENABLED` is on; the ME/OTHERS hot path is untouched. Added a `base64ToBytes` helper.
- **`worker/wrangler.toml`** — ships `BOT_CAPTURE_ENABLED = "false"` (only `"true"`/`"1"` enable it).

### (3) In-product consent gate as a hard precondition; consent evidence stored
- **`bot/src/consent.js` (new)** — `ConsentGate`: disclosure text, operator **all-party-consent affirmation** (required before capture), bot identity `SMC Recording Bot`, and a verifiable **evidence record** — timestamp (`affirmedAt`), confirmation text, disclosure method, meeting ref, and the participant **join/leave log**. The evidence contains no audio and no transcript and is structured for independent after-the-fact review.

### (4) Session-bound bot credential (aligned to the merged H4 `used_engine_tokens` model)
- **`bot/src/credential.js` (new)** — `mintBotCredential` / `verifyBotCredential` + `ReplayStore` + `RevocationStore`. Short-lived (`~10 min`), HMAC-SHA256 signed `smcb1_` token bound to **SMC session id + meeting ref + operator**, with `typ='bot-capture'` / `aud='smc-engine-bot'` / `iat/exp/jti`. **Single-use (replay-protected)** via jti; **revocable** by session id (revoking the SMC session invalidates its bot credentials — the H4 semantics) or by jti. This is the self-contained, offline-tested reference of that contract; it is **not** wired into the live app endpoints in this increment (flag off, no real joins). Mapping to H4 is tabulated in `docs/meeting-bot-design.md` §5.

### (5) Isolated bot-runtime skeleton holding NO core app/db credentials
- **`bot/` (new package)** — `package.json` (`type:module`, **zero dependencies**), `README.md`, and **`bot/src/index.js`** `BotRuntime`: wires adapter → consent gate → hard guard → an injected `sink`. It is constructed with only a **session-scoped credential** (never an app/db secret) and forwards each guarded frame to the sink. Roster events flow into the consent evidence log.

### (6) Product boundaries enforced
- `BOUNDARIES` in `capture-source.js`: one operator, one active session, no archive, no admin/cross-account, no search, **no silent auto-join**. Enforced in `bot/src/guard.js` (`assertCaptureAllowed` refuses a 2nd active session and refuses any non-`fake` adapter in this increment), and reflected by the absence of any `/bot/ws` engine route.

### (7) HARD GATE + synthetic-audio demonstration
- **Two independent layers** carry `REAL_CAPTURE_IMPLEMENTED = false` (engine `bot-ingest.js` and runtime `guard.js`): a non-synthetic frame / real adapter is refused **even with the flag on and consent affirmed**. The flag is off by default and **no `/bot/ws` route is exposed**, so no real bot can reach the engine. Synthetic frames are the only thing processed and never open a socket or join a meeting.
- **`scripts/test-bot-synthetic.mjs` (new)** + **`npm run test:bot`** — drives the FakeAdapter through `BotRuntime` and the engine `ingestParticipantFrame` (injected transcriber) to a **participant-labelled transcript** (4 segments, correctly attributed to Alice/Bob), and asserts: real/flag-off/consent-missing refusals; malformed-frame drop; credential mint/verify/replay/revoke/meeting-binding/expiry; one-active-session boundary; the DO branch is gated behind `botCaptureEnabled`; `wrangler.toml` ships the flag off; no `/bot/ws` route.

## Build / checks
- `npm run test:bot` → **31/31 passed**.
- `npm run build` (migrate + `next build`) → **success, exit 0**. No `app/` files changed — the Next surface is untouched; my changes are confined to `worker/`, `bot/`, `scripts/`, and config.
- `node --check` → clean on all 11 changed/new JS files.
- `package-lock.json` reverted after `npm install` (no dependencies added — kept the PR free of lockfile churn).
- A stray null byte introduced into one source string by the editor was found and removed; a null-byte scan over all new files is clean.

## Honest notes for the merge
- **Nothing real runs.** The engine flag is off, there is no `/bot/ws` route, and both guards hard-refuse non-synthetic capture. This increment is pure scaffolding exercised only by synthetic audio.
- The bot **credential** and **consent evidence** are implemented and tested as self-contained modules; **persisting** consent evidence and **wiring** credential mint/validate into the app internal endpoints (against `used_engine_tokens`) are deliberately deferred to the increment that builds real capture, per the brief.
- Out of scope this increment (next): the real **Zoom Meeting SDK** adapter binary + Zoom Marketplace SDK credentials + a Linux host; the binary frame envelope; the consent UI. All gated behind the consent + final security review before any real participant audio is processed.
- Design recorded in **`docs/meeting-bot-design.md`**; runtime overview in **`bot/README.md`**.

## Delivery
- Branch `worker/job-smcbot-2`, all commits authored ali@khan.vg.
- **PR #5:** https://github.com/mohammadalikhanptg/silent-meeting-copilot/pull/5 (open, base `main`, **not merged** — orchestrator reviews and merges).
