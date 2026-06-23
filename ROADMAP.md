# Silent Meeting Copilot (SMC) — Master Roadmap & Framework

Single source of truth. If a chat dies, resume from this document plus the Sanity copy. Owner: Mohammad Ali Khan (Pacific Technology Group). Commit author for this repo is always ali@khan.vg.

## 1. Vision and positioning
SMC is a live meeting copilot. A Windows helper captures two audio streams, the operator's microphone (ME) and the system/loopback audio (OTHERS), and streams them to a cloud engine that transcribes in near real time, cleans the text, and drives live coaching, assistance and follow-up while the meeting is happening. The unique angle is real-time, operator-side coaching during the meeting, which incumbents (Fireflies, Otter, Read.ai) do not do. They do in-meeting note-taking and speaker-labelled transcripts, which we will add as a Phase 2 paid option so a customer does not need both us and a note-taker.

## 2. Architecture
- Windows Electron helper: default mic = ME, WASAPI loopback = OTHERS; streams labelled channels to the engine.
- Cloudflare Worker engine ("smc-engine"): WebSocket session backed by a Durable Object, plus a REST /transcribe for testing. Two stages: speech-to-text (Cloudflare Workers AI Whisper by default; Deepgram for Hindi/Urdu when a key is set) then an LLM cleanup/coaching pass (Workers AI). The session input is source-agnostic and speaker/channel-labelled, so any feed source (the local helper now, a meeting-bot later) plugs into the same coach.
- Next.js 16 web app on Vercel: magic-link + TOTP auth, the live session page (transcript, coaching, assist, follow-up), meetings review, and profile.
- Neon Postgres: auth_users, magic_links, sessions, meetings, transcript_segments, user_profiles, flagged_items.

## 3. Infrastructure (recovery)
- Repo: mohammadalikhanptg/silent-meeting-copilot (branch main).
- Vercel: project prj_eF9j961vaT9wRp8nhrYhElUG4XKz, team team_qhm5OOjlJcEv9WD6Ugv9yNpT, URL https://silent-meeting-copilot.vercel.app.
- Engine: https://smc-engine.ali-6b8.workers.dev (worker/).
- Neon: database "smc", role "smc_owner", inside the existing Vercel-managed Neon project.
- Sanity: project 74704nsd, dataset production; SMC wfProject 7927b0bf-e2f6-4d14-aec5-6b99764f24d9; projectRoadmap 427dc4bc-eb07-4ba0-9c84-78c8d1293bef.
- Vercel env: DATABASE_URL, AUTH_SECRET, AUTH_ALLOWLIST (ali@pacific.london, ali@pacificinfotech.co.uk), NEXT_PUBLIC_BASE_URL, RESEND_API_KEY, RESEND_FROM, NEXT_PUBLIC_ENGINE_URL.
- Engine secrets (optional, key-gated): DEEPGRAM_API_KEY (enables Hindi/Urdu), SEARCH_API_KEY (enables live assist/follow-up lookups and news).

## 4. Build status
DONE — Phase 1 ([V] = independently verified by Claude, [R] = built and self-reported, pending Claude verification):
- Auth: magic-link + TOTP, allowlist restricted to the two operator mailboxes, SafeLinks-proof confirm step, cookies set on the response. [V]
- Engine: Whisper STT + LLM cleanup, REST + WebSocket, Durable Object sessions; verified transcribing a real clip. [V]
- Pluggable STT provider; Deepgram path for Hindi/Urdu gated by a key, with an honest "not enabled" message and no silent fallback. [V code]
- Per-meeting language selector: English default (fast/free), Hindi/Urdu option. [V code]
- Shared sessions (session id/short code) and hardened session page (status, auto-reconnect). [R]
- Coaching layer: talk-time balance, open items the other side raised, suggested next lines, self-alignment to a stated objective. [R]
- Persistence (meetings, transcript_segments) and meetings review pages. [R]
- Repeat-back repair: a clean ME restatement of a garbled OTHERS turn corrects the transcript and re-bases coaching; conservative; plus speaker diarization on the Deepgram path; "clarified" badge. [R]
- Live Assist: profile-based cards (your website, blog, email, etc. when referenced) and lookup detection, in an Assist panel. [R]
- Windows helper scaffold (not yet tested on Windows hardware). [R]

IN PROGRESS:
- Follow-up Tracker: timestamped transcript lines with a flag control; flagged points feed two panels below the live blocks, "Talking points" (LLM help per point) on the left and "References" (online context) on the right, numbered and aligned, processed on a separate slower background stream so real-time is never disturbed; per-meeting context notes. [building]

## 5. Phase plan
Phase 1 (current): everything above, local-helper based. Definition of done: a verified end-to-end real-time test from the Windows helper through the engine into the live coach.

Phase 2 (paid add-ons):
- Meeting-bot agent: provide a meeting invite and the system sends a bot into the online meeting (Zoom/Teams/Meet), receiving per-speaker-named real-time transcription that feeds the same coach. Recommended build via a unified bot API (Recall.ai) rather than native per-platform bots. Paid add-on, passing through the per-hour bot cost plus margin. Complements the helper (helper for in-person/any-audio; bot for online meetings with clean named speakers) and improves coaching quality. Engine is already source-agnostic, so this is a feed source, not a rebuild.
- Key-gated switch-ons (code already present, decision to enable): Deepgram multilingual; live search/news.

Long-term roadmap:
- Auto-generated formatted minutes (Word/.docx) from the transcript.
- Multi-user / invite system, which requires the auth hardening backlog in section 7, plus an invite UI.
- Per-meeting document/MD upload for richer context.
- Helper on other operating systems.

## 6. Agreed product decisions
- English is the default fast path; Hindi/Urdu is chosen per meeting; never silently downgrade.
- Repeat-back correction is conservative and must not misfire on the operator's own points.
- Assist and lookups never fabricate: real profile values only, and a real search link or real results only.
- Follow-up enrichment runs on a separate slower stream so it never disturbs real-time transcription and coaching.
- Honesty throughout: no fake values, results, or claims; honest "not enabled yet" states.

## 7. Auth multi-user hardening backlog (do before inviting any second user)
1. Make session revocation effective at the edge gate (today the signed cookie passes until expiry even after logout).
2. Rate-limit and lock out repeated attempts on the verify and TOTP endpoints.
3. Re-check the allowlist at every auth phase, not only at link request.
4. Encrypt the TOTP secret at rest with a dedicated key.
5. Replace or heavily test the self-implemented TOTP against a vetted library.
6. Add CSRF defence on state-changing POSTs.
7. Add auth-event alerting (new login, failed bursts, revoked-session use).

## 8. Open items, keys, operator actions
- Add DEEPGRAM_API_KEY (engine secret) to enable real Hindi/Urdu.
- Add SEARCH_API_KEY (engine secret) to enable live results and news in Assist and References.
- Fill in the profile (address, phone, links) via /profile so personal-fact cards work.
- Test the Windows helper on the desktop (needs Windows hardware).
- Phase 2: choose and sign up for the meeting-bot provider (Recall.ai recommended).
- Rotate the Mac git remote token to SSH or a credential helper (security hygiene).

## 9. Meeting-bot (Phase 2) assessment
Feasible and moderate effort via Recall.ai (unified bot API across Zoom/Teams/Meet/Webex giving real-time, speaker-named transcription) rather than native per-platform bots. Fits as a paid add-on with pass-through cost. Strategically closes the gap with note-takers like Fireflies so a customer needs only SMC, and the named clean speaker labels improve coaching versus the loopback blob. Plugs into the existing source-agnostic engine. Not Phase 1.
