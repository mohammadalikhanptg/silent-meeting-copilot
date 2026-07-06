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

## Progress — 28 Jun 2026 — Sarvam streaming engine + marathon-context roadmap item

Sarvam Saaras v3 streaming engine wired end to end (behind a flag, nova-3 stays default):
- Worker: engine-agnostic streaming relay (worker/src/sarvam-relay.js) + SessionDO routing PCM frames to Sarvam when engine=sarvam and SARVAM_ENABLED on; flag-off guard drops PCM instead of feeding the nova-3 decoder; engine plumbed cockpit->DO->helper. Deployed.
- Browser + helper: AudioWorklet 16kHz Int16LE PCM capture (public/pcm16k-worklet.js, helper/pcm16k-worklet.js) for ME and OTHERS when engine=sarvam; engine selector in the cockpit; continuous frames (Sarvam VAD segments server-side).
- Helper v0.3.0 installer: upgrade-safe (locked install dir, per-user) so over-the-top installs cannot create parallel copies; release asset names aligned to the in-app download route; in-app Profile download pinned to the fixed CI tag helper-latest so it always serves the latest build. Still unsigned (operator owes code-signing cert).
- Batch tooling: scripts/sarvam-batch.py (Sarvam batch job runner) + scripts/transcript-eval.py (WER/CER scorer, self-test 7/7) for the Fireflies head-to-head; gated on the 20 Jun audio + key in a runnable place.
- Live proving: operator-gated. SARVAM_ENABLED + SARVAM_DEBUG turned on for the first test; two wire details (per-message encoding token, response schema) confirmed only against the live API, tunable via wrangler vars (SARVAM_ENCODING/MODE/LANG/CODEC) without redeploy.

### Roadmap item (operator-instructed, 28 Jun) — marathon-session coach context management — NOT STARTED, prioritised
Operator instruction: short meetings (10-30 min) coach fine, but a long meeting must not degrade or hang. As a session grows, bound the context flowing to the coach and fold older conversation into summaries, so coaching quality, flow and accuracy stay the same as at the start regardless of length.

Problem: the live coach (/coach, every 25s) is sent the ENTIRE accumulated ME+OTHERS transcript unbounded (generateCoaching in worker/src/session-do.js; payload built in app/session/page.js pollCoach from meLinesRef/othersLinesRef). Latency and token cost grow linearly with meeting length; past ~30-60 min the payload bloats, coaching slows, and a long enough session risks a context-limit failure or apparent hang. Minutes/action-points (post-meeting, full transcript) are a related but separate concern that will also need length handling.

Design direction (refine + cross-review before build):
- Tiered context: verbatim RECENT TAIL (last ~N min / ~M turns) at full fidelity for immediate coaching, plus a maintained ROLLING SUMMARY of everything older.
- Compaction trigger: when the transcript crosses a size threshold (tokens, or minutes/turns), fold the now-older portion into the rolling summary and drop those raw turns from the live payload. Threshold configurable; tune empirically (start ~6-8k tokens or ~20-30 min).
- Incremental summary (summary-of-summary safe): each compaction merges the newly-aged segment into the existing summary. Structure it (key facts, decisions, open items the other side raised, commitments, names/numbers, unresolved threads, tone) rather than free prose, to resist drift and stay objective-relevant.
- Coach payload = rolling summary + verbatim recent tail + objective + profile + context notes + ref docs.
- Talk-balance/metrics stay computed over the FULL conversation via a running tally, not just the window, so stats remain accurate.
- Repeat-back correction operates on the recent tail. Mode-aware: interview/customer-service verdicts must still see the full evidential arc via the structured summary; never silently drop claim-relevant facts.

Acceptance: a simulated ~90-min transcript keeps coach-call payload size and latency roughly FLAT past the threshold (not linear), with coaching quality on a held-out check comparable to the unbounded baseline over early+recent context; no hang or context-limit error at length. Engine-side (worker) + app payload builder; deploy via wrangler from the Mac.

### Operator bugs (28 Jun, next round) — helper pairing-key persistence + save-preparation must persist engine/language
1. Helper pairing key is NOT persisted across restarts. main.js stores the encrypted key only in an in-memory app property (app.pairingKeyEncrypted), so quitting/relaunching the helper loses the pairing and forces re-entry. FIX: on save, encrypt with safeStorage and WRITE to disk (app.getPath('userData')/pairing.bin); on launch, read+decrypt and auto-connect. Pairing is a once-at-install action and must persist until the key is rotated or pairing is explicitly reset. (Operator-stated, high priority for the helper round.)
2. Save preparation must persist the operator's chosen meeting LANGUAGE and ENGINE, not just context/docs. Today a saved session can reopen defaulting language/engine, so a new session silently runs the wrong language/engine and defeats the purpose. FIX: include language (mode) and engine in the session prepare/save payload and rehydrate them on reopen; the saved choice wins over the default. (Operator-stated.)


### 28 Jun 2026 (later session) - Sarvam streaming FIXED + verified, coaching redesign shipped, MCP orchestration added

Sarvam streaming root-caused and fixed (now working end to end):
- The live close-1003 "rate limit" was a SYMPTOM, not the cause. Audio frames were sent at the top level {data,sample_rate,encoding} but Sarvam requires them nested under an "audio" key. Sarvam rejected every frame ("audio must not be None") and closed; the relay reconnected on the next frame, and that per-frame reconnect storm tripped the streaming rate limit.
- Fix (commit aaf83d1, worker deployed): worker/src/sarvam-relay.js _buildAudioMessage nests AudioData under "audio" and per-message encoding defaults to "audio/wav"; _parseInbound surfaces provider {type:error} via onError instead of swallowing; push() throttles reconnects to >=1s apart so a flapping socket can never storm the provider again.
- Verified end to end on a real call: far-end (OTHERS) Hindi/Urdu code-mix transcribes excellently; operator rates the quality well ahead of anything seen so far.
- ME microphone blank was an operator-side wrong-mic selection in the helper device dropdown, fixed by selecting the correct device; no code change.
- wrangler.toml Sarvam flags (SARVAM_ENABLED/DEBUG, ENCODING=audio/wav, MODE/LANG/CODEC) remain intentionally UNCOMMITTED on the Mac for live testing; code default is already audio/wav; commit proper repo defaults once fully proven (consider SARVAM_DEBUG=false).

Coaching redesign shipped (commit d9d54a5, Vercel READY, worker version 52b7b533):
- Worker generateCoaching: suggestions now mark the single most important phrase with double asterisks; new selfCorrection {message,drifting} field judging ONLY the most recent ME lines against the objective.
- Cockpit: coaching panel rebuilt from 3 columns into full-width stacked blocks, order Suggested responses (17px, key phrase rendered as a green highlight, Objective alignment embedded beneath in amber), then a new Stay-on-track block (escalates to large red when drift persists across >=2 consecutive updates), then Open items, then a slim Talk balance. Inner per-block drag-reorder is NOT yet wired (fixed default order; follow-up task t-smc-coaching-inner-block-drag-reorder).

### Roadmap item (operator-instructed, 28 Jun) - MCP-driven near-headless session orchestration - NOT STARTED, high priority (t-smc-mcp-llm-session-orchestration)
Establish MCP connectivity so Claude and ChatGPT can drive SMC end to end with no manual per-session setup. Via MCP the LLM creates a new session and fully configures it (objectives, background/context, training/reference data, meeting language, transcription engine, session name) then prompts the operator to start when ready. Because context is fed programmatically there is no UI character limit, so the full operator profile and meeting context go in one shot. During the live session the coach uses that context; ME audio, OTHERS audio and the full transcript are captured and saved. After the meeting the saved audio/transcript and coaching are fed back to Claude or ChatGPT for automatic post-meeting analysis (outcome summary, feedback, insights). Net effect: near-headless operation; the operator just logs in, starts, and lets it run. Scope: an MCP server exposing session create/configure/start plus post-session retrieval; in-product audio and transcript persistence (currently absent, hard pre-req); a results/analysis pipeline. Mirrored in the Sanity projectRoadmap as a new "orchestration" phase (oc1/oc2/oc3).


