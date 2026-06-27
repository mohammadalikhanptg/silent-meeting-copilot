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

---

## ADDENDUM (23 Jun 2026) — session model, profile context, multi-user

### Session-first experience
- Login lands on a Sessions list (saved sessions, Open per session, prominent New session button), not the live blocks. New session opens the blocks connected-and-ready. Existing sessions reopen. No calendar for now (bespoke); calendar considered later. Each meeting is a session.
- Per-session preparation, two inputs, usable before going live and editable after: (1) a context box to type or dictate what the meeting is about and how to be coached; (2) drag-and-drop upload of .md/.txt files only as reference/prep data.
- Prepare-and-save lifecycle: create and save a session with context + prep docs without going live, reopen later with everything preloaded.

### Persistent profile context and guide
- Profile gets the same two inputs (text box + .md/.txt upload, e.g. an about-me markdown exported from ChatGPT), plus a copyable guide prompt for users unsure how to generate one.
- Coaching uses two streams: persistent profile (always on) + per-session context (per meeting).

### Security of user-supplied context (mandatory)
- Uploads restricted to .md/.txt, size-capped, everything else rejected.
- All typed/dictated/uploaded context is untrusted DATA, never instructions: control chars stripped, stored plain text, rendered escaped, wrapped in clear delimiters in the LLM prompt with an explicit instruction to use only as background and ignore embedded instructions. No path to issue commands or change system behaviour.

### Multi-user (final phase, GATED)
- End state: Mo is administrator and invites users (friends/family for feedback; no licensing, no cost, Mo bears the Cloudflare cost). Each invited user gets their own login, own profile, same functionality, with per-user data isolation across profiles, sessions, meetings, flagged items.
- GATE: must not go live until the auth multi-user hardening backlog (section 7) is completed and cross-reviewed, because external users will authenticate. Sequence: auth hardening (operator-gated, Codex-reviewed, Mo-verified) -> multi-user build -> invite users. Do NOT expose invites before hardening.

### Phase plan update
- Phase 1 also includes: session-first IA + per-session prep inputs; profile dual-input + guide; Word minutes export (all in build).
- Multi-user becomes its own gated phase after the auth hardening backlog. Meeting-bot remains Phase 2 (needs Recall.ai).

---

## ADDENDUM (24 Jun 2026) — remote-control redesign (cross-reviewed), session suspend/resume, transcription decisions, and MODES vision

This addendum supersedes the relevant earlier sections where they conflict. It is the authoritative v1 design record as of 24 Jun 2026.

### A. Engine corrections (supersede the STT lines in section 2)
- Transcription paths: English uses Cloudflare Workers AI Whisper (free, no diarization). Hindi/Urdu/auto use Deepgram nova-3 hosted ON Cloudflare Workers AI via the AI binding. There is NO external Deepgram account or key any more. Both providers sit behind one interface.
- Decision (cross-reviewed): KEEP the free Whisper English path. Do NOT standardise on paid nova-3 yet. Add cost instrumentation (minutes by mode/provider/channel) and revisit only if measured data justifies the change.
- Live assist/search uses Brave Search (independent index, free tier). Google has no usable general web-search API for this and the Bing Search API retired Aug 2025.
- Helper now builds for Windows AND macOS via GitHub Actions (release tag helper-latest).

### B. Remote-control redesign (the new session model) — CROSS-REVIEWED, APPROVED
Cross-reviewed via Codex on 24 Jun 2026. Verdict APPROVE-WITH-CHANGES. Direction confirmed: a per-user Durable Object control plane is the right v1 model; do NOT pivot to WebRTC/SFU or a heavier session service before v1. Anti-drift gate did not fire. correlationId cr-smc-remote-control-arch-20260624 (wfEvent recorded in Sanity).

Core model:
- No session code anywhere. Identity comes from login (browser) and the pairing key (helper); both resolve to ONE Durable Object per user.
- The helper is a background agent (daemon): connects on launch, sits in standby, captures only when the engine commands it.
- The browser cockpit Start/Stop remotely drives the helper via a control relay inside the Durable Object.
- One live session per account.

v1 hardening requirements (agreed from the cross-review; to build in the client wave):
1. Lease-based capture. Capture continues only while a cockpit is present and renews a lease every 30 to 60 seconds. If presence cannot be proven, capture stops (see lifecycle in C).
2. One active helper per account, enforced in the Durable Object. A second helper demotes the older one (newest-wins, made visible). The engine rejects audio from any non-active helper. The helper gains a fourth state: connected but not the active helper.
3. Durable-Object-enforced capture authorisation. The engine accepts audio only when capturing is true, the lease is valid, the sender is the active helper, and the session epoch is current. Clients never self-authorise.
4. Split secrets. A dedicated INTERNAL_SHARED_SECRET for the worker-to-app Bearer, separate from the key/token signing secret. The previous triple-duty secret caused a real outage. Enrich tokens with audience, type, issued-at, expiry and a replay id (jti or session epoch).
5. Short browser WS token TTL (about 15 minutes) with auto-refresh, replacing the 12h token. Helper pairing keys stay long-lived but carry a device id for future per-device revocation.
6. Client-side silence gating in the helper (RMS with hysteresis, minimum speech duration, pre-roll and post-roll, gated independently per channel) so silence is never uploaded or transcribed. This is the biggest recurring-cost lever.
7. Helper daemon resilience. Heartbeat every 20 to 30 seconds, socket considered stale after about 2 missed intervals, reconnect with exponential backoff plus jitter (about 1, 2, 5, 10, 30, capped near 60 seconds). Session epochs so stale sockets cannot inject audio. On reconnect the helper reports device id, capabilities and selected mic, and the Durable Object returns authoritative state.
8. Address the Durable Object by a stable internal user id where available (email canonicalisation is not always sufficient). Segment duration becomes a config constant.

