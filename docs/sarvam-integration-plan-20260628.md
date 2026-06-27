# Sarvam Saaras v3 Integration Plan (SMC transcription quality)

Date: 28 June 2026
Decision: Operator chose Sarvam over Speechmatics. India data residency accepted for own-use dispute audio.

## Target architecture

Live path (coach transcript):
- Engine: Sarvam Saaras v3, streaming WebSocket.
- Mode: `codemix` (natural Hindi-English mixing) for the ME-language transcript. Opus coach already understands Hindi/Urdu/English, so the codemix transcript feeds the coach directly. No separate translate stream needed for coaching.
- language_code: `hi-IN` (or omit for auto). high_vad_sensitivity=true, vad_signals=true.
- Context: the single long-lived socket maintains context natively across the stream. This replaces and is superior to manual chunk-chaining. Operator's larger-chunk idea is absorbed by streaming; nova-3 larger-window stopgap is available but deprioritised.

Record path (minutes, Fireflies-grade):
- Sarvam Batch API over the full recording, post-meeting. Decoupled from the live coach. This is where we match Fireflies on the written record.

## Hard dependency: audio format

- Sarvam streaming accepts ONLY 16kHz PCM (pcm_s16le / pcm_l16 / pcm_raw) or WAV. Base64 frames over WS.
- CURRENT capture is WebM/Opus (worker sends `audio/webm` to `@cf/deepgram/nova-3`, session-do.js ~line 472).
- Therefore capture must change to 16kHz PCM at source:
  - Web app (ME mic): AudioWorklet -> Int16 PCM frames at 16kHz, behind a flag.
  - Helper (OTHERS loopback): emit 16kHz PCM. Needs a helper update + signed reinstall.

## Transport

- Hold one Sarvam WS per session inside SessionDO (DOs can hold WebSockets, hibernation-aware). Relay PCM frames in; parse `data` messages (transcript) and `events` (START_SPEECH/END_SPEECH).
- Reconnect with exponential backoff on close 1006/1011. Do NOT auto-retry on 4xxx (auth/quota) — surface the error.
- Auth: api_subscription_key (Sarvam API key) as a worker secret.

## Flags / config (additive, default off)

- SARVAM_ENABLED (default "false"), SARVAM_MODE="codemix", SARVAM_LANG="hi-IN".
- Keep nova-3 path as English/fallback engine selectable per session.
- New worker secret: SARVAM_API_KEY (secure ingest, never in chat/logs).

## Build order

1. PCM capture in the web app (AudioWorklet) behind flag. No helper needed to prove the path with ME audio.
2. SessionDO Sarvam WS relay + transcript wiring into the existing pipeline.
3. Helper PCM update + signed reinstall (OTHERS loopback) — the heavier lift.
4. Batch record pass for minutes.
5. Head-to-head: run Sarvam (batch) on the 20 June recording, score against the Fireflies ground-truth transcript already saved.

## Blocker

- Sarvam API key required before any runtime test. Operator signs up at sarvam.ai, gets the key, stages it at C:\Users\ali\.ptg\sarvam.key, then secure-ingest to the worker secret store.

## Protocol notes (from docs.sarvam.ai streaming reference, 28 Jun 2026)

- Models: saaras:v3 (recommended). Modes: transcribe / translate / verbatim / translit / codemix.
- Frame = 512 samples (32ms at 16kHz). VAD fine-tuning params available (positive/negative thresholds, min_speech_frames, etc.) if needed.
- STT method transcribe(); STTT (translate) is a separate method/output=English.
