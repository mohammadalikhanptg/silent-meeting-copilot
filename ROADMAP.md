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
