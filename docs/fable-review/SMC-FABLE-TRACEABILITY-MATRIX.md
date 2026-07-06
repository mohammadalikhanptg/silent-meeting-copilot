# SMC Fable Traceability Matrix

Purpose: item-by-item traceability from every material Fable 5 recommendation to its permanent destination, verdict and gating. Companion to docs/FABLE_ABSORPTION.md (verdicts and merged queue) and docs/launch/smc-launch-gates.md (gate register). Created 6 July 2026 during the absorption QA pass.

Legend and defaults (apply unless a row states otherwise):
- SRC files: MR = FABLE_REVIEW_MASTER_REPORT, PS = FABLE_PRODUCT_STRATEGY_REVIEW, AR = FABLE_ARCHITECTURE_SECURITY_OPERATIONS_REVIEW, CM = FABLE_COMMERCIALISATION_AND_MONETISATION_REVIEW, WG = FABLE_WEBSITE_POSITIONING_AND_GO_TO_MARKET_PLAN, BL = FABLE_ROADMAP_AND_IMPLEMENTATION_BACKLOG, DM = FABLE_DECISIONS_FOR_MOHAMMAD. All under docs/fable-review/.
- DEST default: docs/FABLE_ABSORPTION.md section 4 (verdict + reason) and section 6 (queue position); acceptance criteria live verbatim in BL per item ID and are not restated.
- Owner default: original project chat via executor dispatch (Mac executor for launch-critical). "Mo" = operator decision, money, hardware or external party.
- Task-store default: the merged queue in docs/FABLE_ABSORPTION.md section 6 is the operational register; Sanity wfTask records are created at dispatch time per house process, not pre-created. Standing Sanity task t-smc-fable-backlog-review-standing covers periodic re-review of deferred items.
- Blocks columns: IB = internal build, DP = design partner invite, PC = paid customer, PL = public launch.
- Gates cross-reference G1-G10: docs/launch/smc-launch-gates.md.

## 1. Master report top risks (MR s4)

R1 positioning failure ("unique-first" falsified) | STATUS: accepted (claim retired unconditionally); replacement wedge pending Mo D2 | DEST: ABSORPTION s4 strategy block; ROADMAP.md absorbed section; hub c8 note | Blocks: PL yes (messaging), IB/DP/PC no | Next: D2 answer, then positioning statement adopted (WG s1).
R2 interview-vertical regulatory exposure | STATUS: accepted as gate | maps to AR A3 / BL C-4 / D6 | Blocks: PC yes for Interviewer add-on, PL yes | Next: counsel on D6.
R3 demand risk (zero evidence) | STATUS: accepted; answered by design-partner motion | maps to BL D-1/D-4, D2/D5 | Blocks: none directly; governs sequencing | Next: D2/D5 answers.
R4 naming gate | STATUS: accepted; longest external clock | maps to BL C-2 / D1 | Blocks: PL yes, all public assets | Next: D1 this week.
R5 single-operator infra in commercial path | STATUS: accepted; mitigations = bot demotion (D3), CI deploy (B-5), bot rehost (B-13) | Blocks: PL via G5 | Next: D3, D9 token.
R6 auth backlog blocks commercial learning | STATUS: accepted (already our gate) | maps to AR A1 / BL C-1 / G3 | Blocks: DP yes, PC yes, PL yes | Next: dispatch C-1 after A-1.
R7 unit economics unquantified | STATUS: accepted P0 | maps to AR A9 / BL B-1, B-2 | Blocks: pricing sign-off (D4 final numbers) | Next: dispatch B-1.
R8 bot absorbing critical-path attention | STATUS: accepted; fast-follow pending Mo D3 | maps to AR A8 / BL A-6..A-7, B-13, B-14 | Blocks: none once demoted | Next: D3.
R9 no monitoring/alerting | STATUS: accepted | maps to AR A4 / BL B-4 / G5 | Blocks: PC yes, PL yes | Next: dispatch B-4.
R10 trust surface absent | STATUS: accepted | maps to AR A2 / BL C-3 / G6 | Blocks: DP practical, PC yes, PL yes | Next: draft now, counsel on D6.

## 2. Master report top opportunities (MR s5)

O1 reposition to recruiter-side verification -> D2 / WG s1 | accepted-pending-Mo.
O2 "the honest one" ethics positioning -> WG s1 rules + s4 ethics section | accepted (copy brief for D-3/D-6).
O3 bot-free private-by-design capture story -> WG s4 differentiation | accepted.
O4 Hindi/Urdu code-mix niche -> BL E-4 | deferred (trigger: W2 site live).
O5 design-partner revenue before Stripe -> BL D-1 / D5 | accepted-pending-Mo.
O6 evidence pack as shareable growth artefact -> BL E-3 (branding polish, post-rename) | deferred.
O7 longitudinal personalisation post-users -> original roadmap long-term list unchanged | already covered, deferred.
O8 per-interview pricing for Interviewer -> D4 hypothesis | pending Mo.
O9 compliance-as-feature -> C-3/C-4 outputs feed WG s7 trust signals | accepted, sequenced behind counsel.
O10 macOS helper cross-platform advantage -> onboarding/marketing note in C-7/D-3 briefs | accepted (no new task; noted in briefs).

