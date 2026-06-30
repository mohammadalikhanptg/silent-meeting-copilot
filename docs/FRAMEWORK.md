# Silent Meeting Copilot (SMC) — Framework & Architecture

Authoritative engineering reference. Last refreshed 25 Jun 2026. Companion documents: ROADMAP.md (single source of truth for status and backlog), docs/security-framework.md (security posture + remediation), docs/interview-mode-design.md (interview vertical). Owner: Mohammad Ali Khan (Pacific Technology Group). Repo commit author is always ali@khan.vg.

## 1. What it is
A live meeting copilot for a single operator, expanding to friends and family, not enterprise. A Windows desktop helper captures two audio streams, the operator's microphone (ME) and the system loopback (OTHERS), and streams them to a cloud engine that transcribes in near real time, cleans the text, and drives live coaching while the meeting is happening. A browser page is the live cockpit. The differentiator is real-time, operator-side coaching during the meeting, which note-takers (Fireflies, Otter, Read.ai) do not do.

## 2. Architecture
- Windows Electron helper: mic = ME, WASAPI loopback = OTHERS. Auto-connects to the engine on launch and sits in standby; captures only on engine command; four states (disconnected, standby, capturing, demoted); mic hot-swap, heartbeat, exponential-backoff reconnect, client-side silence gating.
- Cloudflare Worker engine "smc-engine": a WebSocket session backed by a Durable Object (SessionDO), plus stateless POST endpoints for generation. Two stages per audio segment: speech-to-text then an LLM cleanup/coaching pass, both on Workers AI. Input is source- and channel-labelled, so any feed source plugs into the same coach.
- Next.js app on Vercel: magic-link + TOTP auth, the live cockpit, the meetings review pages, profile and admin.
- Neon Postgres: all persistent state.

## 3. Data flow
Helper captures ME + OTHERS as discrete complete audio segments and streams them over the authenticated WebSocket to SessionDO. SessionDO transcribes + cleans each segment and broadcasts transcript lines to the browser cockpit. The cockpit polls the engine every 25s for coaching. Flagging a transcript line creates a flagged_item which is enriched on a separate slower background stream (talking point + references) so real-time is never disturbed. On stop, the review page generates minutes, action points, and (interview sessions) a cited assessment.

## 4. Engine (worker/)
- worker/src/index.js: routing, CORS (locked to the app origin), POST-endpoint auth, WebSocket upgrade for /app/ws.
- worker/src/session-do.js: SessionDO (browser/helper socket tracking, helper election, capture control, broadcast) plus the transcription and generator functions.
- Transcription: mode 'english' uses Cloudflare Whisper (free, keyless, no diarization); 'hindi-urdu' and 'auto' use Cloudflare Deepgram nova-3 (keyless on Workers AI, with diarization). Speaker labels are only attached when diarization finds more than one speaker, otherwise omitted as noise.
- Generators: generateCoaching (talk balance, open items, suggested responses, objective alignment; mode-aware; untrusted-data isolation in the prompt), generateMinutes, generateActionPoints, generateInterviewAssessment (cited per-claim evidence with a deterministic three-state signal computed in code), enrichFlaggedItem (talking point + Brave search references).
- Auth model: short-lived browser engine token (smcs1_, ~15 min, typ/aud bound) minted by the app; versioned helper pairing key (smc1_); an internal shared secret for app-to-engine service calls. The engine validates browser tokens by calling back to the app's internal validate endpoints; the signing secret never leaves the app. POST endpoints require either the internal service secret or a valid engine token, with a request-body size cap. The DO fails closed: it rejects any WebSocket without a Worker-injected authenticated identity.
- Deploy: cd worker && source the env, set CLOUDFLARE_API_TOKEN from the deploy token, run wrangler deploy. Engine URL https://smc-engine.ali-6b8.workers.dev.

