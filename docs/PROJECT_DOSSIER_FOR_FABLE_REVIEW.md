# Project Dossier for Independent Fable 5 Review

Document purpose: consolidate the full current state of the Silent Meeting Copilot project so an independent Fable 5 review chat can analyse it across product, architecture, security, reliability, operations, testing, commercial viability, and go-to-market, without losing the original roadmap or context.

Created: 6 July 2026
Prepared by: project orchestration chat (Silent Meeting Copilot Chat 4)
Audience: independent Fable 5 review (architect, CTO, commercial strategist, product reviewer, security reviewer, launch advisor)
Status of this dossier: extraction and consolidation only. No code was changed, no remediation performed, no roadmap restarted.

Note on sources: this dossier consolidates the in-repo master roadmap (ROADMAP.md), the Sanity project roadmap hub, project memory, and the working state as of this session. Where a fact could not be confirmed from those sources it is marked UNKNOWN rather than guessed. Where historical decisions conflict, the conflict is documented and the superseding decision identified.

---

## 1. Project identity

- Project name: Silent Meeting Copilot (internal name; abbreviated SMC).
- Product/application name: pending rename. "Copilot" is a Microsoft trademark and is considered unsafe to commercialise. A naming exercise is parked with the operator. Shortlisted candidates include Backcue (clean .ai and .com in prior screening), Sotto (operator instinct, domain unavailable, needs counsel), Earwig, Cuewire, Wingside, Undertone, Sussur, and descriptive options such as live.coach and cue.coach. No final name chosen. The product name is abstracted behind a single brand token (app/lib/brand.js) so the rename is a one-file change.
- Owner: Mohammad Ali Khan, Pacific Technology Group (PTG).
- Repo: mohammadalikhanptg/silent-meeting-copilot.
- Current branch: main. An unmerged review branch worker/job-smc-cockpit-p2 exists from a just-completed commercial Phase 2 build, pending independent verification (see sections 4 and 12).
- Deployment status: live on Vercel production, READY on main. Engine live on Cloudflare. The product is in active commercial buildout, not yet sold to any external user.
- Model/chat context status: runs in a dedicated Claude project with its own memory, isolated from the older "Pacific Internal Business Automations" project (which is now PAD-only). This ROADMAP.md, the Sanity hub block, and the repo are the only durable state.
- Hosting domains: silent-meeting-copilot.vercel.app; smc.pacific.london is also referenced as a live host in build notes. Confirm canonical domain (see UNKNOWN list).

## 2. Executive summary

- What it is: a private, real-time meeting copilot. A desktop helper captures two audio streams, the operator microphone (ME) and system/loopback audio (OTHERS), and streams labelled channels to a cloud engine that transcribes in near real time, cleans the text, and drives live coaching, assistance, and follow-up while the meeting is happening.
- Problem it solves: incumbents (Otter, Fireflies, Read.ai) do in-meeting note-taking and post-call analysis. None coach the operator live during the conversation. SMC's differentiator is real-time, operator-side coaching, verticalised into recruitment (live candidate verification) and customer service.
- Who it is for: initially the operator and a small invited group for feedback; commercially, professionals and teams who want live conversational support. Verticals: recruiters (interviewer assistant), candidates (interviewee coach, later), customer-service agents (later).
- Why it matters: it is a unique-first category (live private coaching) rather than another note-taker, and it has a defensible longitudinal-personalisation roadmap.
- Current maturity: functionally deep v1 is built and deployed (engine, coaching, modes, interview vertical, outputs, remote-control helper architecture, security baseline). Commercial maturation is mid-flight (app shell and palette shipped; cockpit rebuild just built and pending verification). The meeting-bot workstream has proven Zoom SDK auth on a dedicated Linux host and has the app-side integration merged, but has not completed a live meeting join.
- Commercial ambition: a commercial, investor-ready SaaS. Base Meeting Coach plus stackable add-ons (Interviewer first). Usage metered on billable processed meeting minutes. Stripe billing, trial, entitlements, insights, and a marketing surface are planned but not built.
- Biggest current risks: product name/trademark unresolved before launch; meeting-bot live join unproven; commercial billing/entitlements not built; auth multi-user hardening backlog not fully closed before external users; orchestration worker reliability (see section 10); single-operator dependency on bespoke infrastructure.
- Current next milestone: complete and verify commercial Phase 2 (live cockpit rebuild + Live Focus card), then Phase 3 (usage metering + entitlements), Phase 4 (Settings/Billing + Stripe + Interviewer add-on gating + product rename), Phase 5 (Insights). In parallel, the meeting-bot live join test and per-participant capture, gated on Linux host access.

## 3. Original product vision

Recovered from the earliest roadmap sections, preserved before later commercial and audit activity reshaped presentation.

- Original objective: a live meeting copilot that transcribes both sides of a meeting in near real time and coaches the operator during the meeting, distinct from note-takers.
- Intended end product: a Windows (later cross-platform) helper plus a web app cockpit plus a cloud transcription/coaching engine, with per-meeting context and a persistent operator profile feeding the coach.
- Original target users: the operator first, then invited friends and family for feedback (no licensing, operator bears cost), later commercial users.
- Original core workflows: start a session, capture ME + OTHERS, see live transcript and coaching (talk-time balance, open items the other side raised, suggested next lines, self-alignment to a stated objective), review saved meetings, download minutes.
- Original milestones (all delivered): auth (magic-link + TOTP, allowlisted); engine (Whisper STT + LLM cleanup, REST + WebSocket, Durable Object sessions); pluggable STT with a Hindi/Urdu path; per-meeting language selector; shared/hardened session page; coaching layer; persistence and review pages; repeat-back repair; live assist cards; Windows helper scaffold.
- Original assumptions: English default fast path (free Whisper), Hindi/Urdu chosen per meeting, never silently downgraded; assist and lookups never fabricate; honesty throughout with explicit "not enabled yet" states.
- Original architecture decisions: Electron helper capturing mic + WASAPI loopback; Cloudflare Worker engine with a Durable Object per session; Next.js web app on Vercel; Neon Postgres. Engine input is source-agnostic and channel-labelled so any feed source (helper now, bot later) plugs into the same coach.
- Original acceptance criterion for Phase 1: a verified end-to-end real-time test from the Windows helper through the engine into the live coach.