## 3. Product strategy recommendations (PS)

Problem-statement redefinition (s1) | accepted-pending-Mo D2 | DEST WG s1 + ABSORPTION s4.
ICP: UK agencies 2-50 seats, in-house TA secondary (s2) | accepted-pending-Mo D2 | DEST ABSORPTION s4; CM s2.
Deprioritise generic individual-professional buyer (s2) | accepted | messaging only; base tier remains sellable (original rule intact).
Missing buyer journeys enumerated (s3) | accepted | mapped to C-7 onboarding, D-3 site, C-6 metering, C-8 support, C-3 trust; all queued.
Differentiation hierarchy (s4) | accepted as copy brief | DEST WG s3/s4.
Overbuild verdict upheld; sequencing re-ordered around first external pound (s5) | accepted | realised as the merged queue order.
MVP validation slice definition (s6) | accepted as the design-partner offer shape | maps to D-1.
V1 = interviewer-led emphasis, content unchanged (s6) | accepted-pending-Mo D2.
Cut/simplify/defer list (s7) | accepted in full: usage-only headline pricing cut (pending D4); metering simplified (C-6); onboarding simplified (C-7); bot fast-follow (D3); insights post-revenue; interviewee fresh go/no-go (A-8); customer-service/Teams/MCP/personalisation unchanged post-launch; audio retention dormant.
Strengthen list (s8) | accepted: evidence pack polish (E-3), trust surface (C-3 -> security page), unit economics (B-1), helper reliability trio (A-3/A-4/A-5), operator E2E (A-2).

## 4. Architecture/security/operations issue register (AR s2), all 15 mapped

A1 auth hardening | accepted, gate G3 | queue P0 C-1 | Blocks DP/PC/PL | TOTP replacement inside it pending D7.
A2 trust pack | accepted-pending-Mo D6, gate G6 | queue P0 C-3 | drafting unblocked now.
A3 employment-AI position | accepted-pending-Mo D6, gate G6 | queue P0 C-4 | blocks Interviewer sales specifically.
A4 monitoring/alerting | accepted, gate G5 | queue P1 B-4.
A5 staging | accepted-pending-Mo D8 | queue P1 B-3 | prerequisite for B-6/B-12 and money-touching changes.
A6 CI engine deploy | accepted, gate G5 | queue P1 B-5 | blocked on D9 token.
A7 cockpit verify/merge | accepted (active task), gate G1 | queue P0 A-1 | Blocks IB yes (head of commercial track).
A8 bot infra/scope | accepted; fast-follow pending D3 | queue P2 A-6/A-7 + B-13/B-14 | non-gating once demoted.
A9 unit economics | accepted, P0 | queue B-1; definition B-2 | blocks pricing sign-off.
A10 helper productisation | accepted, gate G2+G4 | queue A-2 (Mo), A-3/A-4 (job), A-5 (D9 secrets).
A11 passcode at rest | accepted | queue P1 B-7 | non-gating, pre-empts pen-test finding.
A12 rate-limiter fail-mode | accepted | queue P2 B-8 | hardening-window item.
A13 backup/restore drill | accepted | queue P2 B-9 | 60-day window.
A14 key revocation UI promoted + credential rotation | accepted | queue P1 C-5 and B-15 | C-5 required before non-operator devices.
A15 executor routing (Mac only for launch-critical) | accepted, standing operational rule | recorded ABSORPTION s5/s10; no task needed.
Testing gaps (AR s3): staging-only auth bypass accepted WITH TIGHTENING (compile-time excluded from prod builds + absence-proof test) = modified, queue P1 B-6; 30-min soak + 10-session load = B-12; screenshot-diff CI = B-11 post-merge.

## 5. Backlog items (BL Tracks A-E): verdict per ID

Track A: A-1 accepted P0 (active). A-2 accepted P0 (Mo). A-3/A-4 accepted P1. A-5 accepted P1 (D9). A-6 accepted P2 fast-follow (D3; also needs Worker 2 or alternate channel + live meeting). A-7 accepted P2 (after A-6, on customer pull). A-8 deferred with fresh go/no-go (Mo, later). A-9 deferred post-launch unchanged. A-10 deferred (consent framework + demand).
Track B: B-1/B-2 accepted P0. B-3 pending D8. B-4 accepted P1. B-5 accepted P1 (D9). B-6 modified-accepted P1 (tightened). B-7 accepted P1. B-8/B-9 accepted P2. B-10 accepted P1 (pre-C-6). B-11/B-12 accepted P2. B-13 accepted P2 (cost pending Mo). B-14 accepted P2. B-15 accepted P1 (Mo action).
Track C: C-1 accepted P0 gate. C-2 pending D1, gate. C-3 pending D6, gate. C-4 pending D6, gate. C-5 accepted P1 gate-adjacent. C-6 accepted P1 gate (reshaped Phase 3). C-7 accepted P1 gate (reshaped c4). C-8 accepted P1 (commitment level Mo).
Track D: D-1 pending D4/D5, P0. D-2 accepted P0 (after A-1). D-3 accepted P1 (gated C-2/C-3). D-4 pending D2/D5 (Mo runs). D-5 deferred until proof bar (3+ paying partners, 1 referenceable, >70% GM). D-6 deferred (61-90 window). D-7 deferred (soft launch). D-8 deferred (post-revenue).
Track E: E-1 deferred (all bot gates). E-2 deferred post-revenue. E-3/E-4 deferred P3. E-5 deferred (team-account demand). E-6 deferred (enterprise pipeline).

