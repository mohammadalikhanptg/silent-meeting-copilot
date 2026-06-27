# SMC meeting-bot runtime (scaffolding — increment 1)

Self-hosted, pluggable meeting-bot runtime for Silent Meeting Copilot. **This increment is
scaffolding only**: synthetic audio, feature-flagged **off**, **no real meeting joins**.

See `../docs/meeting-bot-design.md` for the full design.

## Posture

- **Isolated, low-privilege process.** Holds **NO core app/db credentials** — only a short-lived,
  session-scoped **bot credential** (`src/credential.js`), which is bound to one SMC session +
  meeting + operator and is single-use / revocable (mirrors the merged H4 engine-token model).
- **Self-hosted, provider-adapter design.** Every platform implements `MeetingCaptureSource`
  (`src/capture-source.js`). The first real adapter will be **Zoom Meeting SDK** (raw
  per-participant audio) — a later increment needing operator Zoom credentials + a Linux host.
- The Electron **helper stays the default** capture source for SMC.

## Modules

| File | Purpose |
|------|---------|
| `src/capture-source.js` | `MeetingCaptureSource` interface, `BOT_IDENTITY`, `BOUNDARIES` |
| `src/fake-adapter.js`   | `FakeAdapter` — replays synthetic per-participant audio (no network) |
| `src/consent.js`        | `ConsentGate` — all-party consent + verifiable evidence record |
| `src/credential.js`     | session-bound bot credential: mint / verify / replay / revoke |
| `src/guard.js`          | runtime hard gate — refuses real capture in this increment |
| `src/index.js`          | `BotRuntime` skeleton wiring adapter → consent → guard → sink |
| `src/provenance.js`     | shared provenance wire contract (`synthetic` only, this increment) |
| `src/frame-envelope.js` | binary participant-frame envelope codec (Bot build 2/N) — efficient successor to base64-in-JSON |

## Hard gate

`REAL_CAPTURE_IMPLEMENTED = false` in both the runtime guard and the engine
(`worker/src/bot-ingest.js`). Real capture is refused outright; only synthetic frames are
processed. The engine flag `BOT_CAPTURE_ENABLED` is off by default and no `/bot/ws` route exists.

## Test

From the repo root:

```
npm run test:bot      # synthetic ingestion (31/31) + binary frame envelope (31/31)
```

The test drives the FakeAdapter through the runtime and the engine ingestion path (with an
injected transcriber, so no Workers AI) to a **participant-labelled transcript**, and verifies the
guard refusals, the credential lifecycle, and the flag-gating.
