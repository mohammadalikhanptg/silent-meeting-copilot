# Silent Meeting Copilot - Framework and Roadmap

Owner: Mohammad Ali Khan (Pacific Technology Group)
Status: in active build. Living document - the single source of truth for this project. Keep updated as work progresses.
Last updated: 2026-06-22

This document exists so that if a chat ends, the next chat (or person) can resume with zero data loss.

## 1. What it is
A tool that silently assists the user during live conversations (disputes, negotiations, supplier
calls, difficult business conversations, and customer-support style calls). It never speaks. It
listens to both sides, shows on-screen text guidance, and helps the user respond well and stay on
their own strategy. Born from a one-off family/business dispute meeting, but built as a durable,
commercialisable product, not for a single meeting.

## 2. Core principles
- Fair, lawful use only. Not a covert "cheating" tool. Marketing never uses "undetectable".
- Privacy-first / local-first leanings. Audio is captured locally and processed in the user's own
  cloud account.
- Any business or multi-party use ships with an audible "this call is recorded and AI-assisted" notice.
- Honest by design: never coach on misheard content as if certain; flag uncertainty.

## 3. Architecture (three parts)
1. Helper (desktop): a small Electron app on the user's machine. Captures the microphone (ME) and the
   system speaker output (OTHERS) as two separate streams. Resamples to 16 kHz mono. Streams both
   outbound to the engine over a secure WebSocket. Pairs to the web login, reports its version,
   auto-updates, shows a green connected status. It has no real UI of its own beyond device pick and
   meters; it only captures and streams.
2. Web app (hosted on Vercel): everything the user sees and logs into. The four-panel screen, account,
   settings, context-pack management. Receives live transcripts and coaching from the engine.
3. Engine (Cloudflare): receives audio from the helper, runs transcription and the coaching, and pushes
   results to the web app. Helper and browser never talk directly; they meet in the Cloudflare account,
   keyed to the logged-in user.

Why device-level capture: it is provider-agnostic. Works on Zoom, Teams, Meet, a 3CX softphone, any
VOIP, or in person, because it captures sound, not a meeting API. This is the core differentiator.

## 4. Stack decisions and rationale
- Helper = Electron (decided 2026-06-22). Electron grants Windows system loopback audio via
  setDisplayMediaRequestHandler with audio:'loopback', no screen-share prompt, no hacks. Keeps the whole
  product in one language (JS/TS) with the web app. Turnkey code-signing and auto-update. Only cost is
  install size, irrelevant here. Chosen on merits, not to keep any third-party door open.
- NOT Recall.ai. Their Desktop SDK gives a combined stream (no separate ME/OTHERS), is weakest exactly
  in the softphone/in-person case, routes audio through their cloud before ours, is Electron/npm only,
  and charges per hour. We already proved cleaner two-stream capture ourselves. Revisit only if we ever
  need maintained cross-platform (esp. Apple Silicon) capture at commercial scale. Operator decision:
  do not use third-party capture; build our own.
- NOT a pure browser app. Browsers cannot capture the default output device; the only route is
  screen-share-with-audio, which is Chrome/Edge desktop only, not silent, and fails for softphones.
- Web on Vercel; realtime engine on Cloudflare (Vercel is not built for long-lived audio streams).
- No GPU purchase needed: the heavy lifting is in Cloudflare; the local machine only captures.
- Windows first. Mac/Linux later (Mac capture is the genuinely hard part and is deferred).

## 5. Capture (PROVEN 2026-06-22)
Electron spike at helper-spike/ captured microphone and system loopback as two independent streams with
live level meters, on ALISTUDYPC. First attempt failed because loopback was attached to a screen-video
source and Windows Graphics Capture returned access-denied. Fix: attach loopback audio to the app's own
window frame (callback({ video: request.frame, audio: 'loopback' })), discard the video track, keep the
loopback audio. Confirmed working: ME bar and OTHERS bar move independently from real mic and Zoom audio.

