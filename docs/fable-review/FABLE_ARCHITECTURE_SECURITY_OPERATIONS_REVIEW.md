# FABLE ARCHITECTURE, SECURITY AND OPERATIONS REVIEW
Silent Meeting Copilot (SMC). Independent Fable 5 review, 6 July 2026.
Basis: dossier only. No code inspected. Confidence ratings reflect that constraint.

## 1. Architecture assessment

Verdict: sound for V1 scale, with two structural caveats.

Strengths:
- Next.js/Vercel app, Cloudflare Worker engine with a Durable Object per user, Neon Postgres, R2 for optional audio. Boring in the good sense; every component is managed, scalable to hundreds of users without redesign.
- Source-agnostic, channel-labelled engine input is the single best architectural decision in the project. It makes the bot a feed source rather than a dependency, which is exactly what lets this review demote the bot without touching the roadmap's destination.
- DO-per-user control plane with lease-based capture, epochs, and fail-closed auth is a clean model that avoids WebRTC/SFU complexity. The Codex APPROVE-WITH-CHANGES note "revisit at scale" stands; DO-per-user (idFromName on email) will need a look at hot-user concurrency and multi-session-per-user semantics before team accounts, not before.

Caveats:
1. The bot subsystem breaks the architecture's quality line. Everything else is managed cloud; the bot is a C++ binary plus systemd poller on a home-LAN Ubuntu VM with an ARP-pinned IP, deployable only via a wedged Windows bridge chain. As a lab rig for proving the Zoom SDK, fine. As a commercial component, it is the weakest link in an otherwise credible stack. If/when the bot ships commercially it must move to a rentable host (small VPS or container host with the Zoom SDK) with its own deploy pipeline.
2. Engine deploys are manual, from one Mac, with a token convention documented as easy to get wrong. This is a bus-factor-one deploy path for the most critical runtime component.

Codebase structure (as described): coherent monorepo (app/, worker/, bot/, helper/, scripts/, docs/), documented fragile areas, master roadmap in-tree. No structural concerns at this scale. Exact tree UNKNOWN; the original chat should confirm nothing has drifted from the dossier's map.

Data model: reasonable. Entities inferred in part (UNKNOWN flag stands); original chat must dump the actual schema and commit it to docs before Phase 3 metering, because metering will hang usage records off sessions/meetings and guessing the schema is how billing bugs are born.

Integrations: Resend, Brave, Sarvam, Zoom SDK, Fireflies (benchmark), Anthropic, Cloudflare AI. Note the quiet vendor-concentration on Cloudflare (engine, DO, R2, Workers AI, deploy token) and Anthropic (coaching). Acceptable at this stage; record it as a known dependency risk.

AI/agent design: Opus primary with Sonnet fallback, cheaper model for rolling summary, 70b for evidence extraction. Sensible tiering. Missing: per-session token/cost logging. Without it, pricing is guesswork (see Issue A9).

## 2. Issue register

Format per issue: severity, confidence, evidence, why it matters, fix, blocks build, blocks public launch, owner, acceptance criteria.
"Owner: original chat" means dispatchable engineering work under the existing executor model. "Owner: Mo" means operator decision, money, or external party.

### A1. Auth multi-user hardening backlog open
- Severity: CRITICAL. Confidence: HIGH.
- Evidence: dossier section 9: logout does not revoke at the edge until cookie expiry; no lockout/rate-limit on verify and TOTP endpoints; allowlist not re-checked at every phase; TOTP secret unencrypted at rest; TOTP self-implemented; no auth-event alerting.
- Why it matters: these are the first six findings of any competent external review, and design partners cannot be invited until closed. Edge-ineffective revocation plus no lockout is a credible account-takeover chain.
- Fix: implement the backlog as already specified; replace self-implemented TOTP with a vetted library (recommended over "heavily test"); encrypt TOTP secrets at rest; add lockout and per-endpoint rate limits; re-check allowlist/entitlement at session validation; wire auth events to alerting. Cross-review per house rule.
- Blocks build: no. Blocks public launch: yes, and blocks design-partner invites.
- Owner: original chat (executor job), Codex cross-review.
- Acceptance: logout invalidates within 60 seconds at the edge; 5-failure lockout with backoff on verify/TOTP; TOTP secrets encrypted with key rotation documented; vetted TOTP library in use; auth anomaly alert fires in a test; IDOR suite still green.

