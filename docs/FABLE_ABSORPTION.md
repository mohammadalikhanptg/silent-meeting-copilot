# Fable 5 Review Absorption — Reconciliation, Merged Roadmap, Execution Queue

Date: 6 July 2026. Absorbed by the original SMC project chat (Chat 4). Source files: docs/fable-review/ (eight files, committed 11d015b). Dossier: docs/PROJECT_DOSSIER_FOR_FABLE_REVIEW.md.

Absorption rules honoured: original roadmap preserved (nothing deleted from ROADMAP.md; demotions are re-flags with reasons here); in-progress work preserved (cockpit Phase 2 verification, bot workstream state, all open register items); no silent adoption, no silent dropping; decision-log conflicts recorded as new entries, originals intact; no restart.

## 1. File inventory (Step 1)

All eight expected files received; none missing.
1. FABLE_REVIEW_MASTER_REPORT.md — verdict: continue, re-sequence; scores 58/22/66/52/28; top risks: falsified "unique-first" positioning, interview-vertical regulatory exposure, zero demand evidence, naming gate, single-operator infra, auth backlog, unit economics, bot absorbing attention, no monitoring, no trust surface.
2. FABLE_PRODUCT_STRATEGY_REVIEW.md — repositioning to interview integrity; ICP UK recruitment agencies; missing buyer journeys; overbuild confirmed; MVP/V1 redefinition (emphasis, not content).
3. FABLE_ARCHITECTURE_SECURITY_OPERATIONS_REVIEW.md — architecture sound; issue register A1-A15; consolidated 10-gate launch list; testing gaps.
4. FABLE_COMMERCIALISATION_AND_MONETISATION_REVIEW.md — conditional viability; hybrid seat+usage pricing hypothesis; founding-programme motion; sales objections; proof bar before Stripe.
5. FABLE_WEBSITE_POSITIONING_AND_GO_TO_MARKET_PLAN.md — positioning statement, W1/W2 site plan, message architecture, demo/lead flow, launch sequence, ten-conversations plan, 90-day GTM.
6. FABLE_ROADMAP_AND_IMPLEMENTATION_BACKLOG.md — Tracks A-E task backlog with priorities/effort/acceptance, sequencing note.
7. FABLE_DECISIONS_FOR_MOHAMMAD.md — D1-D9.
8. FABLE_PROMPT_TO_ABSORB_REVIEW_IN_ORIGINAL_CHAT.md — absorption instructions (followed here).

## 2. Current state at absorption (Step 2)

Objective: private real-time meeting strategist; recruitment vertical flagship. Live on Vercel/Cloudflare, main branch, no external users. Active task at absorption: commercial Phase 2 cockpit built on worker/job-smc-cockpit-p2, unverified, unmerged. In progress: Worker 2 parity remediation (Skill Maintenance); bot VM-side work parked. Blockers: Worker 2 bridge (bot line only); operator-gated items (name, keys, counsel). Existing gates: auth hardening before invites; rename before launch. Commercial assumptions pre-review: minutes-metered base + add-ons, V1 = base + Interviewer, Stripe Phase 4. Docs: ROADMAP.md (single driver), security-framework, retention-policy, meeting-bot-design, dossier, specs. Handoff: Sanity wfHandoff chain per house process.

## 3. Original Product Roadmap Baseline (Step 3)

The baseline is ROADMAP.md in full, at commit 11d015b and earlier, plus dossier section 3. It is not restated here to avoid a divergent copy; ROADMAP.md is append-only history and remains the baseline of record. Nothing in it is deleted by this absorption. Items re-flagged by this absorption (with the new flag and reason) are listed in section 4 verdicts; their original entries stand untouched.

## 4. Recommendation decision matrix (Step 4)

Legend: verdict ACCEPT / ACCEPT-PENDING-MO (accepted subject to a D-decision) / DEFER (valid, later, trigger stated) / REJECT (reason stated). Effects: OR = original roadmap, CR = commercial roadmap, WG = website/GTM. "Gate" = blocks external paying users. All Fable task IDs (A-x, B-x, C-x, D-x, E-x) refer to docs/fable-review/FABLE_ROADMAP_AND_IMPLEMENTATION_BACKLOG.md, which carries full acceptance criteria; they are not duplicated here.

