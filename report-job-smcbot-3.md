# Job report — job-smcbot-3

**Bot build 2/N: binary participant-frame envelope — synthetic-only, feature-flag OFF**

Author: ali@khan.vg · Branch: `worker/job-smcbot-3` → **PR #7 to `main`** (open, not merged — orchestrator reviews and merges). Continues the bot track after build 1/N (PR #5, merged).

Committed architecture honoured: **self-hosted** (not a managed Recall.ai-class API); **provider-adapter** so platforms are pluggable; the real Zoom Meeting SDK adapter remains a later increment (needs operator Zoom credentials + a Linux host). Keyless; no audio retention beyond policy; **no real third-party data, no real meeting joins, no `/bot/ws` route** in this increment.

## What this increment delivers

A compact, self-describing **binary frame envelope** — the wire encoding the *real* per-participant capture path will use, replacing base64-in-JSON's ~33% size inflation and its encode/decode CPU on raw audio. Build 1/N's base64-in-JSON `bot_frame` is kept for control parity and tests; this adds the binary form alongside it.

### Format
- Magic `SMCB`, version 1, **40-byte little-endian header** + UTF-8 `participantId` / `displayName` + raw audio.
- Carries `tStart` / `tEnd` / `confidence` with a **NaN sentinel decoding to `null`**, plus a numeric **provenance code**.

### Files
- **`bot/src/frame-envelope.js` (new)** — runtime encoder/decoder.
- **`worker/src/frame-envelope.js` (new)** — engine decoder. Kept **byte-for-byte identical** to the runtime codec, mirroring the existing duplicated `PROVENANCE` enum, with a cross-decode test guarding against drift.
- **`worker/src/session-do.js`** — a binary WS message is interpreted as a bot envelope **only** for a `role==='bot'` connection (no such route exists in production) **and only when `BOT_CAPTURE_ENABLED` is on**. The helper ME/OTHERS binary path (byte 0 = speaker) is **untouched**. A malformed envelope is dropped, exactly like a malformed base64 frame.
- **`scripts/test-bot-envelope.mjs` (new)** + `npm run test:bot` now runs synthetic **and** envelope suites.
- Docs: `docs/meeting-bot-design.md` §8 (wire contract), `bot/README.md`, `ROADMAP.md`.

## Safety invariants (unchanged from build 1/N)
- Flag `BOT_CAPTURE_ENABLED` ships `"false"`; only `"true"`/`"1"` enable the dormant branch.
- **No `/bot/ws` route** is exposed — nothing real can connect to the engine.
- Both hard gates (`REAL_CAPTURE_IMPLEMENTED = false`, engine + runtime) still refuse any non-synthetic frame even with the flag on and consent affirmed.
- `app/` surface untouched — changes confined to `bot/`, `worker/`, `scripts/`, `docs/`, and config.

## Build / checks
- `npm run test:bot` → synthetic **31/31** + envelope **31/31** passed. Envelope suite covers: round-trip fidelity (incl. null sentinels and non-ASCII display names); cross-implementation byte agreement (bot ↔ engine, both directions); binary < base64-JSON size; malformed-frame rejection (bad magic / unknown version / truncated header / truncated payload / unknown provenance code); encode-side rejection (unknown provenance string, empty participantId); decoded-envelope → participant-labelled transcript segment; and the SessionDO gating structural check (decoder imported, branch gated behind `role==='bot'` + `botCaptureEnabled`, helper binary path intact).
- `node --check` → clean on all changed/new JS files.
- Zero new dependencies; no lockfile churn.

## Delivery notes
- Rebased the single bot-2/N commit cleanly onto current `origin/main` (which had advanced by one unrelated helper version-bump commit; **zero file overlap** with the bot change) so PR #7 merges linearly and conflict-free.
- **Nothing real runs.** The flag is off, there is no `/bot/ws` route, and both guards hard-refuse non-synthetic capture. This increment is pure scaffolding exercised only by synthetic audio and offline round-trip tests.

## Out of scope this increment (next, all gated behind the consent + final security review before any real participant audio)
1. Real **Zoom Meeting SDK** adapter binary that carries this envelope — operator Zoom Marketplace SDK credentials + a Linux host + the real `/bot/ws` engine route with bot-credential auth.
2. Wire the bot credential mint/validate into the app internal endpoints against `used_engine_tokens`.
3. In-product consent UI + persistence of the consent evidence record.
4. Bot session lifecycle in the cockpit.

## Delivery
- Branch `worker/job-smcbot-3`, commit authored ali@khan.vg.
- **PR #7:** https://github.com/mohammadalikhanptg/silent-meeting-copilot/pull/7 (open, base `main`, **not merged** — orchestrator reviews and merges).