## 5. Web app (Next.js on Vercel)
- Auth: passwordless magic-link plus TOTP, allowlist restricted to the operator mailboxes, HMAC-signed httpOnly session cookie with server-side revocation, CSRF origin/referer enforcement in middleware, security headers (HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).
- Live cockpit (app/session/page.js): preparation panel (collapsible, hidden during a live session), ME and OTHERS transcript panels (internal scroll, drag-resizable height), coaching panel, live assist, follow-up tracker. Pre-start readiness monitor opens a read-only browser connection during preparation so helper presence and Ready state show before Start.
- Review (app/meetings/[id]/): minutes, action points, and interview assessment panels, each backed by an API route that calls the engine.
- Profile (app/profile/): identity, default meeting language, reference docs, and an AI "about me" generator.
- Admin (app/admin/): invites and operational views.
- API routes of note: /api/session/start (mint engine token), /api/flagged-items (+ [itemId] PATCH/DELETE, /process), /api/meetings (+ segments, minutes, action-points, interview-assessment, minutes-docx), /api/profile, /api/internal/validate-* (engine callbacks).

## 6. Data model (Neon, database "smc")
auth_users, magic_links, auth_attempts, sessions, meetings (incl mode_type meeting|interview|customer_service), transcript_segments, user_profiles (incl default_language_mode), session_reference_docs, profile_docs, invites, flagged_items. Migrations are a single idempotent scripts/migrate.mjs run at build time.

## 7. Modes
meeting (default, fully working), interview (recruitment; mode-aware coaching plus a post-session cited assessment with a deterministic green/orange/red/none signal and fairness exclusions), customer_service (scaffolded for a later vertical). Session type is chosen in preparation.

## 8. Design system (app/globals.css)
Token-based, two themes via a data-theme attribute, with a persisted theme toggle.
- Dark = Liquid Glass: deep indigo/navy surfaces, a drifting animated backdrop, edge-lit translucent glass panels with a slow travelling sheen, layered shadows.
- Light = Claymorphism: warm soft background with a gentle drift, puffy clay panels with soft inset inputs.
- Living backgrounds show through full-page roots (made transparent). Ambient motion is intentional and always plays. Mobile drops backdrop blur for performance.
- Every surface is responsive from the start.

## 9. Security posture
Done: criticals closed (legacy unauthenticated WebSocket and info routes removed, DO fails closed); POST-endpoint auth; CORS locked to the app origin; request-body size cap; security headers; transcript broadcasts scoped to browsers only; coach prompt hardened against injection from transcript and reference text.
Outstanding (see docs/security-framework.md): H2 move tokens out of the URL query into a header/subprotocol; H3 drop the signing-secret fallback after confirming the dedicated secret in both environments and add a key id for rotation; H4 bind the engine token to the session id with revocation and replay protection; plus strict CSP, data retention and hard-delete, an automated IDOR test, AI-provider data-processing confirmation, CI dependency and secret scanning, and rotating the git-embedded credential.
Gate: no real third-party or candidate data until H2 to H4 and the retention and prompt-injection items are implemented and tested.

## 10. Infrastructure (recovery)
- Repo: mohammadalikhanptg/silent-meeting-copilot (branch main). Commit author must be ali@khan.vg.
- Vercel: project prj_eF9j961vaT9wRp8nhrYhElUG4XKz, team team_qhm5OOjlJcEv9WD6Ugv9yNpT, URL https://silent-meeting-copilot.vercel.app. Build runs migrate then next build. A failed build does not replace the live production deploy.
- Engine: https://smc-engine.ali-6b8.workers.dev (worker/), Cloudflare account 6b8a541251738b917ee0289afb8eadce.
- Neon: database "smc" inside the Vercel-managed Neon project.
- Sanity: project 74704nsd, dataset production; SMC wfProject 7927b0bf-e2f6-4d14-aec5-6b99764f24d9; projectRoadmap 427dc4bc-eb07-4ba0-9c84-78c8d1293bef; all build events under correlationId smc-v1-build.
- Windows helper installer: GitHub release tag helper-latest, rebuilt by the smc-helper CI workflow on any push touching helper/. Current asset SMC.Helper.Setup.0.2.0.exe.
- Vercel env: DATABASE_URL, AUTH_SECRET, AUTH_ALLOWLIST, NEXT_PUBLIC_BASE_URL, RESEND_API_KEY, RESEND_FROM, NEXT_PUBLIC_ENGINE_URL, INTERNAL_SHARED_SECRET, HELPER_SIGNING_SECRET, TOTP_ENC_KEY.
- Engine secrets: AUTH_SECRET-equivalents via callback, INTERNAL_SHARED_SECRET / HELPER_SIGNING_SECRET, APP_BASE_URL, optional DEEPGRAM and SEARCH_API_KEY.

