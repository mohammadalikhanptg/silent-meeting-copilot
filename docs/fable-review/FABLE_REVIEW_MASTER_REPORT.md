# FABLE REVIEW MASTER REPORT
Silent Meeting Copilot (SMC), Pacific Technology Group
Independent review by Claude Fable 5, 6 July 2026
Source: PROJECT_DOSSIER_FOR_FABLE_REVIEW-_SMC.md plus targeted external market research (cited where used). No code inspected, no code changed.

## 1. Executive summary

SMC is a technically deep, security-conscious, single-operator product with genuinely strong engineering foundations and zero commercial validation. The build quality for this stage is unusually high: fail-closed session control, IDOR regression as a CI gate, replay ledgers, prompt-injection isolation, retention with hard delete. Very few pre-revenue products have this posture. That is the good news, and it is real.

The uncomfortable news is threefold.

First, the dossier's central positioning claim, that SMC is a "unique-first category" of live private coaching, is no longer true. External research confirms the real-time coaching category is now crowded and converging: Hedy is a direct consumer/prosumer real-time meeting coach with SOC 2 Type I and GDPR DPAs already in place; Otter now markets live coaching tips and "real-time help during interviews"; Fireflies ships Live Assist with real-time suggestions and coaching; and on the sales side, Balto, Cresta, Salesken, Revenue.io and Cirrus Insight have made live in-call coaching table stakes, with sub-400ms latency described as an enterprise expectation in 2026. Sources: hedy.ai, otter.ai, fireflies.ai, revenue.io/blog/best-ai-sales-coaching-platforms, thequantumleap.business (AI call coaching 2026 briefing). SMC cannot launch on "nobody else does live coaching." It can launch on a sharper wedge (section 8).

Second, the project shows classic overbuilding-before-validation risk. Roughly a year of engineering depth (multilingual STT, marathon rolling summaries, audio retention harness, a self-hosted Zoom bot programme, an interview evidence engine) has been built without a single external user, a price point, a name, or a landing page. The engineering is not wasted, but the sequencing is inverted relative to commercial risk: the biggest unknowns are demand-side, and none of the current workstreams reduce them.

Third, the Interviewer add-on, which is the most differentiated and most sellable asset, is also the most legally exposed. AI systems used to evaluate candidates in recruitment sit in the EU AI Act's high-risk category (Annex III, employment), and similar automated-employment-decision rules exist elsewhere (for example NYC Local Law 144 style AEDT regimes). The dossier records UK GDPR Article 22 awareness, which is good, but there is no documented legal position, no DPA, no processor posture, and no consent evidence framework for external customers. This is the single most important compliance gap and it attaches to the flagship feature. External legal counsel is required before the Interviewer add-on is sold; this is marked "external research required" for jurisdiction-specific detail.

Net assessment: the product should continue, but with a narrowed V1, a re-sequenced commercial plan built around a design-partner motion rather than self-serve Stripe, the bot demoted to fast-follow, and an immediate legal workstream on naming and the interview vertical.

## 2. Current project assessment

What is genuinely strong:
- Security engineering discipline far above stage norms, with independent Codex cross-review as a habit.
- A working end-to-end live coaching pipeline with verified 90-minute marathon behaviour.
- A recruiter-side interview verification engine with cited evidence packs. This is the sharpest asset in the project and the closest thing to a real moat.
- Hindi/Urdu code-mix STT (Sarvam) verified on a real call. A defensible niche capability almost no competitor markets.
- Source-agnostic engine input (helper now, bot later) is the correct architecture decision and de-risks the bot question.
- Honest internal record-keeping. The dossier's own UNKNOWN discipline is rare and valuable.