## 4. Current product state

Built and working (deployed on main, verified where marked):
- Remote-control core: engine secret split; Durable Object safety controls (lease-based capture, one active helper, capture authorisation, session epochs, fail-closed auth); helper daemon (auto-connect standby, capture on command, four states, mic hot-swap, heartbeat, backoff reconnect, client-side silence gating, device id); token-based cockpit WebSocket with Start/Stop/Resume driving the helper; session suspend/resume lifecycle with a 3-hour hard cap; start-of-session compliance acknowledgement.
- Engine and coaching: Whisper English (free), Deepgram nova-3 on Cloudflare (Hindi/Urdu, keyless, diarization), Sarvam Saaras v3 streaming (Hindi/Urdu code-mix, behind a flag, verified strong on a real call). Coaching redesigned into full-width stacked blocks (Suggested responses with a single green key-phrase highlight, objective alignment, a Stay-on-track drift block escalating to red, Open items, Talk balance). Coaching runs on Opus with a Sonnet fallback. Marathon-session rolling summary keeps coach payload and latency flat regardless of meeting length (verified to ~90 minutes).
- Modes: session type framework (meeting / interview / customer_service). Interview vertical complete: live interviewer coaching (claims to verify, cross-questions, competency gaps) plus a post-session cited assessment (three-state traffic light plus no-signal, per-claim evidence table, competency coverage, disclaimer, downloadable Markdown evidence pack). Deterministic signal from cited claim statuses; 70b model with retries for extraction.
- Outputs: downloadable minutes (Word), full transcript, and Action Points (two sections: speaker actions named from the profile, others' actions named only where explicitly stated), all on the review page.
- Security baseline: criticals closed (legacy unauthenticated routes removed, DO fails closed), POST-endpoint auth, CORS locked to app origin, request-body size cap, security headers, transcript broadcasts scoped, coach prompt-injection isolation, strict nonce CSP, tokens moved out of URLs into WS subprotocol/headers, engine token bound to session with a replay ledger and revocation-on-logout, rate limiting on all engine generation endpoints (fail-open), retention plus hard-delete, AI-provider opt-out, IDOR regression test as a blocking CI gate, dependency and secret scanning. Independent Codex cross-reviews applied.
- Commercial redesign Phase 1: persistent AppShell (sidebar desktop, bottom nav mobile), design system (Bricolage Grotesque display font, signal gradient token), new /home, /insights, /billing routes, brand token for the pending rename. Existing pages wrapped with zero logic change. Phase 2a/2b: consolidated corporate palette (dark navy base, soft neutral light canvas, indigo/cyan accent, WCAG AA), theme toggle surfaced in the shell on every page, Library multi-select bulk delete.
- Audio + transcript persistence (oc2): built and verified end to end, dormant behind AUDIO_RETENTION_ENABLED=false, per-session consent, meeting-scoped R2 keying (fails closed without a meeting id), retrieval API with signed URLs, recording UI, and a Fireflies accuracy benchmark harness. Go-live is a deliberate flag flip plus worker redeploy.
- Installer code-signing: Azure Trusted Signing account and certificate profile active; signing wired into CI, inert until three repo secrets are added by the operator.
- Meeting-bot app side (this session, merged and live): session-prep bot block (meeting number, optional passcode, editable display name defaulting to "<first name>'s meeting notes", no branding), bot queue API with bearer-secret auth (timing-safe, seven-state transition graph), automatic helper fallback on bot failure/refusal/removal, remove-bot control and live status, plus a coach-stall reliability fix. BOT_QUEUE_SECRET set in Vercel by the operator and verified live (401 no-auth, 204 correct bearer).

Partial / in progress:
- Commercial Phase 2 (live cockpit rebuild + Live Focus card): built this session on review branch worker/job-smc-cockpit-p2, executor exit 0, NOT yet independently verified against deployed CSS and NOT merged. Standing rule: dispatched visual builds are verified against the live compiled CSS, never the executor self-report.
- Follow-up tracker enrichment: talking points restored; live references still need a Brave key (operator cost decision).
- Multi-user: admin layer and per-user isolation built; invites to external users are gated behind the auth hardening backlog and not exposed.

Mocked / placeholder:
- /insights and /billing routes are designed placeholders only.
- Meeting-bot capture is synthetic-only in the merged engine seam; real capture is behind REAL_CAPTURE_IMPLEMENTED=false and BOT_CAPTURE_ENABLED=false.

Planned but not built: usage metering and entitlements, Stripe billing, Insights analytics, onboarding/first-run, mode/template library, branded shareable outputs and post-meeting AI debrief, marketing/landing surface, customer-service vertical (knowledge base, CRM, softphone auto start/stop), Teams bot adapter, MCP session orchestration, post-meeting analysis pipeline, longitudinal personalization/learning layer.

Blocked: meeting-bot live join test and per-participant raw-audio capture (need Linux build host access plus a live meeting; currently gated by Worker 2 bridge remediation, see section 10). Live references (need Brave key). Installer first signed build (needs operator repo secrets).

Deferred: customer-service add-on and CRM/contact-centre integration (post first release); mandatory real-name speaker labels; app-enforced minimum-term; enterprise procurement/SSO/custom retention; per-device helper-key revocation UI.

Rejected / superseded: managed Recall.ai meeting-bot approach (superseded by the self-hosted Zoom SDK decision); green/red genuine-vs-fake interview verdict as a hard label (reframed to a cited evidence review with a disclaimered traffic light, operator kept the light); Glassmorphism theme candidate (discarded in favour of the Liquid Glass / Claymorphism token system, itself later consolidated into the corporate palette); the earlier auto-stop-after-90s idea (replaced by suspend/resume); standardising on paid nova-3 for English (kept free Whisper on cost grounds, cross-reviewed).

## 5. Functional scope

Each item: purpose, user type, status, dependencies, known gaps.

- Auth (magic-link + TOTP, allowlisted). Purpose: restrict access to the two operator mailboxes. User: operator/admin. Status: built, verified. Dependencies: Resend for email, Neon. Gaps: multi-user hardening backlog (section 7) must close before external users.
- Live session cockpit. Purpose: real-time transcript, coaching, assist, follow-up, controls. User: operator. Status: built and working; a commercial visual rebuild is built-but-unverified on a review branch. Dependencies: engine WS, helper, tokens. Gaps: the new cockpit needs verification against deployed CSS and an interactive authenticated pass (requires operator due to magic-link + TOTP).
- Desktop helper (Electron daemon). Purpose: capture ME + OTHERS and stream on command. User: operator. Status: built (Windows + macOS via CI); unsigned installer pending code-signing secrets; not yet tested on Windows hardware end to end by the operator. Dependencies: engine, pairing key. Gaps: pairing-key persistence across restarts is a known bug; saved-session prep must persist language and engine (known bug).
- Transcription engine. Purpose: near-real-time STT plus cleanup. User: system. Status: built (Whisper, nova-3, Sarvam). Dependencies: Cloudflare Workers AI, Sarvam API. Gaps: Sarvam wrangler flags intentionally uncommitted on the Mac pending full proving.
- Coaching layer. Purpose: live suggestions, objective alignment, drift alerts, open items, talk balance. User: operator. Status: built, on Opus with Sonnet fallback, marathon rolling summary. Dependencies: Anthropic API. Gaps: inner per-block drag-reorder not wired.
- Modes framework + interview vertical. Purpose: session profiles; recruiter-side candidate verification with cited evidence pack. User: recruiter. Status: built and verified. Dependencies: reference docs (CV), objective/context. Gaps: interviewee side not built; recruitment-industry polish/cross-review pending for launch.
- Outputs (minutes, transcript, action points). Purpose: downloadable session artefacts. User: operator. Status: built and verified. Gaps: length-handling for very long minutes noted as a future concern.
- Audio retention + benchmark. Purpose: optional durable audio for accuracy benchmarking and future analysis. User: operator/admin. Status: built, dormant behind a flag. Dependencies: R2 bucket, SMC Cloudflare token, Fireflies key for the benchmark. Gaps: benchmark needs a real retained session and a Fireflies key.
- Meeting bot (Zoom, self-hosted). Purpose: send a bot into online meetings for per-speaker-named transcription feeding the same coach. User: operator (V1 own-account). Status: app side merged and live; Zoom SDK auth proven on a Linux host; join_bot v2 built but live join untested; per-participant capture not wired. Dependencies: Zoom Meeting SDK creds, Linux host, BOT_QUEUE_SECRET (set in Vercel, not yet on the VM). Gaps: live join test, per-participant capture, operator self-identification, source mutual-exclusion, consent UI + evidence persistence, Teams adapter.
- Commercial shell + palette. Purpose: premium app frame and navigation. User: all. Status: built and live. Gaps: cockpit rebuild pending verification; insights/billing are placeholders.
- Billing / entitlements / metering. Purpose: monetisation. Status: planned, not built.
- Insights analytics. Purpose: retention driver over saved sessions. Status: planned, not built.

## 6. Architecture

- Frontend: Next.js 16 (Turbopack) on Vercel. React client components for the cockpit, review, profile, shell. Persistent AppShell wraps authenticated pages.
- Backend/engine: Cloudflare Worker "smc-engine" with a Durable Object per user (idFromName('u:'+email)) holding session state and the control relay. REST /transcribe for testing plus a WebSocket session path. Workers AI for STT and LLM passes.
- Database/storage: Neon Postgres (database "smc", role smc_owner) inside the Vercel-managed Neon project. Cloudflare R2 bucket smc-session-audio for optional audio retention (dormant). Cloudflare KV/DO storage for session state.
- CMS: none for the product. Sanity is used only for orchestration/workflow state (project management), not product content.
- Auth/session model: magic-link + TOTP, allowlisted to two mailboxes. Signed cookies. Short-lived enriched browser WS tokens (~15 min) with auto-refresh; long-lived helper pairing keys carrying a device id. A dedicated INTERNAL_SHARED_SECRET for worker-to-app Bearer, separate from token signing.
- Worker/queue model (product): the Durable Object is the control plane; no external queue in the product path. The meeting-bot uses a pull model: a poller on the Linux VM polls the app bot-queue endpoint (bearer-secret auth) and reports status back.
- AI/LLM components: Anthropic (Opus primary for coaching, Sonnet fallback) via the app; Cloudflare Workers AI (Whisper, nova-3) and Sarvam Saaras v3 for STT; a cheaper model for the rolling summary; a 70b model for interview assessment extraction.
- APIs: internal app API routes (sessions, meetings, transcript, action-points, audio retrieval, bot-queue, bulk-delete, retention). Engine endpoints (/transcribe, /coach, /minutes, /action-points, /interview-evidence, /bot/ws gated). Brave Search for assist/verification.
- Webhooks: none confirmed in the product path (UNKNOWN if any exist for CI/deploy).
- Integrations: Resend (email), Brave (search), Sarvam (STT), Zoom Meeting SDK (bot), Fireflies (benchmark only), Anthropic, Cloudflare Workers AI.
- Hosting/deployment: Vercel (app, auto-deploy on main push), Cloudflare (engine, manual wrangler deploy from the Mac using the SMC-exclusive token). Neon (managed Postgres). R2 (audio).
- Environment separation: production is the live path. UNKNOWN whether a formal staging/preview environment is maintained beyond Vercel preview deployments. Feature flags (AUDIO_RETENTION_ENABLED, BOT_CAPTURE_ENABLED, REAL_CAPTURE_IMPLEMENTED, SARVAM_ENABLED) gate dormant capabilities.
- Build/deploy process: app builds and deploys via Vercel on push to main; the build runs an idempotent DB migration. The engine deploys manually via wrangler from the Mac with a specific token convention (CLOUDFLARE_DEPLOY_TOKEN exported as CLOUDFLARE_API_TOKEN; the runtime CLOUDFLARE_API_TOKEN fails deploys). Helper builds via GitHub Actions (release tag helper-latest), signing steps inert until secrets exist.

Text architecture map:

Operator desktop (Electron helper daemon: mic=ME, loopback=OTHERS, silence-gated, heartbeat)
  -> WebSocket (pairing key, device id) ->
Cloudflare Worker smc-engine (Durable Object per user: control relay, capture authorisation, session epochs, STT via Workers AI Whisper/nova-3 or Sarvam relay, LLM cleanup, coaching, rolling summary; optional audio frames -> R2)
  <-> Next.js app on Vercel (cockpit WS token, session/meeting/transcript/coaching APIs, auth, outputs, retention) <-> Neon Postgres
Meeting bot path (planned/partial): SMC-LINUX-BOT (C++ Zoom Meeting SDK headless join_bot + poller) -> polls app bot-queue (BOT_QUEUE_SECRET) -> joins Zoom -> per-participant audio -> engine /bot/ws (gated) -> same coach.

## 7. Codebase and repository structure

Consolidated from build notes; exact tree not re-walked this session (mark UNKNOWN where not confirmed).

- app/ (Next.js): session/page.js (cockpit), meetings/ and meetings/[id]/ (library + review, RecordingPanel, SessionsManager), profile/, home/, insights/, billing/, components/ (AppShell, ComplianceModal, ActionPointsPanel), lib/ (brand.js, r2.js, retention.js), api/ routes (meetings, meetings/[id]/audio, meetings/bulk-delete, bot-queue and bot-queue/[id]/status, action-points, transcript, retention). middleware.js (route gating, CSRF/CSP, public-list including bot-queue as M2M).
- worker/ (Cloudflare engine): src/index.js, src/session-do.js (Durable Object, capture, coaching, rolling summary, audio retention), src/sarvam-relay.js, src/ratelimit.js, src/bot-ingest.js, src/frame-envelope.js, wrangler.toml (bindings, flags).
- bot/ (self-hosted meeting bot runtime): src/ (MeetingCaptureSource, FakeAdapter, consent.js, credential.js, frame-envelope.js, index.js, guard.js), adapter/ (join_bot.cpp, CMakeLists.txt), run-bot.sh, poller/ (smc-bot-poller.sh, systemd unit) [poller/bot v2 built on the review branch this session], README.md, SPEC-session-integration-v1.md.
- helper/ (Electron desktop): main.js, pcm16k-worklet.js, installer config; built via CI (helper-latest).
- scripts/: migrate.mjs, purge-retention.mjs, benchmark-audio-accuracy.mjs, sarvam-batch.py, transcript-eval.py.
- docs/: FRAMEWORK.md, security-framework.md, retention-policy.md, key-rotation.md, meeting-bot-design.md, interview-mode-design.md and its Codex review, zoom-bot-gate1a-findings.md, status-20260705-gate1b.md, worker2-cutover-runbook.md, SPEC-session-integration-v1.md, SPEC-commercial-phase2-cockpit.md, and this dossier.
- ROADMAP.md at repo root: the master roadmap and single source of truth.
- CI/CD: .github/workflows/smc-helper.yml (helper build + Trusted Signing, signing inert until secrets). CI security gates: dependency + secret scanning, IDOR regression test as a blocking gate.
- Package manager: npm. Test commands include test:bot, test:security (retention + IDOR + rate-limit), transcript-eval self-test.
- Known fragile areas: engine manual deploy token convention (easy to source the wrong token); Sarvam wrangler flags uncommitted on the Mac; helper pairing-key persistence bug; saved-session language/engine persistence bug; the cockpit page keeps a redundant in-page header inside the shell (Phase 2 cleanup target).

## 8. Data model and storage

- Main entities (Neon Postgres): auth_users, magic_links, sessions, meetings (with mode_type, user_email, default meeting language), transcript_segments, user_profiles (display_name, default_bot_name, context, meeting language), flagged_items, used_engine_tokens (replay ledger), bot_requests (bot queue state). Some names inferred from build notes; confirm exact schema (UNKNOWN in part).
- Relationships: meetings own transcript_segments and flagged_items; meetings keyed to user_email for ownership checks; bot_requests bound to a session.
- Tenant model: single-tenant per user via allowlist today; multi-user admin layer and per-user data isolation built but invites gated. Not a true multi-tenant SaaS yet.
- User/account model: email-based identity, TOTP secret stored (encryption-at-rest for the TOTP secret is on the hardening backlog).
- Audit/logging model: security-framework documents; used_engine_tokens ledger; auth-event alerting is on the backlog (not built).
- Data retention: app/lib/retention.js with windows (sessions 90d, bot 7d, magic-links 7d, auth 30d), FK-safe hard delete, ownership-scoped, R2 audio deletion on hard delete. Purge script exists.
- Backup assumptions: Neon managed backups assumed; R2 durability assumed. No explicit product backup/restore runbook confirmed (UNKNOWN).
- Migration approach: idempotent migrate.mjs run at build time (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS), fails safe on read-only local DBs.
- Preview/test/production separation: production is primary; test/junk sessions accumulate and are cleaned via bulk delete; a future "count towards learning" flag is designed to exclude test sessions from distillation. Formal environment separation UNKNOWN.
- Known data risks: passcode stored in the bot_requests row in plaintext (short-lived meeting passcode, not a durable credential, never logged or client-exposed, but noted); TOTP secret not yet encrypted at rest; audio retention is sensitive and gated but must honour consent and purge when enabled.

## 9. Security, privacy and compliance posture

Honest posture. The security baseline is unusually strong for this stage, but gaps remain and external-user launch is explicitly gated.

Built:
- Authentication: magic-link + TOTP, allowlisted, SafeLinks-proof confirm step, cookies on the response.
- Authorisation: ownership checks on meeting-scoped routes; IDOR regression test as a blocking CI gate; bot-queue bearer-secret with timing-safe comparison.
- Session management: DO fails closed; capture authorised only when live, leased, from the active helper, and epoch-current; short-lived enriched browser tokens; engine token bound to session with a replay ledger and revocation-on-logout.
- Secrets management: per-machine self-sufficiency model (credential-locations); SMC-exclusive Cloudflare token on the Mac only; no chat-paste of secrets; INTERNAL_SHARED_SECRET split from token signing.
- Environment variables: BOT_QUEUE_SECRET (Vercel + VM), engine secrets key-gated.
- Public/private exposure: legacy unauthenticated routes removed; transcript broadcasts scoped to owning browsers; CORS locked to app origin.
- Input validation: uploads restricted to .md/.txt, size-capped; all user context treated as untrusted data, escaped, delimited, with explicit "ignore embedded instructions" in the LLM prompt (prompt-injection isolation).
- Rate limiting: all six engine generation endpoints (per-IP, per-user, heavy bucket), 429 + Retry-After, internal callers exempt, fail-open.
- Audit logging: security-framework sections; replay ledger. Auth-event alerting not built.
- CSP: strict nonce-based CSP live.
- Data protection: retention + hard-delete + R2 deletion; AI-provider opt-out (mip_opt_out on nova-3); audio retention off by default and consent-gated.

Known gaps / launch gates:
- Auth multi-user hardening backlog: session revocation effective at the edge gate (today a signed cookie passes until expiry after logout); rate-limit/lockout on verify and TOTP endpoints; allowlist re-check at every auth phase; TOTP secret encryption at rest; replace or heavily test the self-implemented TOTP against a vetted library; auth-event alerting. These must close before inviting any external user.
- Per-device helper-key revocation UI (device id exists, UI deferred).
- Interviewee-side ethics boundary is locked in policy (communication coach for the candidate's own performance only, never an answer engine) but the interviewee vertical is not built; refusal/warning behaviour must ship with it.
- Compliance ambitions: UK GDPR considerations noted for interview assessment (Article 22 controls, protected/proxy characteristic exclusions, provenance metadata). Formal DPA/processor posture for external customers UNKNOWN.
- Operator action outstanding: rotate the git-embedded GitHub credential in the Mac remote (hygiene under the per-machine model).

Do not assume a clean posture: the product has a strong baseline but is not cleared for external multi-user launch until the hardening backlog closes and is cross-reviewed.

## 10. Reliability and operations

Product path:
- Worker/job system: the Durable Object is the runtime; lease-based auto-suspend via DO alarms; 3-hour hard cap. Helper daemon heartbeat every ~25s, stale after ~2 missed intervals, exponential backoff with jitter, session epochs prevent stale-socket injection.
- Retry/idempotency: coach poll loop is fixed-interval with per-call try/catch and never dies on one error; DB migration idempotent; bot job briefs carry idempotency classification and resume-on-branch semantics.
- Error handling: engine generators return generic errors to clients with server-side logging only (no raw error leakage).
- Monitoring/alerting/logging: Vercel and Cloudflare platform telemetry; no bespoke product monitoring/alerting confirmed (UNKNOWN). Auth-event alerting on the backlog.
- Backups/rollback: Vercel keeps deploy history (rollback by redeploy); engine rollback by wrangler redeploy of a prior version; DB rollback UNKNOWN beyond Neon defaults.
- Manual operational steps: engine deploy is a manual wrangler step from the Mac with a specific token convention; Sarvam flags managed manually on the Mac; helper release via CI tag.

Orchestration/build tooling (not the product, but the delivery machinery, and currently a reliability concern):
- The project is built largely by dispatching coding jobs to executors. Two executors: a Windows "worker" (DEV-ORCH-01/02) via a Sanity message bus, and a Mac executor via an SSH bridge. The Mac executor is the reliable path and completed the recent bot and cockpit builds cleanly.
- The Windows worker runner has three demonstrated defects this week: it passes the whole brief on the Windows command line and overruns the ~32k argv limit (job dies at startup with no output); a 5-minute run-start gate kills a healthy job that is still planning; and the brief linter throws destructive-verb false positives that write blocking records. These are documented for the Skill Maintenance team. Mitigation adopted: keep long specs in the repo and send short pointer briefs; prefer the Mac executor for heavy jobs.
- Worker 2 (intended permanent orchestration home) is an older bridge version, currently wedged and being brought up to Worker 1 parity by the Skill Maintenance team. The Linux bot host is reachable from Worker 2 over LAN SSH once keyed (verified topology; cutover runbook committed), but VM-side work is parked until the Worker 2 bridge is fixed.
- Linux bot host (SMC-LINUX-BOT, 10.101.101.56): dedicated Ubuntu build/run host for the Zoom SDK. Network debt: its IP is held by a temporary ARP pin against a contending randomized-MAC device; a FortiGate DHCP reservation is outstanding. A stale powered-off Hyper-V VM should be removed.

## 11. Testing and quality

- Existing suites: test:bot (synthetic 31 + envelope 31 = 62), test:security (retention + IDOR + rate-limit, reported 57+ green), transcript-eval self-test (WER/CER scorer), pairing and auth-hardening suites referenced in build notes.
- Test commands: npm run test:bot, npm run test:security, node --check on changed files, wrangler deploy --dry-run for engine bundle validation, next build for the app.
- Coverage: strong on security regression (IDOR as a blocking gate), bot wire-format, rate limiting, retention.
- Not covered: end-to-end interactive authenticated cockpit flows (blocked by magic-link + TOTP requiring the operator); real-audio end-to-end from the helper on Windows hardware; live meeting-bot join; a 30-minute coach soak against a synthetic long session (skipped in the last build for lack of infra); visual regression (handled manually by verifying deployed compiled CSS).
- CI status: dependency + secret scanning and the IDOR test are CI gates. Engine auto-deploy CI (PR #4) left open pending a deploy-capable repo token.
- Known quality gates: the standing rule that dispatched visual/UI builds are verified against the deployed compiled CSS on the live URL, never the executor self-report (the theme executor missed the rendered result twice, caught by CSS inspection).
- Known build/dependency risks: manual engine deploy token convention; unsigned installer; the redundant cockpit header cleanup; the two helper persistence bugs.

## 12. Current roadmap

Track A: Original Product Roadmap (delivered/superseded)
- Phase 1 local-helper based copilot: DONE (engine, coaching, persistence, review, assist, helper scaffold, remote-control redesign, suspend/resume, compliance, outputs, modes framework, interview vertical). Definition of done was a verified end-to-end real-audio test from the helper; still requires the operator's Windows hardware pass to fully close.
- Phase 1.5 modes framework + interview mode: DONE.
- Phase 2 (original) customer-service mode + meeting-bot + multilingual: multilingual DONE; meeting-bot in progress (now self-hosted); customer-service deferred.
- Long-term: minutes export (DONE), multi-user invites (gated), per-meeting document upload (partial via prep docs), other-OS helper (macOS DONE).

Track B: Audit / Remediation / Hardening Roadmap
- Security baseline criticals: DONE. H2/H4/CSP/F1/F4/F5/F7/F8: DONE and deployed (the gate before real third-party/candidate data is met).
- Remaining hardening: F2 per-device helper-key revocation; auth multi-user hardening backlog (edge revocation, lockout, allowlist re-check at every phase, TOTP at rest, vetted TOTP library, auth-event alerting) before external users.
- Operator hygiene: rotate the git-embedded GitHub credential.
- Orchestration tooling defects (Windows worker runner): documented for Skill Maintenance; not product code.

Track C: Merged Execution Roadmap (what should happen next, product direction preserved)
1. Verify and merge commercial Phase 2 (live cockpit rebuild + Live Focus card) against deployed CSS; operator interactive pass.
2. Meeting-bot to first live join: put BOT_QUEUE_SECRET on the Linux VM, compile join_bot v2, install the poller, run a live own-account Zoom join test; then per-participant capture, operator self-identification, and source mutual-exclusion. Gated on Worker 2 bridge remediation and a live meeting.
3. Commercial Phase 3: usage metering on billable processed meeting minutes + entitlements.
4. Commercial Phase 4: Settings/Billing + Stripe + Interviewer add-on gating + product rename via the brand token (needs the naming decision and Stripe keys).
5. Commercial Phase 5: Insights analytics over saved sessions.
6. Auth multi-user hardening backlog, cross-reviewed, before exposing invites.
7. Post-launch: interviewee coach vertical (ethics-bounded), customer-service vertical (knowledge base, CRM, softphone), Teams bot adapter, MCP session orchestration, post-meeting analysis pipeline, longitudinal personalization/learning layer.

Launch gates: product rename (trademark); auth multi-user hardening for external users; meeting-bot live-join proof if the bot is in the first commercial scope (note: V1 commercial scope is locked to base Meeting Coach + Interviewer add-on, both largely built, which does not hard-depend on the bot); billing/entitlements for monetisation; interactive operator verification of the cockpit and a real-audio helper test.

## 13. Open task register

Format: task | source | status | priority | dependencies | risk | acceptance | next action.

- Verify + merge commercial Phase 2 cockpit | later decision | in progress (built, unverified) | high | deployed CSS check, operator pass | medium (hero screen regression) | Live Focus renders, all controls preserved, no behavioural change | verify against live CSS, then merge/deploy.
- Meeting-bot BOT_QUEUE_SECRET on the Linux VM | audit/build | pending | high | Worker 2 bridge fix or Linux channel | low | env file present, poller authenticates | write env once a channel is available.
- Compile join_bot v2 + install poller on the VM | build | pending | high | Linux host access | medium | v2 binary built, poller running, 204 handled as empty | run after secret placement.
- Meeting-bot live join test | original/build | blocked | high | operator meeting, VM channel | medium | bot joins, waiting-room handled, muted, named | schedule a one-off meeting.
- Per-participant capture + adapter integration | original/build | pending | high | live join proven | high (design-heavy) | per-speaker labelled segments to the coach | dispatch after live join.
- Commercial Phase 3 metering + entitlements | commercial | pending | high | Phase 2 merged | medium | billable minutes metered, entitlement flags gate features | scope and dispatch.
- Commercial Phase 4 Stripe billing + add-on gating + rename | commercial | pending | high | naming decision, Stripe keys, entitlements | medium | plans, trial, add-on unlock, renamed | operator to choose name + provide Stripe keys.
- Commercial Phase 5 Insights | commercial | pending | medium | saved-session analytics | medium | objective-hit rate, talk-share trend, drift, follow-up closure | scope after Phase 4.
- Auth multi-user hardening backlog | audit | in progress/pending | high (gate) | none | high (external users) | edge revocation, lockout, allowlist re-check, TOTP at rest, vetted TOTP, alerting | prioritise before invites.
- F2 per-device helper-key revocation | audit | pending | medium | none | low | revoke a device's key from UI | schedule.
- Helper pairing-key persistence bug | user request | pending | high | helper rebuild | medium | key survives restart, auto-connect | fix in next helper round.
- Saved-session language/engine persistence bug | user request | pending | high | none | medium | reopened session keeps chosen language/engine | fix in prep payload.
- Live references (Brave key) | operator | pending | low | operator cost decision | low | references populate | operator provisions key.
- Installer first signed build | operator | pending | medium | three repo secrets | low | signed .exe, no SmartScreen | operator adds secrets, re-run CI.
- FortiGate DHCP reservation for the Linux VM | audit | pending | medium | firewall access | low | VM IP stable without ARP pin | reserve/static outside pool; remove stale VM.
- Rotate git-embedded GitHub credential | audit | pending | medium | none | medium | remote uses SSH/credential helper | operator/hygiene.
- Product naming decision | commercial | parked with operator | high (gate) | trademark clearance | high | ownable name + domains cleared | operator picks; formal clearance.
- Windows worker runner defects | orchestration | handed to Skill Maintenance | medium | not product | medium | argv-to-stdin, gate window, lint fix | Skill Maintenance owns.

## 14. Commercial context

- Target market: professionals and teams in live conversations; first verticals recruitment (interviewer) and later customer service.
- Buyer persona: for interviewer, recruiters/hiring managers; for base, individual professionals; enterprise (customer service) later with a different buyer (ops/IT/security).
- End users: the subscriber operates on their own side of the conversation; whichever party subscribes, the system acts on their side.
- Problem statement: real-time private coaching during meetings and interviews, plus candidate verification, that note-takers and post-call analysers do not provide.
- Competitive positioning: unique-first live private coach; distinct from Otter/Fireflies (note-takers) and Gong (post-call analysis); interview vertical adds live candidate verification with a cited evidence pack.
- Pricing assumptions: base Meeting system priced by tiers on billable processed meeting minutes; Enterprise bespoke. Add-ons (Interviewer, later Interviewee, Customer-service) stackable, each revealing its own settings. Possible 3-month minimum term on interviewer/interviewee with a 7 to 14-day trial, enforced as billing policy not runtime state. Exact prices UNKNOWN.
- Packaging: base must be independently sellable and coherent with zero add-ons; V1 commercial scope locked to base Meeting Coach + Interviewer add-on.
- Sales/demo, onboarding, support model: UNKNOWN/undefined. Onboarding/first-run is a planned commercial milestone (c4) but not built.
- Trust/compliance requirements: compliance acknowledgement per session; UK GDPR considerations for interview data; a trust/privacy surface is a planned billing-phase item.
- Monetisation strategy: subscription (base tiers + usage) plus stackable add-ons via Stripe; not yet built.
- Current commercial gaps: no billing/entitlements/metering, no insights, no onboarding, no marketing/landing surface, no pricing page, unresolved product name, no defined support model, no defined go-to-market sequence.

## 15. Website and go-to-market context

- Public website / landing page: none built. A marketing/landing surface is planned (commercial c8) but not started.
- Product messaging: internal positioning is defined (private real-time meeting strategist; recruitment and customer-service verticals). No public messaging or copy exists.
- Demo flow, lead capture, case studies, trust signals, pricing page, docs/help centre, onboarding, launch sequence, marketing assets: all UNKNOWN / not built.
- Fable 5 action: plan the public website and go-to-market from scratch, including positioning, demo flow, pricing presentation (aligned to the billable-minutes model and add-ons), trust/privacy surface, onboarding, and a launch sequence, sequenced against the product rename.

## 16. Risks and unresolved decisions

- Technical: meeting-bot live join unproven; per-participant capture design-heavy; helper untested on Windows hardware end to end; two helper persistence bugs; redundant cockpit header cleanup; engine manual-deploy token fragility.
- Security: auth multi-user hardening backlog open (edge revocation, lockout, TOTP at rest, vetted TOTP, alerting); per-device key revocation UI deferred; git-embedded credential to rotate.
- Operational: Windows worker runner defects; Worker 2 not yet at parity; Linux VM network debt (ARP pin, DHCP reservation); manual engine deploy; no bespoke product monitoring/alerting confirmed.
- Product: cockpit rebuild unverified; insights/billing placeholders; interviewee vertical ethics boundary must ship with refusal behaviour; customer-service vertical large and deferred.
- Commercial: no billing/metering/entitlements; pricing undefined in numbers; onboarding/support/go-to-market undefined; product name unresolved (trademark gate).
- Legal/privacy/compliance: recording/consent obligations across jurisdictions rest with the user but need a clear trust surface; UK GDPR controls for interview assessment; processor/DPA posture for external customers UNKNOWN.
- Roadmap: multiple historical roadmap versions reconciled here; risk of drift if future chats do not treat ROADMAP.md + the Sanity hub as source of truth.
- Dependency: single-operator dependency on bespoke self-hosted infrastructure (workers, Mac executor, Linux VM); several external APIs (Anthropic, Cloudflare, Sarvam, Brave, Zoom, Resend, Stripe-to-be).
- Open decisions for Mohammad: final product name; whether the meeting-bot is in first commercial scope or a fast-follow; pricing numbers and trial/minimum-term; whether to invest in a staging environment; provisioning of Brave and Stripe keys and installer signing secrets.

## 17. Important historical decisions

Decision | approx sequence | reason | current status | still valid | Fable should challenge?
- Local helper capturing ME + OTHERS as the first feed source | early | fastest path to live coaching without a bot | valid, shipped | yes | no.
- Durable Object per user as the control plane, no session codes | 24 Jun, Codex-reviewed APPROVE-WITH-CHANGES | right v1 model without WebRTC/SFU complexity | valid, shipped | yes | only at scale.
- Keep free Whisper English rather than standardise on paid nova-3 | 24 Jun, cross-reviewed | cost, add instrumentation and revisit on data | valid | yes | yes, revisit with cost data.
- Self-hosted Zoom Meeting SDK bot rather than managed Recall.ai | 29 Jun | cheaper per hour at scale, modular | valid, in build | yes | yes, challenge build cost vs time-to-market.
- Interview verdict reframed from genuine-vs-fake label to cited evidence review; operator kept a disclaimered traffic light | 24 Jun, Codex-reviewed | fairness, UK GDPR, defensibility | valid, shipped | yes | yes, recruitment-industry and legal review.
- Commercial model: single merged cockpit, base + stackable add-ons, usage = billable processed meeting minutes, V1 = base + Interviewer | 29-30 Jun, Codex-reviewed | coherent monetisation, proves cockpit/metering/entitlement without heavy integration | valid, guiding | yes | yes, validate pricing and packaging.
- Corporate palette (deep navy dark, soft neutral light, indigo/cyan accent), never absolute black/white | 4 Jul | enterprise-credible look | valid, shipped | yes | aesthetic call, low risk.
- Rename required before commercial launch (Copilot trademark) | 29 Jun | trademark risk | open, parked | yes | yes, pick and clear a name.
- Audio retention built dormant behind a flag with consent + meeting-scoped keying | 1-2 Jul | privacy-first, benchmark enablement | valid | yes | confirm before enabling.

## 18. Known constraints

- Time: operator wants maximum autonomous progress; per-phase deploy then operator test.
- Budget: cost-sensitive on transcription (free Whisper kept; silence gating; rolling summary); operator bears Cloudflare cost for invited users; some features gated on operator cost decisions (Brave key).
- Tooling: builds delegated to executors; Mac executor is the reliable path; Windows worker unreliable and being fixed.
- Platform: Vercel (app), Cloudflare Workers/DO/R2 (engine/audio), Neon (DB), Zoom SDK (bot), Electron (helper). Windows command-line length limit affected the worker runner.
- Access: engine deploy only from the Mac with the SMC token; Linux VM reachable over LAN SSH; magic-link + TOTP means interactive product verification needs the operator.
- Model/context: this is a long-running orchestration chat; state must persist in ROADMAP.md and Sanity. SMC must not touch PAD assets.
- Human approval: commercial UI direction approved; per-phase live deploy then operator test; naming and Stripe/keys need the operator; external-user launch gated on hardening.
- Do not assume: a clean security posture for external users; that the meeting-bot works live; that a staging environment exists; that pricing is defined; that a website exists.

## 19. Brief for Fable 5 Independent Review

Fable 5 should independently review this project across product strategy, architecture, security, reliability, operations, testing, commercial viability, monetisation, website positioning, go-to-market readiness, launch sequencing, and long-term roadmap. It should identify gaps, challenge assumptions, propose improvements, create an implementation backlog, and produce Markdown review files that can be taken back into this original project chat.

Specific questions worth pressure-testing:
- Is the self-hosted Zoom bot the right call versus a managed provider for first commercial release, given the live join is still unproven and per-participant capture is design-heavy? Should the bot be in V1 or a fast-follow?
- Is the base Meeting Coach genuinely sellable standalone, and is billable processed meeting minutes the right single metric?
- What is the minimum auth multi-user hardening set required before any external invite, and is the self-implemented TOTP acceptable or must it be replaced?
- Is the commercial phase order (cockpit, metering, billing, insights) right, or should metering/billing precede the cockpit polish?
- What go-to-market and website are needed for a credible launch, and how should the rename sequence against public assets?
- Where is the single-operator/bespoke-infrastructure dependency a launch risk, and what should be hardened or outsourced?

## 20. Dossier quality check

Confidently recovered: product vision and history; architecture; build status and what is deployed; security baseline and gaps; the full multi-track roadmap and its reconciliation; commercial model decisions; the meeting-bot state; this session's changes (bot app-side merged and verified live, cockpit rebuilt-but-unverified, Worker 2 findings).

Remaining UNKNOWN:
- Exact Postgres schema (entity/column list is partly inferred).
- Whether a formal staging/preview environment exists beyond Vercel previews.
- Canonical production domain (vercel.app vs smc.pacific.london).
- Pricing numbers, support model, onboarding specifics, go-to-market sequence.
- Any webhooks in the product path.
- Product backup/restore and DB rollback specifics beyond managed defaults.
- Processor/DPA posture for external customers.

Context that may be missing: the exact contents of the just-built cockpit review branch (not yet inspected in detail); the live interactive behaviour of the app (magic-link + TOTP requires the operator); the real-audio end-to-end helper result on Windows hardware.

Readiness: the dossier is complete enough for an independent Fable 5 review of product, architecture, security, reliability, testing, commercial, and go-to-market. The UNKNOWNs above are explicitly flagged for Fable 5 to probe and do not block a strategic and technical review.

Files that should be attached to the Fable review chat alongside this dossier (all in the repo):
- ROADMAP.md (the master roadmap, full history).
- docs/security-framework.md and docs/retention-policy.md and docs/key-rotation.md (security posture).
- docs/meeting-bot-design.md and docs/SPEC-session-integration-v1.md and docs/status-20260705-gate1b.md (bot workstream).
- docs/interview-mode-design.md and its Codex review (interview vertical).
- docs/SPEC-commercial-phase2-cockpit.md (current commercial phase).
- docs/worker2-cutover-runbook.md (orchestration/infra context).

No application code was changed in producing this dossier.