Deferred (not v1): per-device key revocation UI (device id is added now, UI later); full metrics dashboards (basic counters now).

### C. Decision 1 — session suspend/resume lifecycle (operator decision, 24 Jun)
- Session states: active, paused, ended.
- When the last cockpit closes, after a short grace of about 20 to 30 seconds (to survive an accidental refresh or brief network blip), the session SUSPENDS. The helper drops to standby, capture pauses, and the full session (transcript so far, context, mode and language) is preserved.
- The home screen lists paused sessions. Re-entering a paused session and pressing Resume restarts streaming and the helper resumes flowing data.
- The 3 hour hard cap remains as a safety backstop.
- This replaces the earlier auto-stop-after-90s idea. Suspend-and-resume maintains continuity.

### D. Decision 2/3 — transcription default and switching (operator decision, 24 Jun)
- Default is English on the free Whisper path. The multilingual nova-3 path (with diarization) is available.
- The mode can be changed mid-session (technically easy on this architecture). The change applies to subsequent speech only, and is NOT greyed out during a session.
- Caveat: speaker labels (diarization) exist only on the multilingual engine, so switching mid-session changes whether the other side is labelled from that point onward.

### E. NEW SCOPE — MODES (session profiles layered on the base)
Architecture principle: the base system (capture, transcribe, coach) is the substrate. A mode is a session profile, made of session-scoped context + a mode-specific questioning/coaching strategy + a verdict/state layer + mode-specific UI. The v1 remote-control and lifecycle architecture hosts modes without rework. A mode is selected per session.

Mode 0 — General meeting copilot (the current base): live coaching, talk-time balance, open follow-ups, assist.

Mode 1 — Interview mode (recruitment):
- Setup: the recruiter adds the candidate resume plus a few lines of expectations. Nothing else is required.
- Session-scoped: all candidate data lives only in that session.
- The system DRIVES the interview through the recruiter. It generates resume-based questions for the recruiter to ask, captures the candidate answers live, verifies them against the LLM knowledge or, where needed, live web search, and adaptively cross-questions deeper based on the real answers, feeding the recruiter the next question.
- The recruiter may have zero domain knowledge. The system remote-controls the line of questioning via the recruiter; the recruiter is only the voice.
- Outcome: by the end of the interview, a clear green or red verdict on whether the candidate knowledge and experience match the resume, or whether they are misrepresenting (fake-candidate detection).
- Reuses: live capture (OTHERS is the candidate, ME is the recruiter), transcription, the coaching stream repurposed as a questioning strategy, and the existing web search.

Mode 2 — Customer service mode:
- Session/profile context is unified data about the company products and services.
- The system assists the agent in real time from that product and service knowledge.
- Phase 2/3: connect to the company CRM to capture and use real customer information during the call.

### F. Phasing update
- Phase 1 (current, in build): remote-control redesign + session suspend/resume lifecycle + the v1 hardening list in B + the existing base coaching/assist/follow-up. Definition of done: a verified end-to-end test where the browser cockpit remote-drives the helper, suspend and resume work, and one-active-helper is enforced.
- Phase 1.5: the mode framework (session-profile abstraction) and Interview mode (first non-default mode, highest value).
- Phase 2: Customer service mode (unified product/service knowledge); meeting-bot via Recall.ai as previously planned; multilingual already available.
- Phase 3: CRM integration for customer service mode; multi-user invites, still gated behind the auth hardening backlog in section 7.

### G. Cross-review record
correlationId cr-smc-remote-control-arch-20260624. Verdict APPROVE-WITH-CHANGES. Codex confirmed the direction and proposed no change of direction. Anti-drift gate did not fire. Six of my own recommendations were adopted (five agreed, one upgraded to lease-based); one was reversed on the merits (keep the free Whisper English path rather than standardising on nova-3); the rest were Codex additions folded into the v1 hardening list.

### H. Interview-mode export and session-start compliance (operator additions, 24 Jun)
- Interview mode must produce a downloadable pack after the interview: the full timestamped transcript (the system-suggested questions and the candidate answers) plus the guidance and the green/red verdict with the evidence behind it. The verdict is guidance only and the recruiter decides. The pack is structured so a human or another LLM can independently re-verify the judgement after the fact. The system never needs to be taken at its word.
- Every session begins with a clear notice and acknowledgement that the meeting may be transcribed and analysed by AI for assistance, quality or assessment purposes, and a reminder that ensuring lawful consent and compliance with local law is the user's own responsibility. The user acknowledges before the session goes live. This applies to all modes and matters most for interview and customer service modes, where a third party is being recorded and assessed.

