# FABLE DECISIONS FOR MOHAMMAD
Silent Meeting Copilot (SMC). Independent Fable 5 review, 6 July 2026.
Only decisions that genuinely require the operator. Everything else is dispatchable engineering.

## D1. Product name

- Decision required: pick the commercial name and commission formal trademark clearance.
- Why it matters: blocks domains, website, Stripe products, legal documents, marketing, and the brand token flip. It has the longest external clock of anything in the plan.
- Options: Backcue (clean .ai/.com in prior screening), Sotto (instinct pick, domain unavailable, needs counsel), other shortlist names, or a descriptive fallback (live.coach / cue.coach class).
- Recommended: pick the strongest clearable candidate from the existing shortlist within one week and send it to clearance; Backcue is the pragmatic front-runner on the evidence in the dossier (clean domains already screened). Do not let perfect naming delay clearance; a second-choice cleared name beats a first-choice blocked one.
- Risk if approved: mild brand regret, recoverable pre-launch.
- Risk if not approved: every public asset stalls; the 90-day plan slips week for week.
- Needed from Mohammad: the pick, and budget approval for clearance counsel.
- When: this week.

## D2. V1 wedge: interviewer-led versus base-coach-led go-to-market

- Decision required: approve leading the launch with the Interviewer offer (recruiters, interview integrity) with the base Meeting Coach as the platform tier, instead of leading with the general live coach.
- Why it matters: external research shows live coaching is now a crowded feature (Hedy, Otter, Fireflies, sales CI vendors). The cited-evidence interview capability is the only pitch with no direct equivalent, an urgent buyer, and a value-priced anchor.
- Options: interviewer-led (recommended); base-coach-led (compete with cheaper SOC 2 incumbents on their ground); dual-headline (dilutes both).
- Risk if approved: the recruiter wedge may test smaller than hoped; mitigated by the ten-conversation validation gate before heavy spend.
- Risk if not approved: launch into direct comparison with $10 to $39/month incumbents with no distribution.
- Needed from Mohammad: approval, plus confirmation UK recruitment agencies are an acceptable first market.
- When: before the design-partner offer is drafted (next two weeks).

## D3. Meeting bot: V1 or fast-follow

- Decision required: formally remove the bot from V1 scope and classify it fast-follow.
- Why it matters: live join is unproven, the workstream is gated on a wedged bridge, the infrastructure is home-LAN, and Zoom commercial distribution terms are unchecked. Meanwhile V1 (helper-based) does not need it, and helper capture is platform-agnostic where the bot is Zoom-only.
- Options: fast-follow (recommended); keep in V1 (adds an unbounded gate to launch); kill (wrong, the architecture and sunk work support a good convenience feature later).
- Risk if approved: a prospect who insists on bot delivery waits; acceptable and testable in the ten conversations.
- Risk if not approved: launch date becomes hostage to the least reliable infrastructure in the estate.
- Needed from Mohammad: the scope call. The live-join test can still be scheduled opportunistically.
- When: now; it changes what the executors work on next.

## D4. Pricing structure

- Decision required: approve the pricing hypothesis: per-seat tiers with included processed hours plus overage for the base; seat-uplift or per-interview pricing for the Interviewer add-on; drop the 3-month minimum for founding partners.
- Why it matters: pure metered minutes fights the market's per-seat norm and prices against cost instead of value. The hypothesis must exist before the ten conversations because those conversations test it.
- Options: hybrid seat-plus-usage (recommended); pure metered minutes (dossier's current lean); pure per-seat unlimited (margin risk until unit economics measured).
- Risk if approved: numbers are wrong; corrected cheaply during the founding programme.
- Risk if not approved: pricing debate continues in the abstract with no buyer contact.
- Needed from Mohammad: approval of the structure and the GBP 29/49/79 anchor ladder for testing; final numbers wait for evidence plus the unit-economics report.
- When: before the first sales conversation (30 to 45 days).

## D5. First-revenue motion: founding programme on manual invoices

- Decision required: approve selling to 5 to 10 design partners on Xero invoices at a founding price before Stripe self-serve exists.
- Why it matters: it moves first revenue and real feedback months earlier and ensures Stripe is built against validated packaging.
- Options: founding programme first (recommended); build Stripe first (adds weeks before any learning); free pilots (worse: no willingness-to-pay signal).
- Risk if approved: manual admin overhead for a handful of invoices; trivial with Xero already in the business.
- Risk if not approved: months of build with zero demand evidence, compounding the existing overbuild pattern.
- Needed from Mohammad: approval, founding discount level (50 percent of target recommended), and willingness to personally run the ten conversations.
- When: with D2.

## D6. Legal budget: trademark clearance plus employment-AI/GDPR counsel

- Decision required: approve engaging counsel for (a) name clearance, (b) the trust pack review (privacy policy, terms, DPA, sub-processors, consent guidance), and (c) a written position on the Interviewer add-on under the EU AI Act high-risk employment category and UK GDPR Article 22.
- Why it matters: (a) gates all public assets; (b) gates every sale; (c) gates the flagship feature. All three run on external clocks and none can be self-served by the project chat.
- Options: engage now (recommended); defer (every deferral week pushes launch a week); partial (do a and b, defer c: not recommended, c attaches to the revenue centrepiece).
- Risk if approved: fees for a pre-revenue product.
- Risk if not approved: launching a candidate-assessment AI into the UK/EU without a documented position is an existential product risk, and selling without a DPA is not lawful processing posture.
- Needed from Mohammad: budget ceiling and counsel selection.
- When: this week for (a); within 30 days for (b) and (c).

## D7. Replace self-implemented TOTP with a vetted library

- Decision required: approve replacement rather than "heavily test" the in-house TOTP.
- Why it matters: authentication code is the worst place for bespoke crypto-adjacent code; a vetted library is a small job that removes a permanent review liability, and it sits inside the C-1 hardening gate anyway.
- Options: replace (recommended); test-and-keep (cheaper now, recurring cost at every security review).
- Risk if approved: minor migration effort for two operator accounts.
- Risk if not approved: a standing finding in every future customer or investor security review.
- Needed from Mohammad: approval only.
- When: with the C-1 hardening job.

## D8. Minimal staging environment

- Decision required: approve the small recurring cost of a Neon branch, pinned preview env, and staging engine worker.
- Why it matters: Phase 3 metering and Phase 4 billing changes must not be first exercised on production; billing bugs are trust-fatal.
- Options: minimal staging (recommended); none (current state; acceptable only until money-touching code arrives).
- Risk if approved: small monthly cost, slight deploy-flow complexity.
- Risk if not approved: metering/billing tested live on the production database.
- Needed from Mohammad: cost approval.
- When: before Phase 3 metering work starts (30 to 45 days).

## D9. Keys and secrets provisioning

- Decision required: provide, when each is needed: three installer-signing repo secrets (now), the CI engine-deploy token (now), Brave key (optional, low priority), Stripe keys (Phase 4, post-validation).
- Why it matters: each is a hard external dependency on the operator; batching the "now" items removes two known blockers this week.
- Risk if approved: none material. Risk if not approved: signed installer and CI deploys stall.
- When: signing secrets and deploy token this week; Stripe deferred by design; Brave at Mo's discretion.