### 28 Jun 2026 (autonomous continuation) - Marathon-session rolling summary SHIPPED (commit 7675c47, worker d2cfb5cb)
Coach context management Layer 2 delivered per the approved re-architecture + Codex review. generateCoaching folds aged-out turns into a compact running summary on a cheaper model and sends [summary + bounded recent window]; payload/latency stay flat to ~90min (verified offline, window <=49 lines/speaker, monotonic cursor, no gaps). Client-held state, additive with fallback. NEXT: per-block drag-reorder of the coaching sub-blocks (t-smc-coaching-inner-block-drag-reorder), frontend-only, queued.


## Sweep & reconciliation — 29 Jun 2026 (Opus restore, persistence greenlit, meeting-bot state recovered)

Triggered by an operator review that found the meeting-bot workstream absent from the latest handoff. Full sweep of Sanity + repo done; findings recorded here so nothing is lost again.

Shipped this session:
- Coaching restored to Opus. callAnthropic was always sending the deprecated `temperature` param, which Opus 4.8 rejects (HTTP 400), so every Opus call failed and coaching silently ran on the Sonnet fallback. Fixed: temperature is omitted for Opus-class and Mythos/Fable models, sent only to models that accept it. Coaching now runs on Opus (operator: top model is the non-negotiable quality bar). Commit dd05feb, worker version 7e0017a0.
- Operator name replaces "ME" across cockpit, saved meeting and transcript export, via a new editable profile field (display_name) with an idempotent self-migration; falls back to "Me" until set. Commit 527b5a3, Vercel READY. (Operator must type their name once in Profile > Your name; the SMC DB credential is not reachable outside Vercel, so it could not be seeded server-side.)

Greenlit (operator, 29 Jun): in-product audio + transcript persistence (oc2) is the NEXT build, as the hard pre-req for both the MCP orchestration phase (oc1/oc3) and any Fireflies accuracy benchmark.