Strategy and positioning
- Retire the "unique-first live coach" claim; reposition to interview integrity / live interviewer coaching with defensible evidence (master report 1/7, strategy 1). VERDICT: ACCEPT the factual correction unconditionally (external evidence cited: Hedy, Otter live tips, Fireflies Live Assist, sales CI category); the wedge choice itself is ACCEPT-PENDING-MO (D2). Effect: CR/WG messaging rewritten; OR untouched (features unchanged). Gate: yes for public messaging.
- V1 emphasis flips to interviewer-led with base Meeting Coach as platform tier; content of V1 unchanged (strategy 6). VERDICT: ACCEPT-PENDING-MO (D2). Preserves the locked "base independently sellable" rule.
- ICP: UK recruitment agencies 2-50 seats first (commercialisation 2). VERDICT: ACCEPT-PENDING-MO (D2 includes market confirmation).
- Interviewee vertical gets a fresh go/no-go later rather than automatic inheritance (strategy 7). VERDICT: ACCEPT. It was already deferred; the go/no-go gate and the reputational-risk rationale are added. OR entry preserved with the new flag.

Scope and sequencing
- Bot demoted to fast-follow, out of V1; live join proved opportunistically; per-participant capture only on customer pull (strategy 7, arch A8, D3). VERDICT: ACCEPT-PENDING-MO (D3). This is a re-flag, not a deletion: every bot milestone (b1-b7) stays on the roadmap; A-6/A-7 remain queued at P2. Conflict with the 29 Jun "self-hosted bot" emphasis recorded in section 8 decision log addendum; self-hosted choice itself is NOT reversed.
- Insights (Phase 5) post-revenue in all scenarios. VERDICT: ACCEPT. Matches existing direction; formalised.
- Customer-service vertical, Teams adapter, MCP orchestration, personalisation: unchanged post-launch. VERDICT: ACCEPT (no change).
- Audio retention stays dormant until customer need + consent framework. VERDICT: ACCEPT (no change).
- Stripe (Phase 4) built only after design-partner validation; founding programme on Xero invoices first (commercialisation 4, D5). VERDICT: ACCEPT-PENDING-MO (D5). Reshapes Phase 4 sequencing; Phase 4 content preserved.
- Metering (Phase 3) simplified to admin-visible processed minutes + interview counts + minimal entitlement flags (strategy 7, C-6). VERDICT: ACCEPT. Reshapes Phase 3 scope; full rating/proration moves to the Stripe phase.