What is genuinely weak:
- No customers, no pricing, no name, no website, no billing, no onboarding, no support model. Commercial layer is 0 percent.
- Positioning rests on a falsified uniqueness claim.
- The delivery machinery (Windows worker defects, wedged Worker 2 bridge, home-LAN Linux VM with ARP-pinned IP, engine deploys only from one Mac) is a single-operator dependency chain sitting in the commercial critical path if the bot ships in V1.
- No staging environment confirmed; DB migrations run at build time against production.
- No product monitoring or alerting confirmed beyond platform defaults.
- Phase 1's own definition of done (real-audio Windows helper end-to-end) is still not closed by the operator.

## 3. Scores

All scores are for readiness to serve paying external customers, not internal operator use. Internal-use maturity would score 15 to 20 points higher on the technical axes.

Overall product health: 58/100.
Justification: engineering execution alone would score in the 80s. The score is dragged down because product health includes demand evidence (none), positioning validity (core claim falsified), and the gap between what is built and what a first customer needs (billing, onboarding, trust surface, name). A product this deep with zero external contact is unhealthy in a specific, fixable way.

Commercial readiness: 22/100.
Justification: pricing undefined in numbers, no billing or entitlements, no metering, no website, no demo flow, no support model, no onboarding, unresolved trademark-blocked name. The 22 points reflect that the commercial model is at least thought through (base plus add-ons, usage metric chosen, V1 scope locked) and the product itself is demonstrable today. Everything between "demonstrable" and "purchasable" is missing.

Technical readiness: 66/100.
Justification: core pipeline built, deployed and partially verified; strong test gates on security regressions; idempotent migrations; sensible DO-based control plane. Deductions: no staging, manual single-machine engine deploys, no monitoring/alerting, cockpit Phase 2 built but unverified, two known helper persistence bugs, unsigned installer, bot live-join unproven, unquantified LLM unit economics, Phase 1 acceptance test still open.

Security/privacy readiness: 52/100 for external users (internal posture would be roughly 80).
Justification: the baseline is excellent, but the project's own gate list is honest and open: session revocation not effective at the edge, no lockout/rate-limit on verify and TOTP endpoints, TOTP secret unencrypted at rest, self-implemented TOTP, no auth-event alerting, no per-device key revocation UI, no DPA or processor posture, no sub-processor list, no external privacy policy or terms, no legal position on the interview vertical. The score credits the closed criticals and the retention/consent architecture; it penalises the fact that every remaining item is exactly what a paying customer's security review will ask for.

Launch readiness: 28/100.
Justification: the product could be demoed to a design partner tomorrow, which is worth real points. It could not take money, could not be named publicly, could not survive a basic vendor security questionnaire, and could not answer "who is your DPA with." Launch gates in section 7 define the path from 28 to launchable.

## 4. Top ten risks

1. Positioning failure. "Unique-first live coach" is contradicted by Hedy, Otter live coaching, Fireflies Live Assist and the sales CI category. Launching on that message invites immediate, unfavourable comparison with cheaper, SOC 2 certified incumbents. Severity: critical to the commercial plan.
2. Interview vertical regulatory exposure. AI candidate evaluation is high-risk under the EU AI Act and regulated as automated employment decision tooling in several jurisdictions. Unassessed. Attaches to the flagship feature. External legal review required.
3. Demand risk. Zero evidence anyone will pay. Every week of further platform build compounds this.
4. Naming gate. No name, trademark clearance not started, and the name blocks the website, the domain, the Stripe products, the legal entity of the offer, and all marketing assets. Longest lead-time item on the critical path.
5. Single-operator infrastructure in the commercial path. Bot runs on a home-LAN VM behind an ARP pin; engine deploys only from one Mac with a fragile token convention; orchestration workers are unreliable. Any of Mo's machines failing stalls the product.
6. Auth hardening backlog open. Known, documented, and correctly gated, but it blocks every external invite, including design partners, so it now blocks commercial learning too.
7. Unit economics unquantified. Coaching runs on Opus per live minute. If model cost per billable minute is not measured against the intended price per minute, the pricing model may be structurally loss-making. No cost instrumentation is mentioned for the coach path.
8. Bot programme absorbing critical-path attention. Live join unproven, per-participant capture design-heavy, Zoom commercial distribution requirements UNKNOWN, and the whole workstream is gated on a wedged Windows bridge. Meanwhile V1 scope does not need it.
9. No monitoring/alerting. A paying customer's session dying silently mid-interview is a churn event and possibly a refund event; today nobody would be paged.
10. Compliance/trust surface absent. No privacy policy, terms, DPA, sub-processor list, or consent guidance for recording across jurisdictions. Blocks any credible sale to a recruitment agency, which will ask on day one.