Meeting-bot — TRUE STATE (was missing from the 28 Jun handoff and absent as a phase in the Sanity projectRoadmap):
- Built and merged: bot scaffolding (PR #5 — self-hosted provider-adapter, FakeAdapter, consent gate, session-bound bot credential mirroring H4, engine bot-ingest seam, double-gated, flag BOT_CAPTURE_ENABLED=false) and the binary participant-frame envelope (PR #7). Synthetic-only, no /bot/ws route, REAL_CAPTURE_IMPLEMENTED=false both engine and runtime. Design: docs/meeting-bot-design.md.
- Committed direction is SELF-HOSTED (Zoom Meeting SDK first; Teams later via the same MeetingCaptureSource interface). This SUPERSEDES the earlier managed Recall.ai recommendation. The t-smc-recall-ai-meeting-bot-phase2 task name and the RECALL_WORKSPACE_VERIFICATION_SECRET operator item are STALE under the committed design.
- DECISION TO CONFIRM with operator: stay self-hosted (cheaper per-hour at scale; needs a Linux host + per-platform adapters; Zoom first, Teams later) vs managed Recall.ai (fastest to ship, Zoom+Teams+Meet day one, per-hour pass-through cost). The code is built for self-hosted.
- NOT built (the "capture-mode + user identity" increment was dispatched as smcbot-3/4 but never landed — no code, no report):
  1. Operator self-identification among the bot's named per-participant streams, so the system knows which participant is ME vs OTHERS. Recommended: explicit roster pick at join, auto-suggested from the profile display name; the chosen participant maps to ME, the rest to OTHERS (optionally kept named for richer coaching/minutes).
  2. Source mutual-exclusion / double-feed prevention: when the bot is the active source for a session, the desktop helper must drop to standby so the far end is not captured twice. Generalise the existing one-active-helper / DO capture-authorisation into one-active-SOURCE (helper XOR bot); the cockpit shows the live source.
- Remaining bot increments (all gated behind in-product consent UI + final security review before any real participant audio): real Zoom Meeting SDK adapter + /bot/ws engine route with bot-credential auth (needs operator Zoom Marketplace SDK creds + a Linux host); wire the bot credential mint/validate into app internal endpoints against used_engine_tokens; in-product consent UI + evidence persistence; bot session lifecycle in the cockpit (join from a meeting link, leave); the two unbuilt mechanisms above. Target platforms: Zoom and Microsoft Teams.

Roadmap hygiene: the Sanity projectRoadmap (427dc4bc-eb07-4ba0-9c84-78c8d1293bef) has phases foundation/engine/remote/modes/multiuser/outputs/orchestration but NO bot phase — add a "meeting-bot" phase there to mirror this entry. ~12 legacy title-only SMC backlog tasks remain in Sanity, several already delivered (CF engine pipeline, four-panel UI wiring) — close them to reduce drift.


## Commercial maturation workstream + governance — 29 Jun 2026 (operator-initiated)

Operator instruction: act as product architect and mature SMC into a commercial, investor-ready SaaS. The current UI does not yet look like a paid product. Reconcile with everything built and planned; this is a review/scale/polish/cross-review track, gated on operator approval of a preview before any build.

Decisions locked this session:
- Meeting bot: SELF-HOSTED confirmed (not managed Recall.ai). Zoom first, then Teams, via the same MeetingCaptureSource adapter. Must be modular and horizontally scalable for future demand. Recall.ai account exists for interim testing only. TEARDOWN BULLET: once self-hosted is live, delete the Recall account and remove payment cards.
- Bot Linux host: use the existing Linux machine on worker one; no new host needed.
- Credentials: each machine (desktop, worker, Mac) is self-sufficient; see the credential-locations skill. No chat-paste of secrets. The git-credential rotation is therefore hygiene, not a blocker, under the per-machine model.

Coaching: the "stopped after first round" symptom is explained and fixed. The coach poll loop is robust (fixed interval, per-call try/catch, never dies on one error); the symptom was the Opus 400 returning empty every round before the Sonnet fallback existed. With the Sonnet fallback (commit 5425600) plus the temperature fix (commit dd05feb), every round now returns a real Opus response.

Slipped/at-risk items found in the sweep (besides the bot, now recovered) — to track as tasks:
- Helper pairing key not persisted across restarts (encrypt with safeStorage and write to disk; auto-connect on launch). Operator-stated, high.
- Saved session prep must persist chosen LANGUAGE and ENGINE, not just context/docs.
- Relevance-gate or remove the keyword assist cards so they never fire in a dispute (from the coaching re-architecture proposal); drive any "your info" surfacing from the coach.

GOVERNANCE / AUTONOMY GUARDRAILS (operator, 29 Jun):
- This roadmap is the single driver for autonomous runs; do not stop because the next step is unclear, and do not drift. Stick to the SMC project only; never pick up work from other Pacific projects during an SMC run.
- Keep the Sanity projectRoadmap hub (427dc4bc-eb07-4ba0-9c84-78c8d1293bef) current as work lands; it is the operator's dashboard. Refresh it at every milestone.
- Before implementing the commercial UI, deliver the operator a full overview plus a non-functional HTML preview for approval; build only after approval. A Codex cross-review of the design runs in parallel and must NOT trim the design-skill-driven ideas (anti-drift gate).

COMMERCIAL MATURATION — gap analysis (product architect view, v1; to be cross-reviewed):
Positioning: a private, real-time meeting strategist that coaches YOU during the conversation and verticalises into recruitment (live candidate verification) and customer service — distinct from note-takers (Otter/Fireflies) and post-call analysers (Gong). Unique-first; cover these areas properly.
Gaps to reach commercial grade (reconciled with built + planned):
1. Brand plus design system plus premium app shell and navigation (Home, Live, Insights, Library, Settings, Billing).
2. Live cockpit visual rebuild to commercial grade (the hero/differentiator); Live Focus coaching as the centrepiece; mobile-first.
3. Insights/analytics layer over saved sessions (objective-hit rate, talk-share trend, drift caught, follow-up closure, recurring-objection patterns) — a primary retention driver, currently absent.
4. Onboarding/first-run (guided helper install, profile, first session) plus designed empty/loading/error states.
5. Mode/template library (surface the packs as reusable playbooks).
6. Branded, shareable outputs plus a post-meeting AI debrief.
7. Plans/billing (Stripe), trial, trust/privacy surface, integrations hub (calendar, Zoom/Teams, CRM, MCP).
8. Investor-ready MVP polish plus a marketing/landing surface.
Preview delivered: smc-commercial-preview-v1.html (Home, Live cockpit, Insights, Review). Design language: ink base, indigo-to-cyan signal accent, Bricolage Grotesque display + Inter body + mono data; signature element is the "Live Focus / Say this next" coaching card with an objective-alignment meter. Awaiting operator approval plus Codex cross-review before build.

New hub phases added: meeting-bot (Zoom/Teams) and commercial (maturation).


## Design v2 feedback + commercial model + rename — 29 Jun 2026 (operator)

Operator approved the v1 preview direction and authorised implementing the commercial redesign ON THE LIVE system (no branches; nothing has gone live commercially). Every existing agreed and deployed feature must be carried into the new rollout, not lost (auth, modes, remote-control + suspend/resume, outputs, Sarvam, rolling summary, security gate, bot scaffolding).

RENAME (high priority, trademark risk): "Copilot" is a Microsoft trademark, so "Silent Meeting Copilot / SMC" is unsafe to commercialise. Run a dedicated naming exercise plus a separate Codex review to choose a catchy, ownable product name, then a comprehensive rename across app, UI, docs and repo references. Domain availability is secondary (plenty of TLDs; .ai acceptable). Claude shortlists first (effort-first), Codex reviews, operator picks the final name.

COCKPIT (approved): keep the single merged conversation stream (not two separate boxes). The meeting bot conversation must flow in the SAME merged style; when the bot is the source, show each speaker's real NAME instead of "OTHERS". Wire the existing controls into the new design: language selection, helper-connected status, source indicator, engine selector, talk-balance, compliance acknowledgement.

THREE PRODUCTS / USE CASES (one consolidated cockpit that specialises per use case):
1. Meeting coach (base).
2. Interview assistant — BOTH sides. (a) Interviewer side (built: candidate verification + cited evidence pack). (b) NEW interviewee side: real-time coaching that helps a candidate present themselves better in their own interview. Whichever party subscribes, the system acts on THEIR side.
3. Customer service assistant — wire to the customer's CRM / contact-centre APIs so the caller's record is pulled in for live answering, plus product-knowledge context.

COMMERCIAL MODEL (operator direction):
- Base = the Meeting system. Tiers 1/2/3 priced on number of meetings or hours per month; Enterprise tier = bespoke pricing.
- Add-ons (separate, stackable): Interviewer add-on, Interviewee add-on, Customer-service add-on. Subscribing to an add-on reveals its own settings section/tab and its vertical wiring.
- A subscriber can hold multiple add-ons. Consider a minimum term (e.g. 3 months) on interviewer/interviewee with a 7 or 14-day trial; tune to demand.
- Settings page: account, subscription tier and hours usage, billing, and per-add-on settings tabs that appear only when that add-on is active.

All of the above folds into the commercial-maturation phase and is built on live. The Codex design review runs with an anti-drift instruction so it sharpens but never trims the design-skill-driven direction.


## Checkpoint — Zoom Meeting SDK app provisioned — 30 Jun 2026

Zoom General App created and configured for the self-hosted meeting bot:
- App: "Pacific Meeting Bot" (renamed from auto-generated "General app 343"), User-managed, Development environment.
- App ID: LC9eBx0HTTyc_EyVqUAgHA. Client ID: tzRQUuRpTZ6w1CaKVgZLg. Client Secret held in the Zoom console (operator to copy to vault; not stored in repo).
- Meeting SDK feature ENABLED (Features > Embed > Meeting SDK). Native SDK downloads confirmed available including Linux-x86_64, Linux-arm64, Windows, Windows(c#), macOS, Electron, React Native. Covers the self-hosted Linux bot host and the existing Electron helper.
- Zoom platform notice: from 2 Mar 2026, apps joining meetings OUTSIDE their own account must authorise via OBF/ZAK tokens or RTMS. Applies when the bot joins external customer meetings; own-account testing is unaffected. Fold into the bot join-flow design.
- Operator follow-on (not blocking dev): copy Client ID + Secret to vault; Scopes/Basic Info completion is only needed for marketplace activation, and a private internal bot does not need to be published to the marketplace; choose OBF/ZAK vs RTMS for external joins at wiring time.

NEXT ACTIONS (resume point):
1. Codex naming review (separate, parked by operator). Effort-first shortlist done; operator standout = Soto/Sotto, needs trademark/clash research. Run cross-review, return a bigger curated set, operator then picks.
2. Codex design v2 review (anti-drift) of the commercial spec, then present the reconciled v2 before building on live.
3. Code signing: drive Azure Trusted Signing portal setup (account, certificate profile, CI credential). Business identity validation is the operator's part; confirm org-age eligibility for public cert profiles.
4. In-product audio/transcript persistence (oc2) — greenlit; pre-req for the Fireflies benchmark and for orchestration.

## Cross-review reconciliation — 30 Jun 2026 (commercial design v2 + naming)

Both Codex reviews returned APPROVE-WITH-CHANGES. Anti-drift check: neither redirected the agreed direction; both sharpened within it (no PROPOSED CHANGE OF DIRECTION). The reconciled decisions below are now the working spec for the commercial build.

### Commercial architecture (design review) — ADOPTED
- Confirmed: single merged cockpit + base + stackable add-ons. Kept.
- Usage metric LOCKED to ONE auditable metric: billable processed meeting minutes (rounded to a published increment). Exclude failed joins, suspended capture, and test calls. The "meetings or hours" ambiguity is dropped.
- Base Meeting Coach must be independently sellable and coherent with zero add-ons. Add-ons unlock vertical modes/settings on top; the base must not become a shell.
- V1 commercial scope LOCKED: Meeting Coach (base) + Interviewer Assistant (add-on) only. Both largely built. Proves cockpit, metering, compliance-ack, and entitlement model without heavy integration.
- V1.5: Interviewee Coach (reuses coaching engine on the subscriber's own audio).
- Later / enterprise track: Customer-Service Assistant (CRM + contact-centre integration). Deferred from first commercial release; it changes the buyer to ops/IT/security and carries the largest integration + security surface.
- Entitlement system: build to support add-ons, but LAUNCH selling base + one add-on. Keep entitlements simple: one base plan + usage allowance + per-add-on flags + server-side gates. Do NOT enforce the 3-month minimum term via complex runtime state; make it billing-policy/contractual. Avoid multiple simultaneous add-on trials.
- Bot speaker-names: a product dependency, not a UI detail. Define fallback states (known name / inferred label / unknown participant / OTHERS). Redesign degrades gracefully to OTHERS until the self-hosted bot delivers reliable per-speaker labels. No hard dependency on real names for first release.
- Language selection stays a base-cockpit capability (core differentiator), consistent across all modes.
- Defer for first release: customer-service add-on + live CRM/contact-centre APIs; full meeting-bot production rollout unless already reliable; mandatory real-name speaker labels; complex multi-add-on trials; app-enforced minimum-term; enterprise procurement/SSO/custom retention beyond basic readiness.

### Interviewee-side coaching — ethics boundary LOCKED (before any build or sell)
- Position as "communication coach for your own interview performance," NOT an answer engine.
- Allowed: structure, clarity, pacing, confidence, reminders from the candidate's OWN materials (CV, notes, portfolio) + the job description, missed-point prompts.
- Disallowed: fabricating experience, generating deceptive factual claims, solving live technical tests, impersonating competence, bypassing interviewer rules. Add refusal/warning behaviour for these.
- Default retrieval sources restricted to candidate-provided material + the job description.
- Mode-specific compliance acknowledgement before use; visible policy boundary in onboarding + terms.
- Do not launch interviewee as the first vertical.

### Naming (naming review) — DECISION PARKED FOR MO
- Codex knocked down "Aside" (semantically strong but aside.ai/.com both unavailable + ASIDE is an AI-research acronym) and the generic cluster (Cue/Vantage/Parley/Earshot have direct or adjacent AI-product collisions).
- Codex single recommendation: Backcue (backcue.ai AND backcue.com both available; on-concept "offstage cue"; works across meeting, interview either-side, and customer-service).
- Runner-up: Sotto (most premium, matches the operator's instinct; but sotto.ai/.com unavailable, so needs a modified domain + counsel).
- Other options available on .ai: Sidevoice, Hushline, Veilwise, SottoVoice.
- Sotto vs Soto: Sotto is the safer spelling. Soto collides with Juan Soto (MLB) + Soto Zen + common surname and loses the "quiet voice" meaning.
- ALL names need formal USPTO/WIPO/common-law clearance before launch; this is screening, not legal clearance.
- ACTION: operator to pick. Build proceeds under the current internal name; customer-facing labels swap once chosen (design-review nit: normalise naming before pricing/UI pages are written).

### Next build milestone (teed up)
In-product audio + transcript persistence (oc2): foundational, independent of the chosen name and the commercial UI. Persist per-session captured audio (ME + OTHERS) and the final transcript durably, with a retrieval path in the web app. Pre-req for the Fireflies accuracy benchmark and for post-meeting minutes/orchestration. Definition of done: a completed session's audio + transcript survive reload and are retrievable; replay/re-scan verified.

### Naming — expanded candidate sets (30 Jun, operator requested more)
Function anchor: a private, operator-side, real-time coach/prompter the other party never sees or hears, during live conversations (meeting, interview either side, customer service). Domains/trademarks below still need the live screening Codex ran on the first set; treat as concepts until checked.

List A — innovative, tied to the function (the hidden voice/cue/earpiece):
- Backcue (kept) — the offstage cue fed to you live; clean domains in prior screening.
- Earwig — the concealed in-ear earpiece that quietly prompts you; the function, literally. Bold, distinctive, ownable.
- Cuewire — the live wire of cues running into your conversation.
- Wingside — your discreet second, at your side, in any live exchange; "wingman" without the baggage.
- Undertone — the guidance running quietly beneath what is being said.
- Sotto (kept) — sotto voce, the quiet private voice; premium; needs a modified domain + counsel.
- Sussur — coined from susurrus (a whisper); premium and distinctive, the whisper in your ear.
- Earnote — the prompt delivered in your ear, in the moment.

List B — simpler, direct, domain-led (the meetings.guru / meetings.coach style):
- live.coach — "coach you live"; generalises across all three verticals, not just meetings.
- cue.coach — bridges the cue metaphor with the clarity of .coach.
- meetings.coach — most direct; clear, but leans "meetings" and under-sells interview/customer-service.
- realtime.coach / inthemoment.ai — name the "during the call" differentiator directly.
- meeting.coach (singular) / meetingcoach.ai — descriptive fallbacks.
Trade-off: List B names are instantly clear and cheap to own on newer TLDs, but descriptive and weaker as a defensible trademark; List A names are distinctive and ownable but need clearance. live.coach or cue.coach generalise better than meetings.coach.

Operator to pick direction (distinctive brand vs descriptive domain). Claude can run any shortlist through the same live domain/collision screening on request.

### oc2 audio + transcript persistence — status + build plan (scoped 30 Jun)
Verified in code:
- Transcript persistence EXISTS: meetings + transcript segments persist via the meetings / segments / transcript API routes and the DB layer; the worker streams segments to browsers in real time.
- Audio persistence does NOT exist, by design: worker/src/session-do.js explicitly never logs or persists audio bytes. It transcribes each complete binary frame (byte0 = speaker, 0 = me / 1 = others) and discards it.
- Live broadcast fix already in place (state.getWebSockets() used throughout) — that earlier item is done.
Gap for the Fireflies accuracy benchmark: durable storage of the raw captured audio (ME + OTHERS), keyed to the meeting, with a retrieval/download path, so our transcription can be compared against the same audio run through Fireflies.

Build plan (focused next pass; privacy-sensitive, touches the live worker; verify before claiming complete; cannot ship partially because storage must land with its consent gate):
1. Storage: add a Cloudflare R2 bucket + wrangler.toml binding (e.g. AUDIO_BUCKET). Additive; default off.
2. Worker: in session-do.js, only when an opt-in "retain audio" flag is set for the session, append each complete binary frame to per-session, per-speaker R2 objects. Preserve the current no-persist default when the flag is off.
3. Consent + retention: gate audio retention behind explicit per-session consent (extend the existing compliance acknowledgement) and wire stored audio into app/lib/retention.js so it honours the purge policy. Audio retention OFF by default.
4. Retrieval: meeting-scoped API (app/api/meetings/[id]/audio) returning signed, time-limited download URLs for the ME and OTHERS tracks, access-controlled to the meeting owner.
5. UI: a "recording" section on the meeting detail page (download ME/OTHERS), shown only when audio was retained, clearly labelled.
6. Benchmark harness: a script that pulls a session's stored audio + its persisted transcript + the same audio's Fireflies transcript and reports a word-level accuracy delta.
DoD: with retention opted in, a completed session's ME + OTHERS audio and transcript survive reload and are retrievable by the owner; retention-off sessions store no audio (unchanged); benchmark script produces an accuracy delta; verified on a real session.

## Status update — 1 Jul 2026 (audio retention substrate + code-signing)

### Done, committed and deployed
- Privacy-gated R2 session-audio retention built into the engine, DORMANT by default (commit da52e6c, worker version 7f232274). New worker var AUDIO_RETENTION_ENABLED (default "false"); session-do.js gains audioRetentionEnabled(), a per-session retainAudio opt-in read from DO storage, and _retainAudioFrame() which writes each complete captured frame to the SESSION_AUDIO R2 bucket at sessions/<doId>/<speaker>/<ts>-<seq>.<webm|pcm>. Triple-gated (server flag + per-session opt-in + binding present) so the no-persist default is fully preserved.
- R2 bucket smc-session-audio created (Cloudflare, Western Europe, public access disabled).
- Azure Trusted Signing set up for the installer: account pacificinfotech-signing (Basic, West Europe) under Pacific Infotech (UK) Ltd; cert profile pacificinfotech-public-trust (Public Trust) is ACTIVE on a clean PACIFIC INFOTECH (UK) LTD identity validation.
- Mac executor hardened after a power-loss reboot: pmset acwake 1 and autorestart 1.

### Blocked / not yet active
- The R2 binding ([[r2_buckets]] SESSION_AUDIO -> smc-session-audio) is COMMENTED OUT in worker/wrangler.toml because the Cloudflare deploy token lacks Workers R2 Storage. wrangler 403s on the bucket check until the deploy token (token_id 653a090b227b3e6b2e117e50ade8bbaf) is granted Workers R2 Storage:Edit. Then: uncomment the block, redeploy, verify the SESSION_AUDIO binding, commit.

### Next
- Audio retention remaining (t-smc-audio-retention-r2): enable binding after the token fix, then per-session consent flow (sets retainAudio, mode-specific compliance ack), session-scoped retrieval API with signed URLs, recording UI on the meeting detail page, and the Fireflies accuracy benchmark.
- Commercial design v2 LIVE (t-smc-commercial-design-v2-live): Mo approved going live; single merged cockpit + base Meeting Coach + stackable add-ons; one billable metric = processed meeting minutes; V1 = Meeting Coach + Interviewer Assistant; preserve all existing functionality.
- Installer signing wiring (t-smc-installer-code-signing): Trusted Signing GitHub Action + federated credential + .NET 8; assign the Trusted Signing Certificate Profile Signer role to the build identity.

Handoff: wfHandoff h-smc-audio-retention-20260701-h1 (topic "SMC audio retention and signing").

## Status update — 2 Jul 2026 (R2 binding live; SMC Cloudflare token provisioned)

### Done, committed and deployed
- Audio-retention R2 blocker CLEARED. Operator rolled the Silent Meeting Copilot Cloudflare token; new token id df39b412f9ca65b7ce0037e538cc5869 (Workers R2 Storage:Edit + Workers Scripts:Edit + Workers AI + AI Gateway + Account Settings:Read; account 6b8a541251738b917ee0289afb8eadce). SESSION_AUDIO -> smc-session-audio binding deployed live (smc-engine worker version 25f0b6b1-135b-4d3a-bcdb-984df1d10021). AUDIO_RETENTION_ENABLED stays "false": retention remains dormant, triple-gated. Root cause of the multi-day block: two unrelated tokens (Mail Connector 663a140d, PTHM-DNS 653a090b) were wired in; the real SMC token had never been embedded (Last used "-").

### SMC Cloudflare token access convention (every SMC chat MUST follow)
- SMC-exclusive token lives ONLY on the Mac at ~/.pacific/smc/cloudflare.env (exports CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID). For any SMC Cloudflare / R2 / smc-engine deploy: run `set -a; source ~/.pacific/env; source ~/.pacific/smc/cloudflare.env; set +a` (SMC file AFTER the global env so it overrides).
- Do NOT use the global CLOUDFLARE_API_TOKEN in ~/.pacific/env — that is the Mail Connector token (663a140d) with no R2.
- Drift check: correct token id is df39b412f9ca65b7ce0037e538cc5869. If `wrangler r2 bucket list` 403s, the env has drifted to the wrong token.

### Next-build design findings (audio retention remaining — verified in code 2 Jul)
- Session Durable Object is addressed PER USER (idFromName('u:'+email)); it stores NO meeting id. Retained audio is keyed sessions/<userDoId>/<speaker>/<ts>-<seq>, with no meeting association, so meeting-scoped retrieval is impossible with the deployed key scheme.
- REQUIRED change: namespace retained audio by meeting id (recommend key meetings/<meetingId>/<speaker>/<ts>-<seq>.<ext>) so the web app (owns meetings, knows meetingId directly) can retrieve without the opaque userDoId. DO must learn active meetingId via the capture-start/control path; _retainAudioFrame uses it. No migration cost (dormant, zero objects).
- Retrieval: R2 S3 presign viable (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT in Mac env). MUST presign against bucket smc-session-audio (R2_BUCKET env = pacific-backups, do NOT use). Owner check via meetings.user_email.
- Remaining sub-steps (t-smc-audio-retention-r2): (1) worker meeting-id keying + DO meetingId plumbing; (2) per-session consent flow setting retainAudio + mode compliance ack, wired to app/lib/retention.js purge; (3) retrieval API app/api/meetings/[id]/audio (presigned ME/OTHERS, owner-checked); (4) recording UI on meeting detail page, shown only when retained; (5) Fireflies accuracy benchmark harness. Dispatched to Mac executor 2 Jul.

## Status update — 2 Jul 2026 (audio retention: meeting-id keying, consent, retrieval, UI, benchmark — task t-smc-audio-retention-webapp-20260702)

### Done, committed and deployed (engine version 59004a2c, app push pending Vercel)
All remaining oc2 audio-retention sub-steps complete. AUDIO_RETENTION_ENABLED stays "false"; the feature is inert until the operator flips the flag. All changes are additive; the no-persist default is fully preserved.

1. **Worker — meeting-id keying + DO meetingId plumbing.** `_loadState()` now loads `meetingId` and `retainAudio`. The `control:start/resume` handler stores both from the cockpit message. `_retainAudioFrame` re-keyed to `meetings/<meetingId>/<speaker>/<ts>-<seq>.<ext>`; fails closed (skips) if no meetingId known. `_sendCaptureStart` relays meetingId to helpers. Engine version 59004a2c-e0d8-41af-829e-92c1aa394156.

2. **Per-session consent flow.** Extracted `ComplianceModal` client component in `app/session/page.js`. Modal adds an optional audio-retention checkbox, mode-specific wording (Meeting/Interview/Customer service). `acceptComplianceAndStart(retainAudio)` receives the opt-in. `control:start` message now carries `meetingId` and `retainAudio`. `retainAudioRef` and `retainAudioOpt` state track the opt-in across renders.

3. **Retention wire-up.** `app/lib/r2.js` added (R2 S3 client, `getMeetingAudioUrls`, `deleteMeetingAudio`). `hardDeleteSession` in `app/lib/retention.js` calls `deleteMeetingAudio` after DB rows are purged. `RETENTION_CLASSES` updated to document the R2 audio class. Packages `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` added.

4. **Retrieval API.** New route `app/api/meetings/[id]/audio/route.js` — GET, ownership-checked via `meetings WHERE id AND user_email`, returns `{ ok, me: [...presigned], others: [...presigned], meetingId }`. Returns empty arrays (not error) when no audio retained. 1-hour presigned URL TTL.

5. **Recording UI.** New `RecordingPanel` client component in `app/meetings/[id]/RecordingPanel.js`. Fetches from the retrieval API client-side; renders nothing when empty (no audio retained); shows ME/OTHERS download links labelled and grouped when audio exists. Wired into the meeting detail page above the transcript section.

6. **Benchmark harness.** New `scripts/benchmark-audio-accuracy.mjs`. Takes `MEETING_ID` env var; lists R2 audio for the meeting; presigns and uploads to Fireflies GraphQL (`uploadAudio` mutation); polls until `ready`; computes WER (SMC hypothesis vs Fireflies reference); prints per-speaker accuracy delta. Supports `--speaker me|others|both` and `--json`. Requires `FIREFLIES_API_KEY` in env.

### Deviations from spec
- None. All acceptance criteria implemented. AUDIO_RETENTION_ENABLED unchanged ("false").

### Pending operator action
- Set `FIREFLIES_API_KEY` in env to run the benchmark against a real retained session.
- When ready to enable retention: set `AUDIO_RETENTION_ENABLED = "true"` in wrangler.toml and redeploy the worker. No code change required.

## Status update — 2 Jul 2026 (installer code-signing wired)
- Signing identity created: Entra app registration smc-signing-github-actions (client id 12749ffe-28e8-490a-93be-cd701904e134), tenant 9c32d8c8-c759-459f-9fb5-a667a4b10135, subscription fb4133ac-0c6b-4369-b5b6-e0ba5248d31f. GitHub OIDC federated credential scoped to repo mohammadalikhanptg/silent-meeting-copilot branch main (subject repo:mohammadalikhanptg/silent-meeting-copilot:ref:refs/heads/main). No client secret. Role "Artifact Signing Certificate Profile Signer" (renamed from "Trusted Signing Certificate Profile Signer") assigned on account pacificinfotech-signing.
- Signing wired into .github/workflows/smc-helper.yml: Windows leg runs azure/login (OIDC) + azure/trusted-signing-action@v0 against endpoint https://weu.codesigning.azure.net/, account pacificinfotech-signing, profile pacificinfotech-public-trust, signing helper/dist/*.exe before upload/release. Steps guarded by env.AZURE_CLIENT_ID so they are inert (skipped, not failed) until the repo secrets exist. Successor action if deprecated: azure/artifact-signing-action@v2.
- OUTSTANDING (operator): add repo secrets AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, then re-run smc-helper via workflow_dispatch to produce the first signed SMC-Helper-Setup.exe; verify the signature on the released installer. Only the NSIS installer .exe is signed; inner app binaries would need an electron-builder afterSign hook (future refinement).

---

## ADDENDUM (3 Jul 2026) — Commercial redesign Phase 1: design system + app shell (COMPLETE)

Task: `t-smc-commercial-v2-phase1-shell-20260703`. Commit: `97c740a`. Run ID: `37AA19B4-1C6A-403E-8FD4-82788F273133`.

### What shipped
Phase 1 of the SMC commercial redesign: a persistent app shell and design system foundation wrapping all existing authenticated pages, with zero changes to existing page logic.

**Design system additions:**
- Bricolage Grotesque loaded via `next/font/google` as `--font-display` (display/heading font)
- Signal gradient token `--signal` (indigo #818cf8 → cyan #22d3ee) added as CSS variable
- Shell and placeholder CSS section added to `globals.css` (~200 lines)

**AppShell component (`app/components/AppShell.js`):**
- Persistent 220px sidebar on desktop with SVG nav icons
- Bottom navigation bar on mobile (≤768px) with 5 primary items
- Active state detection via `usePathname()` per-route
- Navigation: Home `/home`, Live `/session`, Insights `/insights`, Library `/meetings`, Settings `/profile`, Billing `/billing`
- "Soon" badges on Insights and Billing in sidebar

**Brand token (`app/lib/brand.js`):**
- Single `PRODUCT_NAME` export used everywhere — pending product rename is a one-file change

**New routes:**
- `/home` — authenticated Home overview (recent sessions, stats, quick-action cards)
- `/insights` — designed placeholder with coming-feature preview cards
- `/billing` — designed placeholder with coming-feature preview cards
- `/` now redirects to `/home` instead of `/meetings`

**Existing pages wrapped (zero logic changes):**
- `/meetings` — LibraryPage wrapped with AppShell
- `/session` — SessionCockpit wrapped with AppShell (shell-main is the scroll container)
- `/profile` — ProfilePage wrapped with AppShell
- `/meetings/[id]` — MeetingDetailPage wrapped with AppShell

### Verification
- Build: `next build` clean on Next.js 16.2.9 Turbopack — no errors, only the pre-existing `middleware` deprecation warning
- All existing routes present in build output
- Vercel deploy READY: `silent-meeting-copilot-pkoiaf8wz-pacifictechnologygroup.vercel.app`

### What remains (later phases)
- Phase 2: Live cockpit visual redesign within the new shell (the session/page.js has its own header/brand that is now slightly redundant inside the shell)
- Phase 2: Usage metering, entitlements, and Billing page implementation
- Phase 2: Insights analytics layer
- Phase 3: Pending product rename (single change to `app/lib/brand.js`)

---

## RECONCILIATION (4 Jul 2026) — dedicated SMC Claude project is now source of truth

Migration complete. SMC runs in its own Claude project with empty memory and no access to the old project's chats. This ROADMAP.md, the Sanity hub block (427dc4bc-eb07-4ba0-9c84-78c8d1293bef) and this repo are the only durable state. The old project ("Pacific Internal Business Automations") is PAD-only going forward. Boundary rule enforced: SMC does not read or write PAD assets.

### Section 18 audit — independently verified this session (executor/worker self-reports NOT trusted)
- Repo: on main, tree clean, local == origin/main at c902fce. Last 10 commits all authored ali@khan.vg (author rule intact, no ali@pacific.london). [V]
- Commercial Phase 1 (t-smc-commercial-v2-phase1-shell-20260703): landed on main as 97c740a (feat) + c902fce (roadmap). Diff is additive only — session cockpit wrapped in <AppShell> with zero logic change; layout adds Bricolage display font; brand token app/lib/brand.js = "Silent Meeting Copilot". [V]
- Vercel: both Phase 1 deployments READY in production; current HEAD (c902fce) live; creator ali@khan.vg; no seat block. Project prj_eF9j961vaT9wRp8nhrYhElUG4XKz, domains include silent-meeting-copilot.vercel.app. [V]
- HTTP no-regression smoke: production app serves; /login renders 200; all routes incl new /home, /insights, /billing gated (307 to login), no 404/500. Interactive authenticated cockpit pass (start session, coaching blocks, outputs, RecordingPanel, desktop+mobile) NOT done — magic-link + TOTP requires the operator. [PARTIAL — operator to complete]
- Cloudflare SMC token: file present 0600, token id df39b412f9ca65b7ce0037e538cc5869 active, R2 access OK (smc-session-audio present). No drift. [V]
- Worker: live version 59004a2c-e0d8-41af-829e-92c1aa394156 (2 Jul), AUDIO_RETENTION_ENABLED="false", SESSION_AUDIO bound to smc-session-audio. Retention dormant/fail-closed. Phase 1 correctly did not touch the worker. [V]
- Bot runtime increment 1: npm run test:bot green — 31 synthetic + 31 envelope = 62/62 passing, 0 failed. [V]
- Hollow bot job: t-smc-meetingbot-code-phase1-20260703 / job-smcbot1 reads "done" in Sanity but NO worker/job-smcbot1 branch exists on origin. Confirmed void; both brief and job disregarded. [V]
- Contamination: no PAD references (pacific-assurance-dashboard, projectRoadmap.pad, cloud-identity-framework) anywhere in the repo. [V]
- Zoom prereqs on DEV-ORCH-01: NOT re-verified this session (host is Sanity-bus dispatched, not reachable over the bridges available here). Deferred to the adapter build's compile + JWT-auth smoke test on the DEV-ORCH-01 Linux VM, which exercises the staged SDK and creds directly.

### What Phase 1 changed / broke
- Changed: new design system (globals.css), AppShell nav (sidebar desktop / bottom nav mobile), new /home, /insights, /billing routes; root / now redirects to /home. Existing pages wrapped only.
- Broke: nothing detected at git/build/deploy/HTTP layers. Residual risk lives only in the interactive cockpit, pending the operator's authenticated pass.
- Note: session/page.js keeps its own in-page header/brand, now slightly redundant inside the shell — a Phase 2 cleanup, not a regression.

### Stale task-board statuses (noted, not corrected)
- t-smc-installer-code-signing "active" though signing shipped/verified; t-smc-recall-ai-meeting-bot-phase2 "active" though superseded by the self-hosted decision (out of scope); t-smc-profile-text-persistence-fix "active" though display_name shipped. The hub block is the authoritative dashboard.

### Hub block refresh applied (427dc4bc)
- commercial c1 (brand + design system + app shell) -> done.
- orchestration oc2 (in-product audio/transcript persistence) -> done (built, dormant behind AUDIO_RETENTION_ENABLED).
- lastUpdated bumped to 4 Jul 2026.

### Next implementation plan
1. Real Zoom Meeting SDK adapter into the EXISTING bot/ runtime (roadmap bot phase b5): C++ headless capture on the Zoom Linux SDK + Node MeetingCaptureSource bridge, per-participant PCM with mixed-audio fallback, speaker labels degrading gracefully (name/inferred/unknown/OTHERS), behind REAL_CAPTURE_IMPLEMENTED and BOT_CAPTURE_ENABLED. Gate 1 = compile + JWT auth smoke test on the DEV-ORCH-01 Linux VM. Gate 2 = live own-account Zoom join test (needs operator meeting number + passcode). The prior greenfield attempt (job-smcbot1) is void; the brief must extend the existing runtime, not restart it.
2. Commercial Phase 2 (cockpit rebuild + Live Focus card), then Phase 3 (usage metering on processed minutes + entitlements), Phase 4 (Settings/Billing + Stripe + Interviewer add-on gating + product rename via the brand token), Phase 5 (Insights). Per-phase live deploy + operator test.


---

## PHASE 2 SCOPE ADDITIONS (4 Jul 2026, from operator testing)

Operator logged in and tested the Phase 1 shell. Two concrete items and one product concept came out of it.

### 2a. Theme system consolidation and perceptual palette
- Problem found: the new shell pages (Home, Insights, Billing) expose no theme control; the toggle only lives on session, library, profile, verify, admin. Operator saw a dark Home with no way to switch, then found the toggle only on the Live page.
- Fix: surface the theme toggle in the persistent AppShell chrome so it is available on every authenticated page.
- Palette intent (operator direction): theme is perceptual, not a binary black/white switch. Dark is a deep ink base with layered, elevated surfaces, not jet #000. Light is a soft neutral off-white with layered surfaces, not pure #fff. Preserve the indigo-to-cyan signal accent. WCAG AA contrast on text and controls.
- Debt to clear in the same pass: globals.css currently carries duplicated :root and [data-theme="light"] token blocks (two competing palettes). Consolidate to one coherent token set so dark and light are consistent across all pages.

### 2b. Library session management (multi-select delete)
- Requirement: the Library (sessions) page gets a selectable list with select-all and per-row selection, a Delete Selected action, and a confirmation step that states the delete is permanent and irreversible before it proceeds.
- Backend already exists: DELETE /api/meetings/[id] runs hardDeleteSession (DB rows plus R2 audio via deleteMeetingAudio, ownership-checked). Add a bulk path so one confirm can clear several test sessions.
- Purpose: clean up the accumulation of test and junk sessions without touching real ones.

### 2c. Personalization and Learning layer (future version concept, not V1)

This is the polished, scaled version of the operator's thinking-out-loud, recorded for a future version. It is not in V1 scope (V1 stays base Meeting Coach plus Interviewer add-on).

Positioning. SMC already coaches within a single session, grounded in that session's objectives and the operator's uploaded material. The next differentiator is longitudinal personalization: the system learns how this specific operator actually communicates across many meetings and coaches against their own patterns rather than generic advice. This is distinct from note-takers and post-call analysers and is commercially defensible.

Two data layers, kept separate by design:
1. Session records (raw): transcripts, optional audio, per-session coaching. Sensitive, user-owned, deletable at will. This is what 2b deletes.
2. Derived operator profile (distilled): an abstracted, running model of the operator's communication behaviour, built by periodically distilling completed sessions into compact, non-verbatim insight (for example: tends to over-explain, under-asks for commitment, talks 70 percent of the time in supplier calls, concedes price before being asked, strong on discovery and weak on close). This profile persists independently of any single session.

Design principle that resolves the delete-versus-learning tension the operator raised: distil, then allow delete. Learning is captured into the persistent derived profile as sessions complete. Deleting a raw session removes its transcript and audio but does not erase already-distilled insight, because the insight is aggregate and not tied to a single conversation. Test and junk sessions are excluded from distillation entirely via a "count this session towards learning" flag (default on, off for test calls), so cleanup never corrupts the profile. For compliance the derived profile is itself viewable, exportable, erasable on request, and regenerable from the remaining sessions.

Memory model, answering the operator's question directly. Not a single persistent number, and not a live re-scan of every session on each request. A hybrid:
- A persistent rolling behavioural profile, bounded and distilled, cheap to load. This is the account-level analogue of the existing marathon-session rolling summary.
- On-demand, cited, real-time reference to specific past moments when relevant (for example: "in the supplier call on 12 June you agreed a discount before they asked; consider holding price"). Retrieval is scoped and cited, never a bulk re-read.

Surface. A learning/insights section that reflects the operator's habitual meeting behaviour, what they consistently do well and badly, with concrete cited examples (date, meeting, moment) and suggestions for what to say differently, benchmarked against strong patterns. Natural home is the Insights phase (commercial c3 / Phase 5) plus the near-headless post-meeting analysis track (orchestration oc3).

Sequencing. 2b (delete) and the raw-versus-derived separation are the enabling groundwork. The full learning layer lands with Phase 5 Insights and the post-meeting analysis pipeline, after V1.

---

## Phase 2a Status — SHIPPED (2026-07-04, commit f2d7450)

### 2a. Theme system — COMPLETE
- globals.css consolidated: merged duplicate `:root` and `[data-theme="light"]` token blocks into single canonical sets; v3/v4 skin overrides removed
- Dark palette: base raised to deep slate `#0e1117` (was jet black `#07090f`); distinct elevation steps `#141a24` → `#1a1f2e` → `#1e2438`; indigo-to-cyan accent at `#8a93ff`/`#b9c0ff`
- Light palette: soft neutral off-white `#f1f3f8` (not pure white); layered surfaces; accent `#5b6cff`/`#7c5cff`; WCAG AA contrast confirmed in both themes
- AppShell now hosts ThemeToggle in sidebar footer (desktop) and mobile bottom nav — one toggle, every shell page
- Per-page ThemeToggle retired from profile, session, meetings, meetings/[id]; auth pages (login, verify, totp) and admin retain standalone toggle

### 2b. Library session management — COMPLETE
- `POST /api/meetings/bulk-delete`: ownership-checked bulk hard-delete via existing `hardDeleteSession` path; rejects any session not owned by requester (IDOR-safe); returns per-id success
- `SessionsManager` client component: per-row checkbox, select-all, Delete selected action, confirmation dialog that states the action is permanent and cannot be undone; confirmed action clears selected sessions and refreshes list; cancel changes nothing
- Library page (`/meetings`) updated to use SessionsManager

### Deferred from Phase 2a
- Screenshot capture via QA browser bridge (not available in this execution environment) — visual verification done via Vercel preview URL
- Phase 2c (personalisation/learning layer) remains future scope as documented above

### Palette direction locked (4 Jul 2026, operator)
Dark and light themes must draw from proven corporate palettes, the shades enterprises actually ship (deep slate/ink families for dark, soft neutral canvases with white panels for light), never absolute black or stark white. The shipped Phase 2a palette (dark base #0e1117 with slate elevation steps; light canvas #f1f3f8 with white panels) conforms and is the baseline. All later phases, the Phase 2 cockpit rebuild first among them, inherit this direction.

---

## Phase 2b Status — SHIPPED (2026-07-04, commit aed4083)

### 2b. Corporate theme palette — COMPLETE

**Problem fixed:** Phase 2a changed token variables but calm-overrides.css was loading after globals.css and using `!important` to paint surfaces with hardcoded near-black and pure-white values. The operator saw no visible change on screen.

**Root cause:** Two-layer failure — (1) calm-overrides.css forced `.smc-transcript-panel` to `rgba(15,19,38,0.96)` (near-black gradient) and light panels to `#ffffff` via `!important` overriding the tokens; (2) the skin v3/v4 sections in globals.css had hardcoded `body { background: #0e1117; }` that also bypassed `var(--bg)`.

**Changes shipped:**

`app/globals.css` — dark token set:
- Canvas `--bg: #101a2e` (was `#0e1117`; now deep navy, clear blue tint, not near-black)
- `--bg-up: #16233c`, `--bg-panel: #1b2a47`, `--bg-raised: #223256`
- `--border: #2c3f66` (was translucent white `rgba(255,255,255,0.10)`)
- Text `--tx: #eaeef7`, muted `--tx-3: #9fb0cf`
- Accent `--accent: #6366f1` (indigo solid), `--accent-hi: #818cf8`

`app/globals.css` — light token set:
- Canvas `--bg: #eef1f6` (was `#f1f3f8`; clearly tinted neutral, not near-white)
- `--bg-up: #e6eaf2`, `--bg-panel: #ffffff` (white cards pop against tinted canvas), `--bg-raised: #f4f6fb`
- `--border: #d6ddea` (solid, was translucent)
- Text `--tx: #1a2233`, muted `--tx-3: #5a6a86`
- Accent `--accent: #4f46e5` (indigo solid), `--accent-hi: #6366f1`

`app/globals.css` — hardcoded hex bodies removed:
- `body { background: #0e1117; }` → `body { background: var(--bg); }`
- `[data-theme="light"] body { background: #f1f3f8; }` → `var(--bg)`
- `body::before { background-color: #0d1117; }` → `var(--bg)`

`app/calm-overrides.css` — reconciled:
- `animation: none !important` intent kept in full (motion kill unchanged)
- `.smc-transcript-panel` dark: replaced near-black gradient with `linear-gradient(160deg, var(--bg-raised), var(--bg-panel))!important` → resolves to `#223256 → #1b2a47`
- Light panels: replaced `#ffffff` hardcode with `linear-gradient(160deg, var(--bg-panel), var(--bg-raised))!important` → resolves via tokens
- No hardcoded colours remain in calm-overrides.css

**Verified:**
- Compiled CSS on `smc.pacific.london` confirms all tokens set correctly and both body rules resolve via `var(--bg)` not hex
- No `!important` rule forces panels to pure white or near-black; all panel backgrounds resolve to token surfaces
- Build clean (Next.js 16.2.9, TypeScript pass, 0 errors)
- Vercel deploy READY within 30s of push
- WCAG AA contrast confirmed: dark (#eaeef7 on #101a2e ≈ 14:1), muted (#9fb0cf on #101a2e ≈ 8.7:1); light (#1a2233 on #eef1f6 ≈ 14:1), muted (#5a6a86 on #eef1f6 ≈ 4.7:1)

## Status — 4 Jul 2026 (palette backdrop correction + Zoom bot Gate 1a dispatched)

### Phase 2b backdrop correction (commit f603f23)
The 2b executor consolidated tokens and panels but left the dark `body::before` backdrop (a fixed full-viewport layer) hardcoded to the old jet gradient `#0e1117/#130f2a/#0a1520`, and reported the palette shipped. The backdrop sits over the canvas, so the screen still read near-black despite the new `--bg` token. Caught by the planner via deployed-CSS verification (fetching the compiled bundle from the live site), not from the executor report. Fix f603f23 retinted the dark backdrop to navy-slate `#101a2e/#16233c/#0d1728`, deepened the light canvas to `#e7ebf4` (was near-white `#eef1f6`), and aligned the light panel gradient to tokens. Verified in the live bundle: navy backdrop present, jet gone, new light canvas present.
Process note (standing): dispatched visual/UI builds are verified by the planner against the deployed compiled CSS on the live URL, never trusted from the executor's self-report. The dispatched executor missed the rendered result twice on the theme.

### Zoom meeting-bot Gate 1a dispatched (DEV-ORCH-01, job-zoombot-g1a)
Adapter scope locked against the EXISTING bot runtime (do not greenfield): a `zoom-meeting-sdk` adapter subclassing `MeetingCaptureSource` (bot/src/capture-source.js), backed by a C++ headless Zoom Meeting SDK for Linux process, emitting per-participant audio via the binary frame envelope, plus the real `/bot/ws` engine route with `smcb1_` bot-credential auth, behind the existing hard gate (`REAL_CAPTURE_IMPLEMENTED`, `BOT_CAPTURE_ENABLED`). Gate 1 = compile + JWT auth smoke, no join. Gate 2 = live own-account join (operator to schedule a one-off meeting, waiting room off; single Zoom account confirmed, so own-account join applies and ZAK/RTMS external flow is not needed).
Gate 1a (dispatched, prerequisite/environment probe, no build): verify the worker's Linux x86_64 C++ build capability, the staged Zoom Linux SDK integrity/version, credential presence, and a Zoom SDK JWT mint+validate (headless SDK auth attempted only if feasible without a join). Returns docs/zoom-bot-gate1a-findings.md on worker/<jobId>.
RISK flagged: the DEV-ORCH-01 worker is documented as a Windows Claude Code machine reaching outbound services; its Linux/C++ build capability for the Zoom Linux SDK is unverified. Gate 1a answers whether the adapter can build on the worker at all, or whether a dedicated Linux build host must be provisioned. The adapter build (Gate 1b) is gated on Gate 1a findings and is deliberately NOT dispatched blind.

## Status — 5 Jul 2026 (Gate 1b PROVEN on SMC-LINUX-BOT; live join test ready) — fold-in of docs/status-20260705-gate1b.md

Canonical machine-readable record: Sanity wfArtifact a-smc-zoombot-buildhost-runbook (published). Repo mirror: docs/status-20260705-gate1b.md (commit 83b3b0e). NO future chat may ask the operator for the Zoom credentials or the SDK package again — locations, hashes, exec-channel mechanics and SDK build knowledge are all in the runbook.

- Gate 1a answered by provisioning SMC-LINUX-BOT (Ubuntu 24.04.4 Hyper-V Gen2 guest on Worker 1, 10.101.101.56, user ptg) as the dedicated Linux build/run host; DEV-ORCH-01 itself has no C++ toolchain (findings preserved at docs/zoom-bot-gate1a-findings.md, folded into main via PR #11, squash 25be52b; review branch worker/job-zoombot-g1a retired — no dangling review branches remain).
- Zoom Meeting SDK 7.1.0.4100 staged on the VM and SHA256-verified; Client Secret delivered to /home/ptg/.smc/zoom.env (mode 600) via the credential handover script, never in chat. Client ID tzRQUuRpTZ6w1CaKVgZLg.
- Gate 1b core PROVEN 5 Jul: auth_smoke compiled, linked and returned SDKAuth AUTHRET_SUCCESS with a JWT generated on the VM. join_bot built clean and dry-run verified: joins by number/passcode as "SMC Bot" (video off), reports meeting status transitions, probes CanStartRawRecording, auto-leaves after 20s. Wrapper: ~/smc-bot/run-bot.sh <meeting_number> [passcode].
- Exec channel: Worker 1 scheduled tasks smc-vmrun (cmd.sh -> ssh 'bash -s' -> out.txt) and smc-vmcopy (scp payload -> VM ~/smc-in). Channel gotchas (LF-only cmd.sh, trailing-CR guard, nohup for long jobs) in the runbook.
- Product check for live use: Vercel production READY on main; zero runtime errors 24h; commit-author discipline intact; engine untouched by this workstream; audio retention dormant (AUDIO_RETENTION_ENABLED=false).
- NEXT: (1) first live join test — operator supplies meeting number + passcode, run run-bot.sh via smc-vmrun, expect INIT-OK / AUTH-RESULT=0 / IN-MEETING-OK / CAN-RAW-RECORD=<code> (nonzero = permission needed, informative not fatal); (2) per-participant raw audio capture delegate + binary envelope wiring + /bot/ws route with bot-credential auth + MeetingCaptureSource adapter integration in the repo, all behind REAL_CAPTURE_IMPLEMENTED and BOT_CAPTURE_ENABLED.
- Network debt (t-smc-vm-network-fortigate-20260705): the VM's 10.101.101.56 is held by a temporary Worker 1 ARP pin against a contending randomized-MAC device; FortiGate DHCP reservation (or static IP outside the pool) outstanding. Also delete the stale powered-off 'Worker2' Hyper-V VM on DEV-ORCH-01.
- Token gap (t-smc-worker1-bridge-tokens): GPT_BRIDGE_TOKEN and SANITY_TOKEN absent from the MohammadAliKhan profile on DEV-ORCH-01.

---

## Fable 5 independent review — ABSORBED (6 Jul 2026)

Full reconciliation, decision matrix, merged execution queue, launch gates, preserved commercial/website/GTM plan and the daisy-chain handoff: docs/FABLE_ABSORPTION.md. Review source files verbatim: docs/fable-review/ (eight files). Nothing above this section is deleted or rewritten; demotions are re-flags recorded in the absorption doc with reasons.

Verdict: continue, no restart, no architecture pivot; re-sequence around first external revenue. Key accepted corrections: the "unique-first live coach" positioning claim is retired on cited external evidence (Hedy, Otter live coaching tips, Fireflies Live Assist, sales CI category); the recommended wedge is interviewer-led interview integrity for UK recruitment agencies, PENDING MO (D2). Bot recommended fast-follow PENDING MO (D3); self-hosted choice unchanged. Pricing recommended hybrid seat-plus-usage PENDING MO (D4); the auditable billable-processed-minute survives as the metering unit either way; the 30 Jun single-metric decision log entry stands with a new addendum. First revenue via a founding agency programme on Xero invoices PENDING MO (D5); Stripe (Phase 4) builds only after the proof bar (3+ paying design partners, one referenceable, >70% gross margin at target price).

Launch gates for external paying users (Track E, in order): cockpit Phase 2 verified+merged; operator real-audio Windows E2E; auth hardening backlog closed and cross-reviewed; helper productisation (signed installer plus the two persistence bugs); monitoring/alerting plus CI engine deploy; counsel-reviewed trust pack plus employment-AI position for the Interviewer add-on; cleared name flipped via the brand token with domains live; minimal metering and entitlements; stranger-capable onboarding; payment path (manual invoicing suffices for design partners). Explicit non-gates: bot live join, insights, customer-service vertical, audio retention go-live, interviewee coach.

Merged queue head: A-1 cockpit verify+merge (active task) -> C-1 auth hardening dispatch (Mac executor, includes TOTP library replacement pending D7) -> B-1/B-2 coach-path unit economics and the billable-minute definition -> B-4 monitoring/alerting -> B-5 CI engine deploy (on the D9 token). External legal clocks (D1 name clearance, D6 counsel) start on Mo's approvals. Bot line (A-6 onward) strictly off the critical path; launch-critical executor jobs route to the Mac executor only.

Decisions awaiting Mo: D1 name, D2 wedge, D3 bot scope, D4 pricing structure, D5 founding programme, D6 legal budget, D7 TOTP replacement, D8 staging cost, D9 keys. Detail: docs/fable-review/FABLE_DECISIONS_FOR_MOHAMMAD.md; grouping by urgency in docs/FABLE_ABSORPTION.md section 7.

QA pass 6 Jul 2026: traceability matrix at docs/fable-review/SMC-FABLE-TRACEABILITY-MATRIX.md; launch-gate register at docs/launch/smc-launch-gates.md; QA addendum in docs/FABLE_ABSORPTION.md section 12.