Security and architecture (issue register)
- A1 auth hardening backlog closed + cross-reviewed, gates design-partner invites. VERDICT: ACCEPT (already our gate; acceptance criteria adopted). TOTP replacement inside it is ACCEPT-PENDING-MO (D7, recommended approve).
- A2 trust pack (privacy policy, terms, DPA, sub-processors, retention statement, consent guidance) with counsel review. VERDICT: ACCEPT-PENDING-MO (D6 budget). Drafting starts regardless; counsel review is the gate.
- A3 employment-AI legal position for the Interviewer add-on. VERDICT: ACCEPT-PENDING-MO (D6). Gate for selling the add-on.
- A4 minimal monitoring/alerting via the existing notification stack. VERDICT: ACCEPT. Gate before first paying user.
- A5 minimal staging (Neon branch + pinned preview + staging worker env). VERDICT: ACCEPT-PENDING-MO (D8 cost). Required before metering/billing changes.
- A6 CI engine deploy (finish PR #4) + rollback drill. VERDICT: ACCEPT-PENDING-MO only on the token (D9); work accepted.
- A7 cockpit verify/merge. VERDICT: ACCEPT (it is our current active task; unchanged).
- A8 bot infra: rehost off home LAN before commercial use (B-13) and Zoom distribution research (B-14). VERDICT: ACCEPT as fast-follow gates. B-13 cost is ACCEPT-PENDING-MO.
- A9 unit-economics instrumentation (B-1) + billable-minute definition (B-2). VERDICT: ACCEPT, P0. Blocks pricing sign-off.
- A10 helper productisation (two persistence bugs already on our register, signed installer, operator E2E). VERDICT: ACCEPT; bugs were already ours, now launch-gated.
- A11 encrypt/null bot_requests passcode (B-7). VERDICT: ACCEPT. Cheap, pre-empts a certain pen-test finding.
- A12 rate-limiter fail-mode review (B-8). VERDICT: ACCEPT (hardening-pass item).
- A13 backup/restore drill + runbook (B-9). VERDICT: ACCEPT (60-day window).
- A14 per-device key revocation UI promoted into the launch window (C-5); credential rotation this month (B-15). VERDICT: ACCEPT both.
- A15 route launch-critical executor jobs to the Mac executor; Worker 2 opportunistic. VERDICT: ACCEPT (already our operating posture).
- B-6 staging-only auth bypass for headless E2E. VERDICT: ACCEPT WITH TIGHTENING: the bypass must be compile-time excluded from production builds (not merely env-gated at runtime) and covered by a test proving its absence in the production bundle. Reason: an env-gated auth bypass is one misconfiguration away from production; the stricter form costs little.
- B-10 confirm and commit the real Postgres schema before metering. VERDICT: ACCEPT, P1 (pre-C-6 dependency).
- B-11 cockpit screenshot-diff in CI. VERDICT: ACCEPT post-merge.
- B-12 load sanity + 30-min soak on staging. VERDICT: ACCEPT (staging-dependent).

Commercial, pricing, packaging
- Hybrid pricing: per-seat tiers with included processed hours + overage; Interviewer as seat uplift or per-interview; GBP 29/49/79 anchor ladder for testing; drop 3-month minimum for founding partners (commercialisation 3, D4). VERDICT: ACCEPT-PENDING-MO (D4). Conflict with the locked 30 Jun single-metric decision recorded in section 8; original decision log intact. Note: the single auditable metric (billable processed minutes) SURVIVES as the metering/fair-use unit either way; what changes is the headline price structure.
- Proof bar before self-serve monetisation: 3+ design partners at/near target price, one referenceable, gross margin >70% at target. VERDICT: ACCEPT as the Stripe go-gate.
- Founding agency programme (5-10 agencies, ~50% founding price, 3-month engagement, case-study rights, Xero invoicing). VERDICT: ACCEPT-PENDING-MO (D5, discount level Mo's call).
- Support minimum (founder onboarding call, support email, next-business-day commitment, FAQ, incident template). VERDICT: ACCEPT; commitment level ACCEPT-PENDING-MO (C-8).
- SOC 2 readiness post-revenue (D-8). VERDICT: DEFER (trigger: revenue + first enterprise-ish prospect). Preserved here and in the backlog.
- Pricing experiments 1-4 (commercialisation 10). VERDICT: ACCEPT as the design-partner test plan.

Website and GTM (all preserved; none live before rename clears)
- Positioning statement + positioning rules. VERDICT: ACCEPT-PENDING-MO (D2 wording depends on wedge approval); the "never claim only live coach" rule is ACCEPT unconditionally.
- W1 four-page site (landing, security, privacy, terms + demo-request form), W2 full site later (D-3, D-6). VERDICT: ACCEPT; W1 gated on C-2/C-3; W2 DEFERRED to the 61-90 window (trigger: design-partner evidence + pricing).
- Homepage message architecture, narrative sections, FAQ themes, pricing-page approach ("Founding programme" placeholder until validated). VERDICT: ACCEPT as the copy brief for D-3/D-6.
- Demo/lead flow + asset list (sample evidence pack, canned interview script + CV, terms sheet, install guide, consent one-pager, security page, 3-minute video). VERDICT: ACCEPT (D-2 assets are P0 once cockpit merges).
- Launch sequence (nothing public pre-rename; private founding programme; public soft launch with case study). VERDICT: ACCEPT as the launch plan of record.
- Ten sales conversations plan with success criteria (3+/10 validates; 0-1 revisit ICP/price). VERDICT: ACCEPT-PENDING-MO (D2/D5; Mo runs them).
- Recruitment channel research (D-7). VERDICT: DEFER (trigger: W2/soft launch).
- Base-coach messaging kept to a single platform page, no acquisition spend in first 90 days. VERDICT: ACCEPT.

Rejected
- None rejected outright. Every material recommendation was either already ours, accepted, accepted pending a Mo decision, deferred with a trigger, or (B-6) accepted with a tightened control. The closest to rejection: Fable's implicit suggestion that Backcue be defaulted this week is NOT adopted as a default; the name remains genuinely Mo's decision (D1) with Backcue recorded as the reviewer's pragmatic front-runner.

## 5. Merged roadmap (Step 5)

Track A, original product roadmap: preserved in full in ROADMAP.md. Live items re-flagged by this absorption: bot line b5-b7 -> fast-follow (pending D3); interviewee coach -> deferred + fresh go/no-go; Insights -> post-revenue; Phase 3 -> minimal metering scope; Phase 4 -> post-validation Stripe.
Track B, accepted technical/security/architecture improvements: B-1, B-2, B-4, B-5, B-6 (tightened), B-7, B-8, B-9, B-10, B-11, B-12, B-13, B-14, B-15, C-1, C-5, plus A-3/A-4/A-5/A-10 helper productisation.
Track C, accepted commercialisation/monetisation/pricing/packaging: hybrid pricing hypothesis (pending D4), founding programme (pending D5), unit-economics gate, billable-minute definition, minimal metering C-6, support minimum C-8, Stripe D-5 post-validation, SOC 2 deferred D-8, pricing experiments.
Track D, accepted website/positioning/GTM: positioning statement + rules (pending D2), demo assets D-2, W1 site D-3, ten conversations D-4, W2 site D-6 (deferred trigger), channel research D-7 (deferred), launch sequence, base-coach single page.
Track E, launch gates (consolidated, order of the architecture review): (1) cockpit verified+merged; (2) operator real-audio Windows E2E; (3) auth hardening closed+cross-reviewed; (4) helper productisation (signed installer + both bugs); (5) monitoring/alerting + CI engine deploy; (6) counsel-reviewed trust pack + employment-AI position (add-on specific); (7) name cleared+flipped, domains live; (8) minimal metering + entitlements; (9) stranger-capable onboarding; (10) payment path (manual invoicing suffices for design partners; Stripe only for public self-serve). Explicit non-gates: bot live join, insights, customer-service vertical, audio retention go-live, interviewee coach.
Track F, deferred/post-launch: bot convenience feature E-1 (after A-6/A-7/B-13/B-14), Insights E-2, evidence-pack branding E-3, Hindi/Urdu marketing E-4, DO scale review E-5, enterprise controls E-6, SOC 2 D-8, W2/D-7, customer-service vertical, Teams adapter, MCP orchestration, personalisation, audio retention go-live, interviewee go/no-go.
Track G, rejected: none outright; B-6 accepted only in the tightened compile-time-excluded form; Backcue-as-default not adopted (name stays a live Mo decision).

Sequenced execution (what happens in what order):
1. Continues now from original roadmap: A-1 cockpit verify/merge (active task), then A-2 operator E2E.
2. Inserted before further phase work: C-1 auth hardening job (dispatch immediately, Mac executor); B-1/B-2 unit economics + minute definition; B-4 monitoring; B-5 CI engine deploy (on D9 token).
3. External clocks started on Mo's word: C-2 name clearance (D1), C-3/C-4 counsel (D6).
4. Parallel, non-blocking: bot line A-6+ opportunistically when Worker 2 clears (strictly off critical path); B-15 credential rotation; B-10 schema doc.
5. Deferred with triggers: Track F list above.
6. Mo decisions: D1-D9 (section 7 below).
7. Blocks public launch: Track E gates 1-10.
8. Commercialisation plan: Track C; Website/GTM plan: Track D; both preserved verbatim in docs/fable-review/ and summarised here.
9. If Fable 5 is unavailable, Opus 4.8 executes: everything marked "Opus 4.8 later: Yes" in the backlog file; the only items it cannot do are operator actions (E2E pass, secrets, decisions, sales calls) and external counsel work.

## 6. Updated implementation queue (Step 6)

Single merged queue. Fields: priority | task | source | status | dependencies | risk | Mo approval | next action. Acceptance criteria live in the backlog file per ID.
P0 | A-1 cockpit verify+merge | original | in progress | operator interactive pass | medium | No | verify branch vs deployed CSS after merge; operator pass; this is the current active task.
P0 | C-1 auth hardening job (incl. TOTP replacement) | both | pending | D7 approval for TOTP swap | high | D7 only | draft brief, dispatch to Mac executor immediately after A-1.
P0 | C-2 name + clearance | both (gate) | pending Mo | trademark counsel | high | D1 | Mo picks; clearance commissioned.
P0 | C-3 trust pack draft + counsel review | Fable | pending | D6 | high | D6 | drafting can start now; counsel on approval.
P0 | C-4 employment-AI position | Fable | pending Mo | D6 | high | D6 | brief counsel on approval.
P0 | B-1 unit-economics instrumentation | Fable | pending | none | low | No | dispatchable now.
P0 | B-2 billable-minute definition doc | Fable | pending | B-1 helpful | low | No | write and commit.
P0 | D-2 demo assets | Fable | pending | A-1 merged | low | No | build after cockpit merges.
P0 | D-1 founding-programme offer | Fable | pending Mo | D4, D5 | medium | D4/D5 | draft on approval.
P1 | A-2 operator real-audio E2E | original (gate) | pending Mo | helper build | medium | operator action | Mo runs on Windows hardware.
P1 | A-3/A-4 helper persistence bugs | original | pending | none | medium | No | dispatch as one helper job.
P1 | A-5 signed installer | original | blocked on secrets | D9 | low | D9 | Mo adds three repo secrets; re-run CI.
P1 | B-4 monitoring/alerting | Fable (gate) | pending | none | low | No | dispatchable now.
P1 | B-5 CI engine deploy | Fable (gate) | blocked on token | D9 | low | D9 | finish PR #4 once token exists.
P1 | B-3 minimal staging | Fable | pending Mo | D8 | low | D8 | stand up on approval.
P1 | B-6 staging auth bypass (compile-time excluded) | Fable (tightened) | pending | B-3 | medium | No | build with the absence-proof test.
P1 | B-7 passcode at-rest fix | Fable | pending | none | low | No | small job.
P1 | B-10 schema doc | Fable | pending | none | low | No | dump and commit before C-6.
P1 | B-15 rotate git credential | both | pending Mo | none | low | operator action | this month.
P1 | C-5 device key revocation UI | both (promoted) | pending | C-1 | medium | No | after hardening.
P1 | C-6 minimal metering + entitlements | reshaped Phase 3 | pending | B-2, B-10, A-1 | medium | No | scope per reshape.
P1 | C-7 stranger onboarding | reshaped c4 | pending | A-3/4/5 | medium | No | after helper fixes.
P1 | C-8 support minimum | Fable | pending Mo | none | low | commitment level | publish with W1.
P1 | D-3 W1 site (4 pages) | Fable | blocked on rename | C-2, C-3 | low | No | build ready-to-publish post-clearance.
P1 | D-4 ten sales conversations | Fable | pending Mo | D-1/2/3 | medium | Mo runs | after partners can be invited.
P2 | A-6 bot live join + VM install | original (fast-follow pending D3) | blocked (Worker 2) | bridge parity, live meeting | medium | D3 scope + meeting | opportunistic only.
P2 | A-7 per-participant capture | original | pending | A-6 | high | No | after live join, on customer pull.
P2 | B-8/B-9/B-11/B-12 | Fable | pending | staging/merge | low | No | hardening window.
P2 | B-13 bot rehost plan | Fable | pending | A-6 | medium | cost | before any commercial bot.
P2 | B-14 Zoom distribution research | Fable | pending | none | low | No | research task.
P2 | D-5 Stripe + add-on gating | reshaped Phase 4 | deferred until proof bar | D-4 evidence, C-6, keys | medium | D4 final numbers + keys | build post-validation.
P2 | D-6 W2 site + pricing + case study | Fable | deferred | D-4/D-5 | low | case-study approval | 61-90 window.
P2 | E-1 bot convenience feature | both | deferred | all bot gates | medium | No | post-launch.
P2 | E-2 Insights | original | deferred post-revenue | paying users | low | scope | post-revenue.
P3 | D-7, D-8, E-3, E-4, E-5, E-6, A-8 interviewee go/no-go, A-9 verticals, A-10 retention go-live | mixed | deferred | per backlog | per backlog | per backlog | triggers per Track F.

## 7. Approval needed from Mohammad (Step 8)

This week: D1 name pick + clearance budget (gates all public assets; recommended: pick the strongest clearable candidate now, second-choice cleared beats first-choice blocked). D6(a) clearance counsel engagement. D9 now-items: three installer-signing secrets + CI engine-deploy token (unblocks A-5 and B-5 immediately). D7 TOTP replacement approval (folds into the C-1 job I am about to dispatch; recommended: replace). D3 bot scope call (fast-follow recommended; changes executor priorities now).
Next two weeks: D2 wedge (interviewer-led, UK agencies; recommended approve). D5 founding programme + discount level + your commitment to run the ten conversations (recommended approve, 50%).
Within 30-45 days: D6(b)(c) trust-pack and employment-AI counsel budget. D4 pricing structure + GBP 29/49/79 test ladder (recommended hybrid). D8 staging cost (recommended approve). D9 later items: Brave (optional), Stripe keys (post-validation by design).
Risks are stated per decision in docs/fable-review/FABLE_DECISIONS_FOR_MOHAMMAD.md; recommendations above are Fable's, and I concur with all of them on the evidence, with the single caveat that D1 is genuinely your call and Backcue is a front-runner, not a default.

## 8. Decision log addendum (conflicts recorded, originals preserved)

- 30 Jun locked "usage metric = billable processed meeting minutes as the single headline metric" vs Fable hybrid seat+usage: NEW ENTRY, PENDING MO (D4). The auditable minute survives as the metering unit regardless.
- 29 Jun "unique-first category" positioning vs Fable falsification evidence: NEW ENTRY, ACCEPTED: uniqueness claim retired on external evidence; replacement wedge PENDING MO (D2).
- 29-30 Jun bot-in-scope emphasis (self-hosted, V1-adjacent) vs Fable fast-follow: NEW ENTRY, PENDING MO (D3). Self-hosted choice unchanged; only sequencing moves.
- 24 Jun interview traffic-light + evidence design: REINFORCED by Fable (compliance-as-feature); no change.

## 9. Commercial preservation confirmation

Every accepted or deferred commercialisation, monetisation, pricing, packaging, website, GTM, launch, trust, compliance, sales and onboarding recommendation now lives in permanent project documents: verbatim in docs/fable-review/ (all eight files committed), reconciled and sequenced in this file, gated in the Track E list, and queued in section 6. The project can continue without Fable 5 and without this chat.

## 10. Daisy-chain handoff prompt (Step 10)

For any future session: SMC continues from the MERGED roadmap, not a restart. Read ROADMAP.md (baseline + history), then docs/FABLE_ABSORPTION.md (this file: verdicts, merged queue, gates), then docs/fable-review/ for detail. Current active task: A-1 cockpit Phase 2 verify+merge (branch worker/job-smc-cockpit-p2). Next in order: C-1 auth hardening dispatch (Mac executor; include TOTP replacement if D7 approved), B-1/B-2 unit economics, B-4 monitoring, then per the section 6 queue. External clocks (D1/D6) start on Mo's approvals; chase them. Bot line is fast-follow pending D3: never let it gate launch work; Worker 2 is opportunistic. Launch gates are Track E 1-10; do not invite any external user before gates 3 (auth) and 6 (trust pack) close. Production rules: no changes to billing, auth boundaries, secrets, DNS, deployment settings, schema-destructive migrations, or third-party account settings without Mo; SMC only, never PAD. Decisions outstanding from Mo: D1-D9 grouped in section 7. Executor routing: launch-critical jobs to the Mac executor only.

## 11. Next execution step

A-1: verify the Phase 2 cockpit build (branch worker/job-smc-cockpit-p2) per the standing compiled-CSS rule, merge on pass, then request Mo's interactive pass; dispatch C-1 auth hardening immediately after.