## 11. Build status (summary)
Phase 1 is functionally complete end to end: capture, transcription (English and Hindi/Urdu), live coaching, minutes, action points, interview assessment, persistence and review, two polished themes, and the security baseline. The current focus is UX fine-tuning from live-test feedback and the remaining security hardening. Detailed and graded status, plus the full backlog, live in ROADMAP.md.

## 12. Commercial product architecture (planned, 30 Jun 2026)

Status: agreed direction, not yet built. A Codex cross-review of this architecture is in flight (correlationId cr-smc-commercial-design-20260630-0037). Build proceeds on the live system (nothing is live commercially yet), carrying every shipped feature forward.

Rename: "Copilot" is a Microsoft trademark, so "Silent Meeting Copilot / SMC" is not safe to commercialise. The product name is being chosen via a dedicated naming exercise plus Codex review (correlationId cr-smc-naming-20260630-0037); operator standout so far is Soto/Sotto, pending clash research. A full rename across app, UI, docs and repo references follows the decision.

Cockpit: one consolidated cockpit, single merged conversation stream (not two boxes). The meeting-bot conversation flows in the same merged style; when the bot is the source, each speaker's real NAME is shown instead of "OTHERS", degrading gracefully to "OTHERS" until the bot delivers reliable per-speaker labels. Existing controls are wired into the redesign: language selection, helper-connected status, source indicator, engine selector, talk-balance, compliance acknowledgement.

Three use cases on the one cockpit:
1. Meeting coach (base).
2. Interview assistant, both sides: interviewer side (built: candidate verification + cited evidence pack) and a new interviewee side that coaches the candidate to present themselves better. Whoever subscribes is the side coached.
3. Customer-service assistant: wired to the customer's CRM / contact-centre APIs to pull the caller's record live, plus product-knowledge context. Heaviest integration; later add-on.

Commercial model: base = the Meeting system in usage tiers 1/2/3 priced on meetings or hours per month, plus a bespoke Enterprise tier. Stackable add-ons (Interviewer, Interviewee, Customer-service), each unlocking its own settings tab; multiple allowed. Consider a 3-month minimum term on interviewer/interviewee plus a 7 or 14-day trial. Settings page: account, subscription/usage, billing, per-add-on tabs. Billing via Stripe entitlements; add-on logic must never block or complicate the core meeting tier.