### I. Build execution model (operator instruction, 24 Jun)
This roadmap is the single driver. The v1 build proceeds in ordered waves; each wave completes one or more milestones, which are marked done in this document and in the Sanity project record as they land, so progress is always visible and the roadmap is driven to completion as fast as is safe. Operator tests once v1 is fully built, not wave by wave.

v1 build wave order (each maps to milestones in section B and the Sanity record):
1. Wave 1 (engine, safe/migration-ordered): split internal Bearer secret (INTERNAL_SHARED_SECRET), enrich and shorten the browser token, leave key/token signing secret untouched so existing pairing keys keep working. [milestone r6]
2. Wave 2 (engine): Durable Object safety controls: lease-based capture, one active helper election with audio rejection from non-active helpers, capture authorisation, session epochs, session status active/paused/ended. [milestones r5, part of r4]
3. Wave 3 (helper client): daemon rewrite: connect on launch, standby, capture on command, drop session code and manual start/stop, clear state including not-active-helper, mic hot-swap, heartbeat and backoff reconnect, client-side silence gating. [milestones r3, r7]
4. Wave 4 (browser cockpit): drop session code, Start/Stop drives the helper, helper-connected status and deaf warning, ME-only fallback, home-screen paused sessions and resume, start-of-session compliance acknowledgement. [milestones r3, r4, r8]
5. Wave 5 (modes framework + interview mode): session-profile abstraction; interview mode (resume + expectations in, system-driven questioning, live answer verification, cross-questioning, green/red verdict, downloadable evidence pack). [milestones m1, m2, m5]
6. Wave 6: customer service mode; then CRM integration. [milestones m3, m4]

### Wave 1 status (24 Jun) — DONE and verified end to end
INTERNAL_SHARED_SECRET split is live in both the app and the engine, with the old HELPER_SIGNING_SECRET accepted as a migration fallback on the app side. The browser engine token is now short-lived (15 min) and enriched (typ, aud, iat, jti). The key/token signing secret was left untouched, so existing pairing keys still work and no re-pair is needed. Verified: a correct internal bearer passes the app auth and a wrong one is rejected 401; a live helper WebSocket to the engine returns "invalid signature" for a dummy key, proving the engine to app path authenticates with the new secret. Per-device key id is folded into Wave 3 (the helper gains a device identity there). App commit 69da18c, engine version 2283ce3a.

### Wave 2 status (24 Jun) — DONE (engine), verified
Durable Object safety controls are live. Session status is idle / active / paused / ended. A managed flag gates all new controls so the legacy session-code path is untouched. One active helper is elected (newest wins) and older helpers are demoted and told to stop. Capture is authorised in the DO: audio is accepted only while live and only from the active helper, with browser fallback accepted only when no active helper is present. Session epochs are stamped on election. Lease-based auto-suspend runs via DO alarms: a 30s grace after the last cockpit closes, then suspend to status=paused (resumable), plus a 3h hard cap. Verified end to end over a throwaway session socket: connect gives idle, start gives active and capturing, stop gives ended, with no errors. The full suspend/resume and paused-list experience lands with the browser cockpit in Wave 4. Engine version 0e0623aa.

### Wave 3 status (24 Jun) — DONE (helper), CI rebuilding installer
The desktop helper is now a daemon. It connects to the engine on launch and sits on standby, captures only when the engine (driven by the cockpit) sends a capture command, and never self-resumes. The session-code field and the manual start/stop buttons are gone. It shows four states: disconnected, standby, capturing, and standby-while-another-device-is-active. It supports microphone hot-swap without dropping the connection or the system-audio channel, sends a heartbeat every 25s, reconnects with exponential backoff and jitter, and applies client-side silence gating per channel so silent segments are not sent (cutting transcription cost). It reports a stable device id on connect, forward-compatible with future per-device revocation. The first run needs a one-time Enable click to grant microphone and system-audio access; after that, start and stop are driven entirely from the cockpit. Commit 7545b62.

### J. Per-session Download Action Points (operator addition, 24 Jun)
Every session gains a Download Action Points document, alongside the existing minutes and full-transcript downloads. It has two sections. Section one lists actions agreed or allocated to the speaker (the user), named from the profile. Section two lists actions agreed or allocated to the other people in the meeting, identified from the meeting information and any references in the conversation. The actions are derived from an understanding of the conversation and the action points that emerge from it. The document is structured and downloadable per session. Minutes and full transcript remain available to download as before.

### K. Vertical specifics and industry-standard polish (operator addition, 24 Jun)
Each vertical's ideas must be scaled, polished, and cross-reviewed so they meet that industry's standards, not left as raw ideas.
- Recruitment: the interview mode already specced (system-driven questioning, live verification, adaptive cross-questioning, green/red verdict, downloadable evidence pack). To be polished and cross-reviewed to recruitment-industry standard.
- Customer service (phase 2): the session should start and stop automatically with the call by linking to the softphone on the computer. When a call starts the session starts; when the call ends the session ends, so each call is its own session. Manual start/stop stays available in the interface; in automatic mode the helper watches and controls the local softphone to start and stop sessions in step with the calls. 3CX is the reference-compatible softphone (one that exposes and accepts call status). Phase 2, recorded now because it is specific to the customer service vertical.