## 6. Transcription pipeline (quality-critical)
The two streams are transcribed SEPARATELY (never mixed), so ME and OTHERS stay distinct for the two
coaching functions.

Key risk (raised by operator 2026-06-22): real-world audio is noisy. Depending on mic, speaker, and
caller quality, and with bilingual Hindi/English code-switching, transcripts can be partly garbled. If a
10-word sentence comes through with 2 to 4 unclear words, coaching quality collapses if we coach on the
garbled text.

Answer / design:
- STT models do SOME context completion (Whisper-family decoders predict plausible words within their
  window) but cannot be relied on to reconstruct genuinely unclear speech, and Whisper can hallucinate on
  unclear or near-silent audio. So we do NOT rely on the STT alone.
- We use a best-in-class multilingual STT for the raw transcript, with per-word confidence scores.
  Candidates on Cloudflare: Deepgram nova-3 (fast streaming, multilingual, lower hallucination),
  whisper-large-v3-turbo (strong context, more hallucination risk), and GPT-4o-transcribe (best word
  error rate and language recognition, latency/cost to check). Final pick to be confirmed by a short
  bilingual benchmark when wiring.
- We ADD a context-aware repair/normalisation layer (the "review layer" the operator described). On each
  completed utterance, a fast LLM takes the raw transcript plus the context pack and the rolling
  conversation, reconstructs low-confidence spans into the most likely intended sentence, normalises
  Hindi/English code-switching and transliteration (Devanagari vs Roman), and labels anything it is
  unsure of. Coaching then runs on the cleaned, confidence-aware text, never on raw garble.
- Latency control: run repair only on completed utterances and only when confidence is low; use a fast
  small model; keep prompts terse. This is event-driven, not a constant loop.
- This repair layer is an explicit component we build. It is not automatic inside the STT.

## 7. Coaching (two functions)
Event-driven on utterance boundaries, debounced, terse, grounded in the context pack.
- Respond-to-them: on an OTHERS utterance -> suggested line / question / risk / do-not-say warning.
- Check-my-delivery: on a ME utterance -> alignment verdict vs the user's strategy and vs what the other
  side just said. Confirms when on track; warns when drifting, being baited, over-conceding, or nearing a
  self-defined red line. This live self-alignment coaching is the product's strongest unique angle; no
  shipping competitor does it.

## 8. Context pack
User-supplied grounding: case context, red lines, do-not-say, meeting strategy, evidence summary,
business context, people and entities. Evidence is highest-confidence; live transcript claims are
unverified. Later: ingest PDFs and folders, and capture context by voice/chat before a call. Real packs
stay local and gitignored; only the example pack ships.

## 9. UI
Four panels: OTHERS transcript, ME transcript, "Respond to them", "Your delivery". Plus input/output
device dropdowns, two live sound meters (one per channel), and a start-of-meeting language hint
(English / Hindi / Auto). No button grid. A small prepared-lines menu may be kept as an offline fallback.

## 10. Multilingual
Multilingual STT with a start hint; tolerant of code-switching; the repair layer and coaching LLM cope
with mixed language. Whisper outputs Devanagari for Hindi; plan to present Roman Hindi where useful.

## 11. Per-meeting log
A markdown companion log per meeting (both transcripts, suggestions, alignment notes, timestamps),
designed to sit beside the user's Fireflies transcript for post-meeting analysis in Claude/ChatGPT.

## 12. Legal / consent (UK, general, not legal advice)
A party may record their own conversation for personal use (RIPA one-party). GDPR risk appears when
sharing the recording or using it in a business/multi-party context, which needs a lawful basis and a
notice. Local-first processing reduces exposure. Disclaimer to be built into the UI and terms.