## 5. Top ten opportunities

1. Reposition around recruiter-side live candidate verification. Candidate fraud and AI-assisted interview cheating are rising, well-publicised problems; tools like interview copilots for candidates have made recruiters actively anxious. SMC's cited evidence pack is the counter-tool. This has urgency, a budget holder, and a clean one-line pitch. External research required to size it, but the wedge logic is strong.
2. "The honest one" positioning. SMC's locked ethics boundary (coach, never an answer engine) is a marketable stance against candidate-cheating tools, and it doubles as a compliance asset.
3. Bot-free, private-by-design capture. Hedy markets "no bot joining your calls" as a feature. SMC's helper architecture supports the same privacy-forward story, and it is platform-agnostic (works for Teams, Meet, phone) which the Zoom-only bot is not.
4. Hindi/Urdu code-mix as a niche moat. UK and India recruitment markets with South Asian language mixing are underserved by English-first incumbents.
5. Design-partner revenue before Stripe. Five to ten recruitment agencies on manual invoices (Xero already exists in the business) can generate revenue and case studies months before self-serve billing is built.
6. Interview evidence pack as the shareable artefact. Every assessment pack sent to a hiring manager is organic distribution. Brand it (post-rename) and it becomes the growth loop.
7. Longitudinal personalisation roadmap remains defensible, but only once there are users generating longitudinal data. Correctly sequenced, it is a retention moat later.
8. Per-interview pricing for the Interviewer add-on. Recruiters think in placements and interviews, not minutes. A per-interview or per-seat-plus-interviews model prices against value, not cost.
9. Compliance-as-feature. If the EU AI Act / Article 22 work is done properly, "audit-ready interview assessments with cited evidence and human-in-the-loop controls" becomes a differentiator no lightweight competitor can copy quickly.
10. macOS helper already builds via CI. Recruiters on Macs are a large share of agencies; cross-platform day one is a quiet advantage over Windows-first assumptions.

## 6. Critical decisions needed from Mohammad

Full detail in FABLE_DECISIONS_FOR_MOHAMMAD.md. Headlines:
1. Product name, with formal trademark clearance. Longest lead item; start now.
2. V1 wedge: interviewer-led go-to-market (recommended) versus base-coach-led.
3. Bot in V1 or fast-follow (recommended: fast-follow).
4. Pricing structure: per-seat tiers with included minutes plus per-interview add-on pricing (recommended) versus pure metered minutes.
5. First-revenue motion: design partners on manual invoices (recommended) versus building full Stripe self-serve first.
6. Legal budget approval: trademark clearance plus employment-AI/GDPR counsel for the Interviewer add-on.
7. Whether to replace the self-implemented TOTP with a vetted library (recommended: replace).
8. Staging environment investment (recommended: yes, minimal).
9. Key provisioning: Stripe, Brave, installer signing secrets.

## 7. Recommended strategic direction

Continue the project. Do not restart, do not pivot the architecture. Change the sequencing and the story.

