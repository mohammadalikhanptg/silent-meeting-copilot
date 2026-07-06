# FABLE PRODUCT STRATEGY REVIEW
Silent Meeting Copilot (SMC). Independent Fable 5 review, 6 July 2026.

## 1. Core problem

Stated problem: incumbents do note-taking and post-call analysis; nobody coaches the operator live. That framing is out of date. Live coaching now exists at every price point: Hedy (prosumer real-time meeting coach), Otter (live coaching tips, real-time interview help), Fireflies Live Assist, and the entire sales conversation-intelligence category (Balto, Cresta, Salesken, Revenue.io, Cirrus Insight). Sources cited in the master report.

The real, still-open problems SMC can own:
- Interview integrity. Recruiters increasingly face candidates using AI assistance mid-interview, embellished CVs, and in extreme cases proxy candidates. No mainstream note-taker gives the interviewer live claims-to-verify prompts and a post-session cited evidence pack. Otter markets "real-time help during interviews" but as generic assistance, not verification with citations.
- Defensible assessment. Hiring decisions supported by AI need evidence trails, human-in-the-loop controls, and fairness posture. SMC's reframed cited-evidence review (Codex-reviewed, disclaimered traffic light, operator keeps the decision) is precisely the shape regulators are pushing the market toward. Competitors with breezy "score candidates" features (Fireflies AI Skills advertises candidate scoring) are more exposed than SMC here.
- Code-mixed multilingual live coaching (Hindi/Urdu). Verified working. Incumbents are English-first.

Recommendation: redefine the core problem statement from "nobody coaches live" to "interviewers cannot verify what they are being told, in the moment, and cannot defend their assessment afterwards." The base Meeting Coach remains the platform; it stops being the pitch.

## 2. Target users and buyer persona

Dossier: professionals and teams broadly, verticals recruitment then customer service. Too broad for a first launch.