## 13. Commercial positioning (from market research)
No shipping product combines: silent on-screen-only + dual separated streams + response suggestion AND
self-alignment coaching + dispute-grounded context + English/Hindi-Urdu. White space = live self-alignment
coaching. Wedge = UK SMB / family-business disputes and the South Asian business community (Hindi/Urdu).
Monetise as a one-off/local license first, scoped engine in the user's own cloud. Watch Hedy AI (one
feature away) as a pivot/stop trigger. Call-centre agent-assist is a larger but crowded market (Balto,
Cresta); reuse the same engine later, but enter through the open dispute/personal door first.

Harvest from competitors: Balto (live forbidden-phrase alerts = red-lines), Spiky (live checklist
coverage), Hedy (session modes incl. negotiation, on-device speech, cheap pricing), CueRep (Hindi/Hinglish
realtime), Clari Copilot (keyword cue cards, talk-ratio), Poised/Read (delivery metrics), Project Raven
(open-source dual-stream reference), Yoodli/Second Nature (pre-meeting rehearsal mode).

## 14. Infrastructure
- GitHub repo: mohammadalikhanptg/silent-meeting-copilot (private). Commit identity MUST be ali@khan.vg.
- Vercel: new project to be linked to the repo (web app deploys once /web exists).
- Cloudflare: scoped API token (Workers Scripts Edit, Workers AI Edit, AI Gateway Edit, Account Settings
  Read) created by operator; used at engine-deploy time. Account ID to be recorded here.
- Local project root on ALISTUDYPC: C:\Projects\silent-meeting-copilot
  - helper-spike/  : proven Electron capture spike
  - app/, tools/   : earlier Python/PySide6 prototype (reference; proven capture logic)
  - packs/         : example-pack ships; real packs gitignored
  - docs/          : this framework document

## 15. Roadmap / phases
- Phase 0 (done): dual-stream capture proven in Electron on Windows.
- Phase 1 (next): version control (GitHub), Vercel project, Cloudflare token. Internal Codex review of
  this architecture.
- Phase 2: engine on Cloudflare - helper streams audio in; STT produces raw transcripts of both sides;
  repair/normalisation layer; results pushed to the web app. Pick STT model via a short bilingual
  benchmark.
- Phase 3: four-panel web UI on Vercel with the two coaching functions wired to the engine; device
  dropdowns and meters surfaced; language hint.
- Phase 4: context-pack management in the web app; grounding the coaching; per-meeting markdown log.
- Phase 5: helper hardening - pairing to login, green status, auto-update, code-signing, installer.
- Phase 6: polish, then private beta on a real call; later commercial packaging.
- Later: PDF/voice context ingestion; rehearsal mode; Mac version; call-centre agent-assist branch.

## 16. Current status and immediate next steps
- Capture proven. Repo created locally and committed (ali@khan.vg). Push to GitHub pending (manual repo
  creation on github.com because gh CLI is absent, then git push; credentials already on the PC).
- Next: finish push; link Vercel; operator creates Cloudflare token; register this project in the Pacific
  Roadmap Hub (Sanity); run internal Codex review; then build the engine (Phase 2).

## 17. Open decisions
- Final STT model (benchmark Deepgram nova-3 vs whisper-large-v3-turbo vs GPT-4o-transcribe on bilingual,
  noisy audio).
- LLM for coaching and for the repair layer (via Cloudflare AI Gateway to a frontier model, or a
  Cloudflare-hosted model). Latency vs quality.
- Keep a slim offline prepared-lines fallback, or fully cloud.
- Whether the framework document lives in this repo (current) or a dedicated repo.
## Changelog
- 2026-06-22: Dual-stream capture proven in Electron (helper-spike/).
- 2026-06-22: GitHub repo created and pushed (ali@khan.vg). Framework doc added.
- 2026-06-22: Next.js web app skeleton added under web/ (four-panel UI shell, responsive, dark theme). Vercel Root Directory MUST be set to "web" so Vercel builds the web app and ignores the Python prototype at repo root (that prototype caused the first Vercel deploy to fail on app/main.py).