### A2. No DPA, processor posture, privacy policy, terms, sub-processor list
- Severity: CRITICAL. Confidence: HIGH.
- Evidence: dossier sections 9, 14, 16: processor/DPA posture UNKNOWN; trust surface planned, not built.
- Why it matters: SMC processes third-party voice data (candidates) on behalf of customers. That is processor territory under UK GDPR the moment the first external customer signs. No agency can lawfully use it without a DPA. Competitors (Hedy) already advertise DPAs and SOC 2.
- Fix: produce privacy policy, terms, DPA template, sub-processor list (Anthropic, Cloudflare, Neon, Vercel, Resend, Deepgram-via-Cloudflare, Sarvam, Zoom when applicable), retention statement (already have the engineering), recording-consent guidance. External counsel review.
- Blocks build: no. Blocks public launch: yes.
- Owner: Mo (counsel engagement); drafting assist by original chat.
- Acceptance: signed-ready trust pack reviewed by counsel; security page content derived from it.

### A3. Employment-AI regulatory exposure on the Interviewer add-on
- Severity: CRITICAL (for selling the add-on). Confidence: MEDIUM (legal applicability requires counsel; the product design already anticipates parts of it).
- Evidence: dossier sections 9 and 17: UK GDPR Article 22 considerations noted; cited-evidence reframe done for fairness/defensibility; no formal legal position; external customers planned in the EU/UK market.
- Why it matters: AI systems evaluating candidates fall in the EU AI Act high-risk category (Annex III employment) and analogous automated-employment-decision regimes elsewhere. Obligations can include risk management, logging, human oversight, transparency to candidates. SMC's human-in-the-loop, cited-evidence, disclaimered design is well positioned, but positioning is not a legal opinion. External research required.
- Fix: counsel opinion on classification and obligations for UK plus EU sales; candidate-facing transparency text; document the human-oversight controls already built; decide market restrictions if needed.
- Blocks build: no. Blocks public launch: yes for the Interviewer add-on specifically (base coach unaffected).
- Owner: Mo (counsel); original chat documents controls.
- Acceptance: written legal position on file; any required product changes ticketed; marketing claims reviewed against it.

### A4. No monitoring or alerting on the product path
- Severity: HIGH. Confidence: HIGH.
- Evidence: dossier section 10: platform telemetry only; bespoke monitoring UNKNOWN/not confirmed; auth alerting on backlog.
- Why it matters: live coaching is a during-the-meeting product. A silent mid-interview failure is the worst possible customer moment and today nothing pages anyone.
- Fix: minimal but real: engine error-rate and WS disconnect alerts (Cloudflare), app route error alerts (Vercel or Sentry, Sentry MCP already exists in the toolchain), session-death heuristic (capture authorised then no segments for N minutes), helper heartbeat-loss aggregation, alert delivery via the existing Pacific notification stack.
- Blocks build: no. Blocks public launch: yes (first paying user).
- Owner: original chat.
- Acceptance: induced engine failure and induced helper drop both produce an alert within 5 minutes; runbook entry for each alert.

### A5. No staging; migrations run at build against production
- Severity: HIGH. Confidence: HIGH (dossier flags environment separation UNKNOWN, migrations idempotent at build).
- Evidence: dossier sections 6, 8, 18: production is the live path; idempotent migrate.mjs at build; staging UNKNOWN; "do not assume a staging environment exists."
- Why it matters: idempotent CREATE IF NOT EXISTS migrations are safe until the first destructive or data-shaping change, which Phase 3 metering and Phase 4 billing will require. Testing billing logic against production only is how customers get double-charged.
- Fix: minimal staging: Neon branch database plus a Vercel preview env pinned to it plus a staging engine worker (wrangler env). Not a full duplicate estate; one branch and one env file.
- Blocks build: no. Blocks public launch: effectively yes before Stripe goes live; recommended before Phase 3.
- Owner: original chat; Mo approves the small cost.
- Acceptance: a metering change can be exercised end-to-end on staging with production untouched.