## 6. Commercialisation and monetisation (CM)

Hybrid pricing structure + GBP 29/49/79 ladder | pending Mo D4 | DEST: CM s3 verbatim + ABSORPTION s4/s7 | conflict with 30 Jun single-metric decision recorded ABSORPTION s8; billable minute survives as metering unit.
Billable-minute precise definition | accepted P0 | B-2 | referenced by future metering code.
Founding agency programme (5-10, ~50% founding price, Xero, case-study rights) | pending Mo D5 | D-1.
Sales-led first, self-serve later; Stripe only after proof bar | accepted | ABSORPTION s4 + hub c7 note.
Trial 14 days or 5 interviews, manual provisioning | accepted as design-partner policy | D-1 brief.
Support minimum (founder call, email, NBD commitment, FAQ, incident template) | accepted; level pending Mo | C-8.
Compliance/trust sales blockers (DPA, consent guidance, employment-AI, SOC 2 later) | accepted | C-3/C-4 gates; SOC 2 = D-8 deferred.
Objection bank (six objections + answers) | accepted as sales collateral input | DEST: CM s7 verbatim; folds into D-2/D-4 briefs.
Monetisation risks + assumptions to validate + proof bar | accepted | ABSORPTION s4; proof bar is the Stripe go-gate.
Pricing experiments 1-4 | accepted as the design-partner test plan | D-4 brief.

## 7. Website/positioning/GTM (WG)

Positioning statement + three rules (never "only live coach"; never candidate-side; interviewer-led) | rule 1 accepted unconditionally; statement pending D2 | DEST: WG s1 verbatim.
W1 four-page site | accepted, gated C-2/C-3 | D-3.
W2 full site structure | deferred, trigger: design-partner evidence + pricing | D-6.
Homepage message architecture + narrative sections + FAQ themes | accepted copy brief | WG s3/s4.
Pricing page approach (founding placeholder, publish post-validation, fair-use paragraph) | accepted | WG s5; D-6.
Demo/lead flow + seven assets | accepted | D-2 (P0 after cockpit merge).
Launch sequence (nothing public pre-rename; private programme; soft launch; bot announcement post-proof) | accepted as launch plan of record | WG s7.
Ten-conversations plan + success criteria (3+/10 go; 0-1 revisit) | pending D2/D5; Mo executes | D-4.
90-day GTM calendar | accepted, tracks master 30/60/90 | WG s9.
Base-coach single platform page, no acquisition spend 90 days | accepted | WG s10.
Channel research | deferred | D-7.

## 8. Launch gates and non-gates

G1-G10 as consolidated (AR s4) = accepted in full; register with per-gate status/owner/evidence: docs/launch/smc-launch-gates.md. Non-gates recorded there too (bot, insights, customer-service, audio retention go-live, interviewee).

## 9. Decisions D1-D9

All nine recorded verbatim in DM; grouped by urgency in ABSORPTION s7; every dependent queue item marked pending the relevant D. Backcue recorded as front-runner only, not defaulted (explicit in ABSORPTION s4 and s7). Bot not deleted anywhere; re-flagged only (hub b5 note, ABSORPTION s4, ROADMAP absorbed section).

## 10. Rejected / modified register

Rejected outright: none.
Modified: B-6 staging auth bypass accepted only in compile-time-excluded form with absence-proof test (reason: env-gated runtime bypass is one misconfiguration from production).
Not adopted as stated: Backcue-as-default (name remains a live Mo decision, D1).
Conflicts recorded, not overwritten (ABSORPTION s8): single-metric pricing vs hybrid (pending D4); unique-first positioning (retired); bot V1-adjacency vs fast-follow (pending D3).

## 11. Named cross-cutting items (QA checklist mapping)

Product positioning -> R1/O1/PS s1/WG s1 rows above. Interviewer wedge -> D2 rows. Live coaching features -> preserved unchanged (original roadmap; commodity per PS s4, kept, not led with). Candidate verification evidence -> flagship, reinforced (ABSORPTION s8 fourth entry). Backcue -> s9/s10 above. Bot scope -> R8/A8/D3. Insights timing -> E-2. Customer-service timing -> A-9. Passcode fix -> A11/B-7. Staging bypass hardening -> AR s3 modified row. CI deploy -> A6/B-5. Monitoring -> A4/B-4. Minimal metering -> C-6. Pricing/packaging -> s6 rows. Founding programme -> D-1/D5. Demo assets -> D-2. Trust pack -> A2/C-3. Employment-AI opinion -> A3/C-4.

No unmapped Fable recommendation remains. Any future addition goes through this matrix plus the merged queue.