1. Narrow V1 to an interviewer-led offer: live interview coaching plus cited candidate verification for recruiters, delivered via the desktop helper (platform-agnostic), with the base Meeting Coach positioned as the platform underneath rather than the headline.
2. Demote the Zoom bot to fast-follow. V1 does not hard-depend on it (the dossier already concedes this), the live join is unproven, and its infrastructure is the least commercial-grade part of the system. Prove the live join opportunistically; do not let it gate anything.
3. Replace "unique live coach" messaging with "interview integrity and live interviewer coaching, with evidence you can defend." Lead with the problem incumbents created (candidates using AI to cheat) rather than the feature incumbents copied (live tips).
4. Run a design-partner motion: close the auth hardening backlog, then invite 5 to 10 recruiters, manually onboarded, invoiced through Xero, at a provisional price. Learn, then build Stripe self-serve against real objections.
5. Open the legal workstream immediately: name clearance and an employment-AI compliance opinion. Both are external-clock items.
6. Fix the three operational credibility gaps before the first paying user: monitoring/alerting, CI-based engine deploy, minimal staging.

## 8. 30/60/90 day priorities

Days 0 to 30 (verify, gate, and start the external clocks):
- Verify and merge commercial Phase 2 cockpit against deployed CSS; operator interactive pass.
- Close the operator's own Phase 1 acceptance test: real-audio Windows helper end-to-end.
- Close the auth multi-user hardening backlog, cross-reviewed (edge revocation, lockout, allowlist re-check, TOTP at rest, vetted TOTP, auth alerting).
- Start trademark/name clearance and the employment-AI legal opinion (external clocks; everything else can proceed in parallel).
- Instrument coach-path unit economics: model cost per billable minute, logged per session.
- Stand up minimal monitoring/alerting (session failure, engine error rate, helper disconnect storms) and a CI engine deploy path.
- Draft the trust pack skeleton: privacy policy, terms, DPA template, sub-processor list, recording-consent guidance. External counsel review in the 60-day window.

Days 31 to 60 (first external humans):
- Ship minimal onboarding/first-run for a stranger (helper install, pairing, first session, one interview).
- Build metering (Phase 3) scoped to what design partners need: per-session minutes and per-interview counts, visible to the admin. Entitlement flags minimal.
- Recruit and onboard 3 to 5 design partners (recruitment agencies, UK first), manually invoiced, provisional pricing. Weekly feedback loop.
- Decide the name (gate: clearance back), flip the brand token, register domains, stand up a one-page site with a demo-request flow (see GTM plan).
- Zoom bot live join test opportunistically if Worker 2 unblocks; strictly non-gating.

Days 61 to 90 (make it purchasable):
- Convert design-partner learning into final V1 pricing and packaging.
- Build Stripe billing plus Interviewer add-on gating (Phase 4) against the validated packaging, not before it.
- Publish the full website per the GTM plan, with the trust/security page backed by the now-reviewed trust pack.
- First case study from a design partner; begin the first-10-sales-conversations plan.
- Re-assess the bot: if live join proved and per-participant capture scoped, schedule as the first post-launch enhancement; otherwise keep parked.

Insights (Phase 5) moves post-revenue in all scenarios.

## 9. External sources used

- hedy.ai (product, security posture, bot-free positioning), accessed 6 July 2026.
- otter.ai (live coaching tips, real-time interview help), accessed 6 July 2026.
- fireflies.ai and fireflies.ai/pricing plus third-party pricing analyses (sonix.ai, claap.io, get-alfred.ai): Free / $10 / $19 / $39 per user per month annual tiers, accessed 6 July 2026.
- revenue.io/blog/best-ai-sales-coaching-platforms and thequantumleap.business AI call coaching 2026 briefing (real-time coaching as converging table stakes; latency norms), accessed 6 July 2026.
- Otter entry pricing circa $8.33 to $16.99 per user per month per third-party comparisons (affine.pro, outdoo.ai), accessed 6 July 2026.

Items marked "external research required": EU AI Act Annex III applicability opinion for the Interviewer add-on; jurisdiction-by-jurisdiction recording-consent matrix; recruitment-market sizing for interview-integrity tooling; Zoom Meeting SDK commercial distribution/app review requirements for customer-account bots.