### A6. Manual single-machine engine deploy
- Severity: HIGH. Confidence: HIGH.
- Evidence: dossier sections 6, 10, 11: wrangler deploy only from the Mac, fragile token convention, engine auto-deploy CI (PR #4) parked pending a deploy-capable token.
- Why it matters: bus factor one on the most critical runtime; the documented token trap has already cost debugging time; incident response depends on one physical machine being reachable.
- Fix: finish PR #4: CI deploy with a scoped repo secret, dry-run gate, and rollback-to-previous-version documented.
- Blocks build: no. Blocks public launch: yes (operational credibility gate).
- Owner: original chat; Mo provisions the token.
- Acceptance: merge to main deploys the engine via CI; rollback runbook tested once.

### A7. Commercial Phase 2 cockpit built but unverified and unmerged
- Severity: HIGH. Confidence: HIGH.
- Evidence: dossier sections 4, 12, 13: review branch worker/job-smc-cockpit-p2, executor exit 0, standing rule requires live compiled CSS verification; theme executor has missed twice before.
- Why it matters: the hero screen of the product is in limbo; everything commercial stacks behind it.
- Fix: execute the existing verification protocol, operator interactive pass, merge or reject.
- Blocks build: yes (it is the head of Track C). Blocks public launch: yes.
- Owner: original chat plus Mo (interactive pass, since magic-link + TOTP requires the operator).
- Acceptance: Live Focus renders on the live URL, all controls preserved, no behavioural regression, merged to main, deployed READY.

### A8. Zoom bot: live join unproven; commercial distribution requirements UNKNOWN; non-commercial infrastructure
- Severity: HIGH if bot is in V1; MEDIUM once demoted to fast-follow. Confidence: HIGH on the join/infra facts; LOW on Zoom marketplace specifics (external research required).
- Evidence: dossier sections 4, 10, 12: join untested, per-participant capture not wired, gated on a wedged bridge, home-LAN VM with ARP pin and pending DHCP reservation.
- Why it matters: an unproven, single-host, home-network component cannot sit in a paid path. Additionally, distributing a Meeting SDK bot for customer accounts may involve Zoom app review/marketplace terms that have not been checked; that could add weeks.
- Fix: demote to fast-follow (strategy decision D3); prove live join opportunistically; before any commercial bot, research Zoom distribution requirements and rehost the bot on rentable infrastructure with its own deploy path.
- Blocks build: no. Blocks public launch: no, once out of V1 scope.
- Owner: original chat (technical), Mo (scope decision), external research required (Zoom terms).
- Acceptance for fast-follow gate: live join passes including waiting room and passcode heuristic; Zoom distribution position documented; bot host is not on the home LAN.

### A9. Unit economics uninstrumented on the coach path
- Severity: HIGH (commercial). Confidence: HIGH (no cost logging mentioned anywhere in the dossier).
- Evidence: dossier sections 6, 14: Opus primary coaching, pricing to be "billable processed meeting minutes," exact prices UNKNOWN, no per-session cost telemetry described.
- Why it matters: if Opus cost per coached minute exceeds the intended revenue per minute, the pricing model is structurally negative margin and nobody would know until Stripe reports arrive.
- Fix: log model, tokens and computed cost per session; produce cost per billable minute across a week of real sessions; feed into pricing (commercialisation review).
- Blocks build: no. Blocks public launch: blocks pricing sign-off.
- Owner: original chat.
- Acceptance: dashboard or report showing cost per billable minute by session type; pricing document references it.

### A10. Helper productisation gaps (persistence bugs, unsigned installer, no operator E2E on Windows)
- Severity: HIGH for V1 (the helper is the V1 delivery vehicle). Confidence: HIGH.
- Evidence: dossier sections 5, 7, 12, 13: pairing-key persistence bug, saved-session language/engine bug, signing inert pending secrets, Phase 1 real-audio operator pass still open.
- Why it matters: V1 as recommended rides entirely on the helper. A stranger hitting SmartScreen warnings, a lost pairing after reboot, or a session that forgets its language will churn in week one.
- Fix: fix both bugs; Mo adds the three signing secrets; run the operator real-audio E2E; write the stranger-facing install guide as part of onboarding.
- Blocks build: no. Blocks public launch: yes.
- Owner: original chat; Mo (secrets, E2E pass).
- Acceptance: signed installer, no SmartScreen block; pairing survives restart; reopened session keeps language/engine; operator E2E recorded as passed.

### A11. Plaintext meeting passcode in bot_requests
- Severity: MEDIUM. Confidence: HIGH.
- Evidence: dossier section 8, with mitigations noted (short-lived, never logged, not client-exposed).
- Why it matters: low practical risk, but it is exactly the kind of finding a customer pen test flags, and the fix is cheap.
- Fix: encrypt at rest with the same KMS approach as TOTP secrets, or null the field on terminal states at minimum.
- Blocks build: no. Blocks public launch: no.
- Owner: original chat. Acceptance: passcode unreadable at rest or purged on terminal state; bot flow still joins.

### A12. Rate limiting fails open
- Severity: MEDIUM. Confidence: HIGH (dossier states fail-open explicitly).
- Why it matters: deliberate availability trade-off, acceptable now, but under attack the limiter is the thing being attacked. Revisit before public launch: fail-open for internal callers, fail-closed (or degraded) for anonymous paths.
- Owner: original chat. Blocks launch: no, but review it in the hardening pass.

### A13. Backups and restore untested
- Severity: MEDIUM. Confidence: MEDIUM (Neon defaults assumed, no runbook).
- Fix: document Neon PITR settings, run one restore drill to a branch, write the runbook. R2 audio is dormant so out of scope until the flag flips.
- Blocks launch: no, but do it in the 60-day window. Owner: original chat.

### A14. Per-device helper key revocation UI deferred; git-embedded credential to rotate
- Severity: MEDIUM and LOW respectively. Confidence: HIGH.
- Both already tracked. Revocation UI becomes required once any non-operator device exists (design partners), so it moves inside the launch window. Credential rotation is operator hygiene; do it this month.
- Owner: original chat / Mo.

### A15. Orchestration delivery risk (Windows worker defects, Worker 2 wedged)
- Severity: MEDIUM for the product (it is delivery machinery, not product), HIGH for schedule confidence. Confidence: HIGH.
- Evidence: dossier section 10: three demonstrated runner defects; Worker 2 parity pending; Mac executor is the single reliable path.
- Why it matters: the entire 90-day plan assumes executor throughput. With one reliable executor, schedule estimates carry a single point of failure.
- Fix: already owned by Skill Maintenance; the original chat should simply route all launch-critical jobs to the Mac executor and treat Worker 2 as opportunistic until proven.
- Blocks build: partially (bot workstream). Blocks launch: no, given the bot demotion.

## 3. Testing and quality

Current: strong regression posture where it matters (IDOR blocking gate, bot wire format, rate limit, retention), transcript WER/CER harness, deploy dry-runs. Better than typical seed-stage.

Gaps to close for launch:
- No authenticated end-to-end flow test (blocked by magic-link plus TOTP needing the operator). Mitigation: a test-mode auth bypass on staging only, gated by env, so E2E can run headless on staging. Do not weaken production auth for testability.
- 30-minute coach soak against a synthetic long session (was skipped). Run it on staging once staging exists.
- Visual regression remains a manual compiled-CSS check. Acceptable given the standing rule, but add a screenshot-diff step to CI for the cockpit route once Phase 2 merges.
- Load sanity: one test at 10 concurrent sessions to validate DO and rate-limit behaviour before design partners.

## 4. Launch gates (consolidated)

Gate list for external paying users, in order:
1. Cockpit Phase 2 verified and merged (A7).
2. Operator real-audio Windows E2E passed (A10).
3. Auth hardening backlog closed and cross-reviewed (A1).
4. Helper productisation: signed installer plus both persistence bugs (A10).
5. Monitoring/alerting minimum viable (A4) and CI engine deploy (A6).
6. Trust pack reviewed by counsel (A2) and employment-AI position on file (A3).
7. Name cleared and flipped via brand token; domains live.
8. Metering visible (minutes plus interviews) and minimal entitlements.
9. Onboarding/first-run good enough for a stranger with a founder call.
10. Payment path: manual invoicing accepted for design partners; Stripe required only for public self-serve.

Explicitly not gates: bot live join, insights, customer-service vertical, audio retention go-live, interviewee coach.