Recommended V1 target: recruitment agencies and in-house talent acquisition teams, UK first (operator's market, GDPR framework already partially addressed, English plus Hindi/Urdu advantage relevant to the UK market).
- User: the recruiter/interviewer running the call.
- Buyer: agency owner/director (SMB agencies, 2 to 50 seats) or Head of TA (in-house). In SMB agencies user and buyer are often the same person, which shortens the sales cycle.
- Budget: agencies already pay per-seat for note-takers ($10 to $39/user/month range per market pricing) and per-check for background screening. Interview verification prices against the screening budget, not the note-taking budget. That is a materially better anchor.
- Urgency driver: a bad hire or a fraudulent candidate is a direct revenue and reputation event for an agency. This persona has pain with a cost attached.

The generic "individual professional" base-coach buyer should be deprioritised: that segment is where Hedy and Otter compete on price and brand, and SMC has no distribution advantage there.

## 3. User journeys

Built and near-complete: operator starts a session, captures ME plus OTHERS via helper, sees live coaching, runs an interview with claims-to-verify, downloads minutes and evidence pack, reviews in library.

Missing journeys that block a stranger from becoming a customer:
- Discover to demo: no website, no demo flow.
- Sign up to first session: no onboarding, no self-serve helper install guidance, allowlist-only auth.
- Trial to paid: no billing, no entitlements.
- Fail to recover: no support model, no status/monitoring, no in-product help.
- Trust check to approval: no privacy policy, DPA, or security page for the buyer's diligence.

Every one of these is a launch-path item; none is speculative. They are enumerated in the backlog.

## 4. Product scope, differentiation, prioritisation

Scope today spans: live coaching platform, multilingual STT, interview vertical, outputs, audio retention harness, remote-control helper, meeting bot programme, commercial shell, planned metering/billing/insights, planned customer-service vertical, planned Teams adapter, planned personalisation layer. That is three products' worth of surface for zero customers.

Differentiation that survives contact with the 2026 market:
1. Cited-evidence interview verification (strongest, unique in current form).
2. Ethics-locked coach (positioning asset against candidate-cheating tools).
3. Bot-free platform-agnostic capture (parity with Hedy's story, ahead of bot-dependent tools; works on Teams/Meet/phone which the Zoom bot does not).
4. Hindi/Urdu code-mix live STT (niche, verified).
5. Security depth (only monetisable once packaged as a trust surface).

Differentiation that does not survive: "live coaching exists," "talk-time balance," "suggested responses," "objective alignment." All are now commodity features. Keep them; do not lead with them.

Prioritisation verdict: current phase order (cockpit, metering, billing, insights) is build-centric. Re-order around the first external pound: verify cockpit (already built), close auth gates, minimal metering, design partners on manual invoices, then Stripe. Insights defers post-revenue. The dossier's own question "should metering/billing precede cockpit polish" has a third answer: cockpit is done pending verification, so verify it, but Stripe self-serve should come after design-partner validation, not before.

## 5. Maturity, roadmap coherence, over/underbuilding

Maturity: deep v1 internally; pre-alpha commercially. The gap is the defining feature of the project.

Overbuilding risk: HIGH and realised. Evidence: audio retention plus benchmark harness (dormant), marathon 90-minute verification, Sarvam code-mix path, a self-hosted C++ Zoom bot programme with a dedicated Linux host, all built before any user or price existed. Each is individually defensible; collectively they are a year of supply-side work against zero demand-side signal. The bot is the largest ongoing overbuild: self-hosted was chosen over Recall.ai for unit cost at scale, but there is no scale, and the build cost is being paid in the scarcest currency (operator attention and infra reliability). The dossier itself flags this for challenge; the challenge is upheld.

Underbuilding risk: also HIGH, on the commercial side. Everything a buyer touches before the product (site, pricing, onboarding, trust pack, support) is absent.

Roadmap coherence: internally consistent and well-reconciled across tracks, credit where due. Incoherent only in sequencing: it reaches Insights (Phase 5) before it reaches "a stranger can pay."

## 6. MVP, V1, and commercial product definitions

MVP (should have been, and can still be run as a validation slice): helper capture, live interviewer coaching, cited evidence pack, manual onboarding by the operator, manual invoice. Nothing else. This is buildable from today's codebase with near-zero new code; it is a packaging exercise plus the auth hardening gate.

V1 (recommended, replaces "base Meeting Coach + Interviewer add-on" as the emphasis, not the content):
- Interviewer offer headline: live interview coaching plus candidate verification with cited evidence, via desktop helper, Zoom/Teams/Meet/phone agnostic.
- Base Meeting Coach included as the platform tier beneath it (keeps the dossier's "base must be sellable standalone" rule intact; it is sellable, it is just not the lead).
- Minimal metering (minutes plus interview counts), entitlements, renamed brand, trust pack, website, onboarding.
- Explicitly out: bot, insights, customer-service vertical, interviewee coach, Teams bot adapter, personalisation layer, audio retention go-live.

Commercial product (post-V1 destination): the platform story the dossier already holds (base plus stackable add-ons, usage-aware pricing, insights, bot convenience, enterprise controls). The destination is sound; only the on-ramp changes.

## 7. Cut, simplify, defer

Cut (from V1 scope, not from the codebase):
- Pure usage-only pricing as the sole model (see commercialisation review; hybrid recommended).
- "Unique-first live coach" messaging.

Simplify:
- Metering Phase 3 to admin-visible minutes and interview counts; no rating engine, no proration logic until Stripe phase.
- Onboarding to a guided first-run checklist plus a 10-minute founder call for design partners.

Defer:
- Zoom bot to fast-follow (prove live join opportunistically; per-participant capture only after a customer asks for bot delivery).
- Insights (Phase 5) post-revenue.
- Interviewee coach vertical until the ethics refusal behaviour is built and legal review of the whole interview surface is done; note the market for candidate-side tools is crowded and reputationally risky (Cluely-style association), so this vertical deserves a fresh go/no-go later, not automatic inheritance from the old roadmap.
- Customer-service vertical, Teams bot adapter, MCP orchestration, personalisation layer: unchanged, post-launch.
- Audio retention go-live: keep dormant until a customer need plus consent framework justify the flag flip.

## 8. Strengthen

- Interview evidence pack: make it the branded, shareable artefact (post-rename), export polish, agency logo option later. It is the growth loop.
- Trust surface: turn the existing security engineering into a public security page and a completable vendor questionnaire. This converts sunk engineering cost into sales collateral.
- Unit economics instrumentation on the coach path (Opus cost per billable minute) so pricing is grounded.
- Helper reliability items that a stranger will hit in week one: pairing-key persistence bug, saved-session language/engine bug, signed installer. These three quietly become launch-critical the moment a non-operator installs the helper.
- Windows real-audio end-to-end operator pass: it is the project's own oldest open acceptance criterion and V1 depends entirely on the helper.