### Wave 4 status (24 Jun) — DONE (cockpit), deployed
The browser cockpit now drives the engine. It connects with a short-lived token to the per-user engine path (no session code), and Start, Stop and Resume send control messages the engine and helper obey. It shows whether the desktop helper is connected and warns when it is not (the other side is not being captured). It reflects the engine session state, so an auto-paused session shows a Resume control, and it sends a heartbeat and fetches a fresh token on each connect. Every session opens with a compliance acknowledgement: the user confirms the meeting may be AI-analysed and that lawful consent and local-law compliance are their responsibility, before going live. The browser still captures the operator microphone as a fallback only when no desktop helper is active. App commit 1f46755. The sessions-list paused badge is a minor convenience deferred as polish; suspend, resume and the 3h cap work end to end.

This completes the v1 remote-control core: engine (Waves 1-2), helper daemon (Wave 3), and the cockpit with lifecycle and compliance (Wave 4). Remaining build: Download Action Points, then interview mode and its evidence pack, then the customer-service vertical.

### Download Action Points (o2) — built, 24 Jun
Every session now has a Download Action Points control on the review page, alongside Download full transcript and the existing minutes (Word) download. Action Points has two sections: actions for the speaker (named from the profile, falling back to a tidy form of the sign-in email) and actions for the other people in the meeting (named only where a name is explicitly stated in the transcript, objective, or context, otherwise "Other participant"). The engine generates them from the transcript with strict no-invention rules and returns them as JSON; the page can preview them and download a formatted Markdown file. Engine generator generateActionPoints + POST /action-points deployed (engine version 8f3dd796). App: new action-points JSON route, new transcript download route, ActionPointsPanel client component, wired into the review page. App commit pending in this push; build verification to follow.