Provisional build/GTM sequence: Meeting base + Interviewer first (largely built), Interviewee next (reuses the coaching engine on the operator's own audio), Customer-service last (integration-heavy).

## 13. Meeting bot (self-hosted) — provider provisioning

Direction: self-hosted provider-adapter bot, Zoom first then Teams; modular and horizontally scalable. A Recall.ai account exists for interim testing only and is to be torn down once self-hosted is live.

Zoom Meeting SDK app provisioned (30 Jun 2026):
- App "Pacific Meeting Bot", General App, User-managed, Development. App ID LC9eBx0HTTyc_EyVqUAgHA. Client ID tzRQUuRpTZ6w1CaKVgZLg. Client Secret held in the Zoom console and the operator vault; NOT in the repo.
- Meeting SDK feature enabled. Native SDKs available include Linux x86_64 and arm64 (headless bot host), Windows, macOS, Electron, React Native.
- Credential storage: the Meeting SDK JWT signature must be minted server-side, so the Client Secret lives only as a Cloudflare Worker secret on smc-engine (planned names ZOOM_SDK_CLIENT_ID, ZOOM_SDK_CLIENT_SECRET). The worker mints the short-lived signature; the bot host never holds the secret.
- Platform rule: from 2 Mar 2026, apps joining meetings outside their own account must authorise via OBF/ZAK tokens or RTMS. Applies to joining external customer meetings (own-account testing unaffected); decide OBF/ZAK vs RTMS at wiring time.

## 14. Code signing

Decision: sign the Windows/Electron installers via Azure Trusted Signing (cloud signing, low monthly cost, signtool and CI friendly), in preference to a legacy CA OV/EV certificate that now forces a hardware token/HSM and is awkward to automate.

Signing entity: Pacific Infotech Limited (18-year-old CSP), NOT Pacific Technology Group (~12 months old). Azure Trusted Signing's streamlined organisation validation expects roughly three or more years of verifiable business history; PTG does not yet meet it, Pacific Infotech comfortably does, and an established publisher also gives better SmartScreen reputation from day one. Trade-off: the installer's displayed publisher will read "Pacific Infotech Limited" rather than PTG or the product brand. Operator to confirm the entity before validation is submitted.

Status: not started. Next: drive the Azure portal setup (resource group, Trusted Signing account, certificate profile, CI signer credential) under Pacific Infotech; the identity-validation form is the operator's part.

### 14.1 Code-signing progress — 30 Jun 2026
Azure Trusted Signing (Artifact Signing) account created under Pacific Infotech. Account "pacificinfotech-signing", resource group rg-codesigning, region West Europe, Basic tier (9.99 USD/month), subscription fb4133ac-0c6b-4369-b5b6-e0ba5248d31f, tenant khan.vg (Pacific Infotech (UK) Ltd). Account endpoint https://weu.codesigning.azure.net/.
Remaining (operator, because RBAC role changes and legal identity validation are not automated): (1) assign the "Artifact Signing Identity Verifier" role to the operator on the account via Access control (IAM); (2) New identity > Organization, submit Pacific Infotech's registered legal details (Microsoft verifies, can take a few days). After validation passes: create a Public Trust certificate profile, assign the "Trusted Signing Certificate Profile Signer" role to the CI identity, then wire signing into the Windows/Electron build using the account endpoint and certificate profile name.

### 14.2 Identity validation submitted — 30 Jun 2026
Organization identity validation submitted for Pacific Infotech (UK) Ltd, Public trust. Validation id 2e7dc699-072c-4547-b831-264f. Status: In Progress.
Microsoft processing time is 1 to 7 business days (longer if they request more documents); it cannot be expedited and duplicate requests for the same in-progress entity do not help.
Eligibility cleared: Public Trust org validation requires the organisation's founded date to be more than 3 years ago. Pacific Infotech (incorporated 24 Nov 2008) clears this comfortably; this is exactly why it was chosen over PTG (~12 months old, which would have been rejected on this rule).
Common stall causes to watch: (1) Microsoft emails a verification link to the primary email on the request; it must be clicked within 7 days, from a mailbox that accepts external email and is not a distribution list. (2) Submitted org name/address must exactly match Companies House (registered details were used). (3) A domain-ownership check on pacificinfotech.co.uk may be requested; provide WHOIS proof if asked.
After validation passes: Claude creates a Public Trust certificate profile on the account; operator assigns the "Trusted Signing Certificate Profile Signer" role to the CI identity (access change, operator-only); Claude wires signing into the Windows/Electron build via the Trusted Signing GitHub Action (needs a federated credential for the trusted-signing app and .NET 8 for signtool).
