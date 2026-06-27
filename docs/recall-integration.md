# Recall.ai integration — design note

Status: **increment 1 of N — flag OFF, no real capture.** This document is the
single design reference for wiring Recall.ai's unified meeting-bot API into the
SMC engine as a Phase-2 feed source. It is additive and dormant: nothing in this
increment can join a meeting or process real participant audio.

## Why Recall.ai

The engine (`smc-engine`, the Cloudflare Worker) is **source-agnostic**: a
session is a stream of speaker/channel-labelled segments. The Electron helper is
one source (ME / OTHERS channels). Recall.ai is a unified bot API across
Zoom / Teams / Meet / Webex that sends a bot into an online meeting and returns
**realtime, per-participant, speaker-named transcription**. That plugs into the
same coach as a new feed source — clean named speakers, no loopback blob — so it
is a feed, not a rebuild. It also closes the gap with note-takers (Fireflies,
Otter) so a customer needs only SMC.

## Region and auth

- **Workspace region:** `eu-central-1` (EU, Frankfurt).
- **Base URL:** `https://eu-central-1.recall.ai/api/v1/` — derived from the
  `RECALL_REGION` var so the same code works across Recall regions.
- **Auth header (exact):** `Authorization: Token <RECALL_API_KEY>`.
- **`RECALL_API_KEY` is a Worker secret** (already set on the Worker). It is read
  from `env` only, used solely in the Authorization header, and is **never**
  logged, echoed, returned, or embedded in any error. It must never appear in
  `wrangler.toml` or any committed file.
- **Webhook verification secret** (`RECALL_WORKSPACE_VERIFICATION_SECRET`, a
  `whsec_...` value) is likewise a secret, never committed.

## Master gate

`RECALL_ENABLED` (a `[vars]` value, default `"false"`) is a **hard master gate**.
The control-plane client (`worker/src/recall-client.js`) throws
`RecallDisabledError` from every method unless `RECALL_ENABLED === "true"`. The
gate is checked **before** any network work, so while OFF no Recall request can
be issued. This is independent of, and additional to, the bot-capture gates
(`BOT_CAPTURE_ENABLED`, `REAL_CAPTURE_IMPLEMENTED`) that guard the engine's
ingestion seam.

## What increment 1 ships (this PR)

All additive, all dormant:

| File | Purpose |
|------|---------|
| `worker/src/recall-client.js` | Region-aware control-plane client (`createBot`/`retrieveBot`/`deleteBot`/`listBots`). Master-gated OFF; key never logged. |
| `worker/src/recall-webhook.js` | `verifyAndParse(headers, rawBody, secret)` — Svix HMAC-SHA256 verification over `${id}.${timestamp}.${body}`, constant-time `v1` compare. Near-pure: no network, no DB. |
| `worker/src/recall-map.js` | Pure functions mapping Recall realtime payloads to the internal `bot_frame` shape. |
| `worker/wrangler.toml` | `[vars]` `RECALL_REGION="eu-central-1"`, `RECALL_ENABLED="false"`. No secret. |
| `scripts/test-recall.mjs` | Offline test suite (`npm run test:recall`). No real network. |

### `bot_frame` shape

`worker/src/bot-ingest.js` (unchanged here) consumes an **audio** frame and runs
it through the transcriber. Recall is different: it **transcribes for us** and
delivers **text** over `transcript.data` events. So a Recall frame is a
text-bearing `bot_frame`:

```
{ participantId, participantName, text, tsStart, tsEnd, isFinal }
```

`recall-map.js` produces exactly this. It does **not** import or modify
`bot-ingest.js`; reconciling a pre-transcribed text frame with the audio-based
ingest seam is increment 2's job.

## Increment ladder

1. **Increment 1 (this PR):** region-aware client (gated OFF), verified inbound
   webhook receiver, and pure payload→`bot_frame` mapping. No wiring, no capture.
2. **Increment 2:** wire `recall-map` output into the bot-ingest path behind the
   existing double gate (`BOT_CAPTURE_ENABLED` + `role==='bot'`), teaching the
   ingest seam to accept a pre-transcribed text frame. Still no real meeting join
   reachable in production.
3. **Increment 3:** add the create-bot control endpoint, in-product **consent**,
   and **self-designation** using the just-merged capture-mode work; persist the
   consent/evidence record; live roster from participant events.
4. **Increment 4:** flip `REAL_CAPTURE_IMPLEMENTED` to `true` **only after**
   consent and **all-party verification** are enforced and security-reviewed.

**Real capture stays OFF until increment 4.** Increments 1–3 cannot, by
construction, process real participant audio: the engine's `REAL_CAPTURE_IMPLEMENTED`
remains `false` and `BOT_CAPTURE_ENABLED` remains `"false"`, and this increment
additionally keeps the Recall client itself gated by `RECALL_ENABLED="false"`.