### Download Action Points (o2) — DONE & verified, 24 Jun
Verified end to end. Engine /action-points returns correct two-section output (tested: speaker action attributed to the named speaker with due date; others' actions captured with conservative naming). Parser hardened to strip code fences and tolerate alternate key shapes from the small model. App build READY (commit bf1ad25); engine hardening READY (commit c8ab795). The review page now offers Download Action Points, Download full transcript, and the existing minutes (Word) download together.

### Modes framework (m1) — DONE, 24 Jun
Sessions now carry a type: Meeting (default), Interview (recruitment), or Customer service. Added meetings.mode_type via the build-time migration (applied automatically on deploy), with create/update/list/prep plumbing, a Session type selector in the cockpit prep panel, and the type shown on the review page. The selector is honest: Meeting works fully today; Interview and Customer service are selectable and persist, with their vertical-specific live experiences to follow. Builds READY: backend+migration 7d579c4, UI d22a7d0.

Next on the modes track (not started): m2 interview mode is the flagship recruitment vertical (recruiter supplies the candidate's CV via reference docs and the role expectations via objective/context; the system drives and adapts the questioning, verifies claims live, cross-questions, and produces a green/red genuine-vs-fake verdict and a downloadable evidence pack for independent human or LLM re-review; the verdict is guidance only). Per the vertical-polish principle (m7), m2 should be designed and cross-reviewed to recruitment-industry standard before the live interview experience is built, since the questioning/verification/verdict interaction is design-heavy and must not be rushed. m3 customer-service knowledge and m6 softphone auto start/stop follow.

### Interview mode (m2) — live coaching SHIPPED; verdict/evidence-pack design cross-reviewed, 24 Jun
Interview live-coaching is live: the interviewer gets claims to verify, suggested cross-questions, and competency-gap notes, grounded in the candidate CV (reference docs) and role expectations (objective/context). It reuses the coaching pipeline and JSON shape, keeps the candidate transcript verbatim (transcript corrections disabled outside meeting mode), hardens the coaching JSON parser, and shows mode-aware labels ("Claims to verify", "Suggested questions"). Customer-service mode coaching added the same way. Verified against a CV that contradicted the spoken claims: it flagged the exact discrepancies and proposed strong cross-questions. Engine deployed; app builds READY (cb8a8ff, c22d851).

The flagship verdict + downloadable evidence pack were designed and cross-reviewed by Codex (APPROVE-WITH-CHANGES) before any build. Reconciliation in docs/interview-mode-design.md, full review in docs/interview-mode-codex-review-20260624.md. Headline change, flagged for the operator: do NOT build a green/red genuine-vs-fake verdict; build a citation-backed claim-and-competency evidence review instead (per-claim consistency states + competency coverage, no suitability/honesty label), with strict citations, protected/proxy characteristic exclusions, UK GDPR Article 22 controls, provenance metadata, endpoint /interview-evidence, and adversarial tests before release. Building that evidence review (m5) is the next step, following the reconciled design. m3 customer-service knowledge and m6 softphone follow.

### Interview assessment + evidence pack (m2/m5) — DONE & verified, 24 Jun
Post-session interview assessment is live on the review page for interview sessions: a three-state traffic light (red/orange/green) plus a no-signal state when data is insufficient, a cited per-claim evidence table (each claim shows the candidate quote, the reference quote, and a status: supported, partially supported, not addressed, in tension, or insufficient evidence), competency coverage, a prominent disclaimer, and a downloadable evidence pack (Markdown). The signal is computed deterministically from the cited claim statuses, not a free-form model verdict. Uses a 70b model with retries and a raised token budget for reliable structured extraction (the 3b model was too flaky). Verified across all states: red (claims contradict CV), green (claims match CV), and no-signal (too little data). Engine deployed; app build READY (1f9720f engine, cd529e3 app).

v1 IS READY FOR FIRST PREVIEW AND TESTING. Complete: remote-control core (engine + helper daemon + cockpit + suspend/resume + compliance), outputs (minutes + full transcript + action points downloads), modes framework, the interview vertical (live interviewer coaching + post-session assessment + evidence pack), and live coaching for customer-service mode. Deferred to phase 2: customer-service knowledge base (m3), CRM (m4), softphone auto start/stop (m6), and vertical polish/cross-review of customer-service (m7).

### Meeting finalisation before first test (25 Jun)
Per-user default meeting language added to profile settings (English default, plus Hindi/Urdu and Auto). New meetings start in the user's chosen default; the per-meeting language dropdown still overrides before Start; the selector is locked once live. Mid-session language switching intentionally left out (engine supports it; not exposed in the cockpit) pending a real need. Dead-code cleanup: removed the obsolete "Deepgram API key" gate from the cockpit (state, /health probe, start gate, disabled-button branch, warnings, error handler) and the unreachable deepgram_unavailable broadcast from the engine, since nova-3 runs keyless on Cloudflare Workers AI. Engine a4b4254e, app build READY (c918ced). Meeting loop is now ready for first real-audio test.

---

## Status update — 25 Jun 2026 (supersedes the Section 4 build-status snapshot)

### Done, committed and deployed (live on main)
- Remote-control core (Waves 1-4): engine secret split; Durable Object safety controls and fail-closed auth; helper daemon rewrite (auto-connect standby, capture on command, four states, mic hot-swap, heartbeat, backoff reconnect, silence gating); token-based cockpit WebSocket.
- Outputs: live minutes, downloadable action points, minutes DOCX.
- Modes framework (m1): meeting / interview / customer_service; session type selector and review display.
- Interview vertical (m2/m5): mode-aware coaching plus a post-session cited assessment (per-claim evidence table, competency coverage, deterministic green/orange/red/none signal computed in code, fairness exclusions, disclaimer).
- Meeting finalisation: per-user default meeting language; keyless transcription (Whisper for English, Deepgram nova-3 for Hindi/Urdu with diarization); dead-code cleanup.
- Security baseline: criticals closed (legacy unauthenticated WebSocket/info routes removed, DO fails closed); POST-endpoint auth; CORS locked to app origin; request-body size cap; security headers; transcript broadcasts scoped to browsers; coach prompt-injection isolation. Independent Codex cross-review applied.
- Design system: two themes via token layer with a persisted toggle — dark Liquid Glass, light Claymorphism — with living animated backgrounds and panel depth; Glassmorphism candidate discarded.
- Feedback pass 1: readable/larger coaching; flags visible in both themes, click to toggle off, tracker remove (DELETE route); transcript boxes scroll and drag-resize height; redundant single-speaker label removed; collapsible session-prep.
- Feedback pass 2: motion made actually visible (reduced-motion guard removed, drift/sheen boosted); session-prep hidden during a live session; flagged line changes colour and highlights instantly; pre-start helper-readiness monitor and readiness dot/text.
- Documentation: docs/FRAMEWORK.md refreshed; docs/security-framework.md current; this roadmap.

### Left to commit
Nothing. Working tree is clean; every change above is pushed to main and deployed.

### Backlog / ideas not yet implemented (priority order)
UX / cockpit:
1. Paragraph-level timestamps — group a continuous run of speech under one timestamp, start a new paragraph on a pause, with a guardrail break for very long unbroken runs. Replaces the current per-phrase timestamps; directly improves flagging granularity. (Operator has raised this twice.)
2. Make the Follow-up Tracker genuinely functional — talking points and references currently produce nothing useful; investigate the flag->enrich pipeline (likely missing SEARCH_API_KEY or wiring) and redesign for real value.
3. Full dashboard layout control — drag-to-reorder "jiggle" mode with saved positions (height-resize already shipped; reorder + persistence outstanding). Width stays fixed.
4. References / live-lookup section purposeful redesign — clarify its job and make it earn its place.
5. Profile "generate about me" prompt retailor — include what is already known and only ask for missing fields, instead of asking everything.
6. Profile dictation microphone — operator leaned against it (transcription-error risk); not building unless requested.

Functional / wiring:
7. Helper-to-session association before Start (engine side) — confirm whether the helper joins the session before Start; if not, wire it so pre-start readiness is fully real. Verify on operator test.
8. Code-sign the Windows installer to remove the SmartScreen warning.

Security hardening (gated before any real third-party/candidate data):
9. H2 move helper key and engine token out of the URL query into a header/subprotocol (needs helper rebuild + reinstall).
10. H3 drop the signing-secret fallback after confirming the dedicated secret in both environments; add a key id for staged rotation.
11. H4 bind the engine token to the session id with revocation and replay protection.
12. Strict Content-Security-Policy; data retention and hard-delete; automated IDOR test; AI-provider data-processing confirmation; CI dependency and secret scanning; rotate the git-embedded credential.

Future / Phase 2:
13. Speaker-labelled note-taker output as a paid option so a customer does not need a separate note-taker.
14. Customer-service softphone auto start/stop integration.
15. Per-industry-vertical scaling and polish, with cross-review before launch.

## Progress — 25 Jun 2026 (later)
Done and deployed since the status update above:
- Paragraph-level timestamps (backlog 1) — commit 08a77d6.
- Follow-up tracker enrichment restored; talking points work again (backlog 2, the auth regression) — commit 3d1706e. Live references still need a Brave key (operator cost decision).
- Profile about-me prompt now tailored to known facts, only asks for gaps (backlog 5) — commit ab746b9.
- Research column redesign: the old References column is now "Research", always useful without a paid key, with per-item Web/News/LinkedIn jump-off links plus live references when a key exists (backlog 4) — commit cc84d83.

Verified by inspection, no code change needed:
- Helper-to-session pre-start association (backlog 7). The engine associates the helper with the user's session Durable Object at launch, not at Start, and sends current helper presence to a browser the moment it connects during preparation. The cockpit's pre-start monitor connects with a valid token and reads it. Pre-start readiness is correct end to end in code; needs only a live confirmation on the desktop test.

Done and deployed (25 Jun, later still):
- Full drag-to-reorder "jiggle" cockpit layout (the named next major item) — commit 81fd5af, Vercel READY. Opt-in "⠿ Arrange panels" mode jiggles the four live cockpit panels (Transcripts, Coaching, Live Assist, Follow-up); drag vertically to reorder (drop side decided by pointer midpoint), order persisted per-device in localStorage (smc.cockpitPanelOrder.v1, normalized on load so future panels slot in), Reset restores default. Width stays fixed, vertical only. Implemented via a .smc-cockpit flex container + CSS `order` so DOM stays stable (no remount of live transcript/coach state on reorder); zero behaviour change when Arrange is off; respects prefers-reduced-motion. Benefits from a quick operator look to tune the jiggle/feel.

Revised remaining backlog (priority order):
1. Optional: provision a Brave search key to switch on live references in the Research column (operator cost decision).
2. Code-sign the Windows installer (needs a code-signing certificate; operator provisioning).
3. Security hardening, gated before any real third-party/candidate data: tokens out of the URL (needs helper rebuild), drop the signing-secret fallback with a key id for rotation, bind the engine token to the session with revocation/replay protection, strict CSP, retention/hard-delete, IDOR test, AI-provider data agreement, CI scanning, rotate the git credential. (Mostly engine-side: deploy via wrangler from the Mac, so not completable from a web/Windows-only session.)
4. Phase 2: speaker-labelled note-taker paid option; softphone auto start/stop; per-vertical scaling.

## Progress — 26 Jun 2026
Done and deployed this session:
- Engine transcription rewrite DEPLOYED to Cloudflare (smc-engine version 7a166c1e, /health 200). The app/cockpit changes had already auto-deployed via Vercel; the engine needed a manual wrangler deploy from the Mac, now done, so the helper reinstall is unblocked (engine-first ordering satisfied).
- Security hardening: F8 (CI dependency + secret scanning) and F7 (automated cross-account/IDOR regression test, rebuilt + made a blocking CI gate) DONE. F5 (AI-provider data-processing confirmation) landed via a parallel stream.
- Deploy-token note (important): the SMC worker deploys using the env var CLOUDFLARE_DEPLOY_TOKEN (exported as CLOUDFLARE_API_TOKEN for wrangler). The env var literally named CLOUDFLARE_API_TOKEN is the Workers-AI runtime token and FAILS deploys with auth error 10000.

Remaining hardening (priority order): F4 data retention + hard-delete + at-rest (gate before any real third-party/candidate data) = NEXT; F2 per-device helper-key revocation; F3 drop signing-secret fallback + rotation key id; F6 strict CSP + session lifetime; F5 remove client error leakage; F1 rate-limiting (criticals, CORS, headers already closed in the baseline).

## Progress — 27 Jun 2026

The remaining security-hardening PRs from the dispatched jobs were reconciled against main, verified, merged and deployed this session. The "concurrent actor" earlier was these same dispatched jobs producing PRs (#2/#3/#4/#5), not a separate actor.

Done and deployed this session:
- PR #2 (H2-H4 + strict CSP) MERGED + DEPLOYED + VERIFIED LIVE. Rebased onto main, verified (pairing 53/0, auth-hardening 35/0, next build ok), merged (3e7fad6), worker deployed. Live checks: worker /health 200; app /login serves the strict nonce CSP and all script tags carry the matching nonce (page hydrates correctly). Closes F3 (signing-secret fallback dropped, INTERNAL_SHARED_SECRET-only, kid keyring + docs/key-rotation.md) and F6 (strict nonce CSP); plus H2 (tokens out of URLs into WS subprotocol + headers) and H4 (engine token bound to session sid + used_engine_tokens replay ledger + revocation-on-logout).
- PR #3 reconciled (F4 + F5) MERGED + DEPLOYED. Took the unique parts onto main (a014ac4); its duplicate F7/F8 were already on main and were dropped. F4: app/lib/retention.js (windows sessions 90d, bot 7d, magic-links 7d, auth 30d; hardDeleteSession FK-safe + re-count remaining.total, ownership-scoped), DELETE /api/meetings/[id], scripts/purge-retention.mjs, docs/retention-policy.md, test-retention 20/0. F5: worker mip_opt_out:true on @cf/deepgram/nova-3 + security-framework sections 9-10. PR #3 closed (reconciled, not merged).
- THE GATE BEFORE REAL THIRD-PARTY/CANDIDATE DATA IS NOW ESSENTIALLY MET: H2, H4, strict CSP, F4 retention+hard-delete, F5 AI-position+opt-out, F7 IDOR test+CI, F8 dependency/secret scanning are all merged and deployed. Remaining lower-priority hardening: F2 per-device helper-key revocation, F1 rate-limiting, the F5 client-error-leakage sub-item (already closed in an earlier pass). Operator action still outstanding: rotate the git-embedded credential.
- Meeting-bot scaffolding 1/N (PR #5) MERGED + DEPLOYED. Synthetic-audio only, feature-flag OFF (worker BOT_CAPTURE_ENABLED="false"), no real meeting joins, no /bot/ws route. Self-hosted, provider-adapter design. Reviewed and verified before merge: all-additive (16 files, +1234, 0 deletions), no app/ changes, engine bot_frame branch additive + double-gated (role==bot AND flag, both off) leaving the ME/OTHERS hot path untouched, hard gate REAL_CAPTURE_IMPLEMENTED=false in both bot/src/guard.js and worker/src/bot-ingest.js, bot/ runtime holds no core secrets/DB; node --check clean, npm run test:bot 31/0, next build ok, worker bundle dry-run ok. Components: MeetingCaptureSource + FakeAdapter (bot/src/), SessionDO per-participant ingestion seam (worker/src/bot-ingest.js, flag-gated), consent gate (bot/src/consent.js, identity "SMC Recording Bot", evidence record), session-bound revocable replay-protected bot credential (bot/src/credential.js, aligns with H4), isolated bot runtime (bot/src/index.js), product boundaries. Worker version bff192ca. Docs: docs/meeting-bot-design.md.

Remaining backlog (priority order):
1. Meeting-bot next increments (gated on consent UI + final review): real Zoom Meeting SDK adapter (needs operator Zoom Marketplace SDK credentials + a Linux host), binary frame envelope, wire the bot credential into app internal endpoints, consent UI + evidence persistence.
2. F2 per-device helper-key revocation (helper already sends a device id).
3. Operator: rotate the git-embedded GitHub credential in the Mac remote; optionally set the CLOUDFLARE_API_TOKEN repo secret to a deploy-capable token to enable PR #4 (engine auto-deploy CI, left open); optional Brave search key; Windows installer code-signing cert.
4. Phase 2: speaker-labelled note-taker paid option; softphone auto start/stop; per-vertical scaling.

## Progress — 27 Jun 2026 (later) — security hardening 3/N (job-smcsec-3)

PR opened (not merged; orchestrator reviews/merges/deploys — engine deploy is manual or via the still-open PR #4):
- **F1 rate-limiting — DONE.** The last open piece of F1 (auth + CORS + body-cap were already closed). All six engine generation endpoints are now rate limited via Cloudflare native Rate Limiting bindings: `RL_IP` 120/60s (per IP, checked before the auth callback so bad-token floods can't hammer the app validator), `RL_USER` 90/60s (per authenticated email + endpoint; covers live `/coach` polling), and `RL_HEAVY` 20/60s (extra bucket for the expensive `/transcribe`). 429 + `Retry-After` on exceed; internal-secret server-to-server callers exempt; **fails open** so a limiter outage never takes the copilot offline. New `worker/src/ratelimit.js`, wired in `worker/src/index.js`, bindings in `worker/wrangler.toml`.
- **F5 error-leakage sub-item — CLOSED.** Three engine generators (`generateMinutes`/`generateActionPoints`/`generateInterviewAssessment`) no longer return raw `err.message` to clients — generic message/`generation_failed` code with server-side `console.error` only.
- Verified: `test:security` (retention + IDOR 57/0 + new rate-limit 44/0) all green; `test:bot` 31/0; `wrangler deploy --dry-run` validates the three bindings + bundles clean. No app/ code touched (engine-only), so `next build` is unaffected and not re-run.
- The gate before real third-party/candidate data is met (H2, H4, CSP, F4, F5, F7, F8, and now F1). Remaining hardening: **F2** per-device helper-key revocation; operator action: rotate the git-embedded GitHub credential.

## Progress — 27 Jun 2026 (later) — meeting-bot 2/N (job-smcbot-3): binary frame envelope

PR opened (not merged; orchestrator reviews/merges/deploys — engine deploy is manual or via the still-open PR #4). Still **synthetic-only, flag OFF, no real meeting joins, no `/bot/ws` route**; both hard gates (`REAL_CAPTURE_IMPLEMENTED=false`, `BOT_CAPTURE_ENABLED="false"`) intact.

- **Binary frame envelope — DONE.** The bot wire path now has the efficient binary encoding the real per-participant capture path will use, instead of base64-in-JSON. A compact self-describing envelope (magic `SMCB`, version 1, 40-byte little-endian header carrying provenance + `tStart`/`tEnd`/`confidence` as NaN-nullable float64 + UTF-8 `participantId`/`displayName` + raw audio) avoids base64's ~33% inflation and its encode/decode CPU. New `bot/src/frame-envelope.js` (runtime copy) + `worker/src/frame-envelope.js` (engine copy), kept byte-for-byte identical exactly like the duplicated `PROVENANCE` enum, with a **cross-decode** test (bot-encode ↔ engine-decode, both directions) that fails CI on any drift.
- **Engine wiring — additive + double-gated.** `SessionDO.webSocketMessage` gains a binary branch that decodes an envelope **only** for a `role==='bot'` connection (which never occurs in production — no `/bot/ws` route) **and** only when `BOT_CAPTURE_ENABLED` is on, then reuses the existing `ingestParticipantFrame` seam → participant-labelled segment. The helper ME/OTHERS binary hot path (byte 0 = speaker) is byte-for-byte unchanged for every other role; malformed envelopes are dropped like malformed base64 frames. No `app/` files touched.
- Verified: `npm run test:bot` = synthetic 31/0 **+** envelope 31/0 (round-trip fidelity incl. null sentinels and non-ASCII names; cross-implementation byte agreement; binary < base64-JSON size; bad-magic/version/truncation/unknown-provenance rejection; decoded-envelope → ingestion segment; SessionDO gating structural check). `node --check` clean on all changed files; `wrangler deploy --dry-run` bundles clean (72.32 KiB, `BOT_CAPTURE_ENABLED="false"`, all bindings intact).
- Bot remaining increments (gated on consent UI + final security review before any real participant audio): Zoom Meeting SDK adapter (needs operator Zoom SDK creds + Linux host) + real `/bot/ws` route with bot-credential auth; wire the bot credential into app internal endpoints against `used_engine_tokens`; in-product consent UI + evidence persistence; bot session lifecycle in the cockpit.

## Progress — 27 Jun 2026 (later) — meeting-bot 3/N (job-smcbot-4): sealed consent evidence record

PR opened (not merged; orchestrator reviews/merges/deploys). Still **synthetic-only, flag OFF, no real meeting joins, no `/bot/ws` route**; both hard gates (`REAL_CAPTURE_IMPLEMENTED=false`, `BOT_CAPTURE_ENABLED="false"`) intact. This increment touches **only `bot/` + `scripts/` + `package.json`** — **no `app/`, no `worker/`, no flag** (tighter scope than builds 1–2/N, which touched `worker/`).

- **Sealed, independently-verifiable consent evidence record — DONE.** `ConsentGate.evidence()` (the basis-for-capture record: timestamp, confirmation, disclosure method, meeting ref, participant join/leave log — **no audio, no transcript**) previously went nowhere. New **`bot/src/evidence-record.js`** makes it persistable and auditable, embodying SMC's "**never taken at its word**" principle: another system can re-verify it offline.
  - `canonicalize()` — deterministic, total JSON (recursively sorted keys, array order preserved; throws on `undefined`/functions/non-finite/circular) so equal records always hash the same.
  - `chainParticipantLog()` — a **hash chain** over the roster (each entry folds in the previous hash from a fixed `GENESIS_HASH`) so deleting/inserting/reordering/editing any join/leave event cascades to every later hash and the `head`, localising *where* tampering occurred.
  - `sealEvidence()` — wraps the record in `{schema, version, sealedAt, sealedBy, evidence, participantLogChain, contentHash}` (`contentHash = sha256(canonical(body))`); deterministic for identical input.
  - `verifyEvidenceRecord()` — pure/total (never throws) `{valid, reasons[]}`; recomputes the content hash **and** re-derives the chain, naming the failing position (`content_hash_mismatch`, `participant_log_chain_broken_at_seq_N`, `…_head_mismatch`, `…_length_mismatch`, `unknown_schema`, `unsupported_version`).
- **Runtime hand-off — additive.** `BotRuntime.sealConsentEvidence({clock})` returns the sealed record under the bot identity (or `null` with no gate). Opens no socket, flips no flag, adds no audio/transcript. This is the clean integration point the future consent-UI / evidence-persistence increment will call.
- Verified: `npm run test:bot` = synthetic 31/0 **+** envelope 31/0 **+ evidence-record 41/0** (canonicalisation determinism/totality; sha256 known-vector; chain link/cascade/genesis; seal shape + no-audio/transcript structural check + determinism; verify success, JSON round-trip, and tamper detection for edited fields / deleted / reordered roster events / doctored chain head / dual log+chain edits; structural rejects; runtime integration over a synthetic session). `node --check` clean on all changed/new JS. No `app/`/`worker/` files touched, so `next build` and the engine bundle are unaffected.
- Bot remaining increments (gated on consent UI + final security review before any real participant audio): Zoom Meeting SDK adapter (operator Zoom SDK creds + Linux host) + real `/bot/ws` route; wire the bot credential into app internal endpoints against `used_engine_tokens`; in-product consent UI + **persistence** of the now-sealable evidence record; bot session lifecycle in the cockpit.
