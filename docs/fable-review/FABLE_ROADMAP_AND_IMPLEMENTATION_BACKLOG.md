# FABLE ROADMAP AND IMPLEMENTATION BACKLOG
Silent Meeting Copilot (SMC). Independent Fable 5 review, 6 July 2026.
Import target: the original project chat. Task fields: Priority | Task | Source | Why | Dependencies | Risk | Effort | Acceptance | Opus 4.8 later | Mo decision.
Priorities: P0 (launch critical path), P1 (launch window), P2 (post-launch/fast-follow), P3 (later).
Effort: S (under a day), M (1 to 3 days), L (a week-scale executor job), XL (multi-week programme).

## Track A: Preserve original product roadmap

A-1 | P0 | Verify and merge commercial Phase 2 cockpit (Live Focus) against live compiled CSS, operator interactive pass | original roadmap | head of Track C, everything stacks behind it | deployed CSS check, operator availability | medium (hero regression) | S-M | Live Focus renders live, controls preserved, merged, READY | No (needs operator pass) | No
A-2 | P0 | Close Phase 1 acceptance: real-audio Windows helper end-to-end operator test | original roadmap | oldest open definition-of-done; V1 rides on the helper | helper build, operator hardware | medium | S (operator time) | E2E session with real audio recorded as passed | No | No (operator action)
A-3 | P1 | Fix helper pairing-key persistence bug | original roadmap | stranger-facing reliability; churn risk week one | helper rebuild | medium | M | key survives restart, auto-connect resumes | Yes | No
A-4 | P1 | Fix saved-session language/engine persistence bug | original roadmap | same as A-3 | none | medium | S-M | reopened session keeps chosen language/engine | Yes | No
A-5 | P1 | Signed installer first build | original roadmap | SmartScreen kills stranger installs | Mo adds three repo secrets | low | S | signed .exe, no SmartScreen block | No (secrets) | Yes (provide secrets)
A-6 | P2 | Zoom bot: BOT_QUEUE_SECRET to VM, compile join_bot v2, install poller, live join test | original roadmap | proves the fast-follow; explicitly non-gating for V1 | Worker 2 bridge or alternate channel, live meeting | medium | M | bot joins, waiting room handled, muted, named, 204 handled | Partially (needs live meeting) | Yes (schedule meeting)
A-7 | P2 | Per-participant capture and adapter integration | original roadmap | bot value proposition | A-6 proven | high (design-heavy) | XL | per-speaker labelled segments reach the coach | Yes | No
A-8 | P3 | Interviewee coach vertical with built refusal behaviour | original roadmap | deferred; requires fresh go/no-go given crowded candidate-tool market and ethics/reputation risk | legal review, ethics implementation | high | XL | refusal behaviour demonstrably blocks answer-feeding | Yes | Yes (go/no-go)
A-9 | P3 | Customer-service vertical, Teams bot adapter, MCP orchestration, personalisation layer | original roadmap | preserved destination, post-launch | revenue, team capacity | n/a | XL | per existing roadmap | Yes | Yes (sequencing)
A-10 | P3 | Audio retention go-live (flag flip) | original roadmap | keep dormant until customer need plus consent framework | consent framework, customer demand | medium | S (flip) + M (consent UX) | consent captured, purge honoured, benchmark run | Yes | Yes

## Track B: Fable-driven improvements

B-1 | P0 | Instrument coach-path unit economics: model, tokens, cost per session, cost per billable minute | Fable review | pricing cannot be signed off blind; risk of negative margin | none | low | M | weekly report of cost per billable minute by session type | Yes | No
B-2 | P0 | Define "billable processed minute" precisely (processed vs connected vs silence-gated) and document it | Fable review | metering disputes and invoice ambiguity kill trust | B-1 helpful | low | S | one-page definition committed to docs, referenced by metering code | Yes | No
B-3 | P1 | Minimal staging: Neon branch DB, pinned Vercel preview env, staging engine worker env | Fable review | billing/metering changes must not be tested on production | small cost approval | low | M | metering change exercised end-to-end on staging | Yes | Yes (cost)
B-4 | P1 | Minimal monitoring/alerting: engine error rate, session-death heuristic, helper disconnect storms, app route errors, alerts via Pacific notification stack | Fable review | silent mid-interview failure is the worst customer moment | none | low | M | induced failures alert within 5 minutes; runbook entries exist | Yes | No
B-5 | P1 | CI engine deploy (finish PR #4) with dry-run gate and tested rollback | Fable review | bus-factor-one deploy path off the critical path | Mo provisions scoped token | low | M | merge deploys engine via CI; rollback drill passed | No (token) | Yes (token)
B-6 | P1 | Staging-only auth bypass for headless E2E tests (env-gated, never in production) | Fable review | unblocks authenticated E2E coverage without weakening prod | B-3 | medium (must be airtight) | M | E2E suite runs headless on staging; bypass provably absent in prod build | Yes | No
B-7 | P1 | Encrypt bot_requests passcode at rest or null on terminal state | Fable review | cheap fix to a certain pen-test finding | none | low | S | passcode unreadable at rest; bot flow unaffected | Yes | No
B-8 | P2 | Rate limiter fail-mode review: fail-closed/degraded for anonymous paths | Fable review | limiter is the thing attacked during an attack | none | low | S-M | documented fail-mode per endpoint class | Yes | No
B-9 | P2 | Neon PITR restore drill plus backup/restore runbook | Fable review | untested backups are assumptions | B-3 helpful | low | S-M | restore to branch demonstrated; runbook committed | Yes | No
B-10 | P2 | Confirm and commit actual Postgres schema to docs (dossier UNKNOWN) | Fable review | metering/billing must not be built on inferred schema | none | low | S | schema doc matches live DB, referenced by Phase 3 spec | Yes | No
B-11 | P2 | Cockpit screenshot-diff step in CI for visual regression | Fable review | codifies the standing compiled-CSS rule | A-1 merged | low | M | CI fails on unexpected cockpit visual change | Yes | No
B-12 | P2 | 10-concurrent-session load sanity test and 30-minute coach soak on staging | Fable review | validates DO and rate-limit behaviour before partners | B-3 | low | M | both runs green, findings ticketed | Yes | No
B-13 | P2 | Bot rehost plan: move off home-LAN VM to rentable host with its own deploy path before any commercial bot use | Fable review | home-LAN ARP-pinned infra cannot serve paying users | A-6 proven | medium | L | bot runs from non-home infrastructure with documented deploy | Yes | Yes (cost)
B-14 | P2 | Zoom commercial distribution requirements research (SDK app review, marketplace terms for customer-account bots) | Fable review | unknown external gate on the bot programme | none | low | S (research) | written position in docs | Yes | No
B-15 | P1 | Rotate git-embedded GitHub credential | Fable review (from audit register) | hygiene, already tracked | none | low | S | remote uses SSH/credential helper | No | No (operator action)

## Track C: Launch gates

C-1 | P0 | Auth multi-user hardening backlog: edge-effective revocation, lockout/rate-limit on verify and TOTP, allowlist re-check every phase, TOTP secret encryption at rest, vetted TOTP library, auth-event alerting; Codex cross-review | launch gate | gates every external invite including design partners | none | high | L | acceptance per issue A1 in the architecture review | Yes | Yes (approve TOTP library replacement)
C-2 | P0 | Product rename: Mo picks, formal trademark clearance, domains registered, brand token flipped | launch gate | blocks all public assets; longest external clock | trademark counsel | high | S (flip) + external clock | cleared name live in product and domains | No | Yes (the decision)
C-3 | P0 | Trust pack: privacy policy, terms, DPA template, sub-processor list, retention statement, recording-consent guidance; external counsel review | launch gate | first question of every buyer; processor obligations are legal fact once a customer signs | counsel engaged | high | M (drafting) + external clock | counsel-reviewed pack on file; security page derived from it | Drafting yes, review no | Yes (counsel budget)
C-4 | P0 | Employment-AI legal position for the Interviewer add-on (EU AI Act class, Article 22 posture, candidate transparency text) | launch gate | flagship feature is the regulated feature | counsel engaged | high | S (brief) + external clock | written opinion; required product changes ticketed | No | Yes (counsel budget)
C-5 | P1 | Per-device helper key revocation UI | launch gate (promoted from deferred) | required the moment non-operator devices exist | C-1 | medium | M | device key revocable from admin UI, takes effect at engine | Yes | No
C-6 | P1 | Minimal metering visible to admin: per-session processed minutes and per-interview counts, minimal entitlement flags | launch gate (reshaped Phase 3) | design partners must see usage; invoices reference it | B-2, B-10, A-1 | medium | L | admin usage view matches logged sessions; entitlement flag gates Interviewer | Yes | No
C-7 | P1 | Onboarding/first-run for a stranger: install guide, pairing walkthrough, first-session checklist, consent flow surfaced | launch gate (reshaped c4) | strangers cannot self-start today | A-3, A-4, A-5 | medium | M-L | a non-operator completes first session with only the guide and one call | Yes | No
C-8 | P1 | Support minimum: support email, response commitment, FAQ, incident note template | launch gate | undefined support kills agency trust | none | low | S | published on site; used by first partner | Yes | Yes (commitment level)

## Track D: Commercialisation and website work

D-1 | P0 | Design-partner offer: founding programme one-pager, provisional pricing hypothesis, Xero invoicing path | commercialisation | first revenue without waiting for Stripe | C-1 through C-4 for invites | medium | S-M | terms sheet exists; first invoice issued via Xero | Drafting yes | Yes (pricing hypothesis, offer terms)
D-2 | P0 | Demo assets: canned staged interview script plus reference CV, sanitised sample evidence pack, 3-minute screen-capture video | commercialisation | the demo is the pitch | product stable (A-1) | low | M | one rehearsed 15-minute demo delivered end to end | Yes | No
D-3 | P1 | W1 web presence: landing page, security page, privacy, terms, demo-request form with qualifying fields | website | opens the pipeline; four pages only | C-2, C-3 | low | M-L | pages live on cleared domain; first demo request received | Yes | No
D-4 | P1 | Ten sales conversations: outreach list of 30 UK agencies, script, objection log, pricing-anchor ladder test | GTM | validates wedge and pricing before Stripe is built | D-1, D-2, D-3 | medium | M (ongoing) | 10 conversations logged; go/no-go signal per GTM plan section 8 | No | Yes (Mo runs them)
D-5 | P2 | Stripe billing plus Interviewer add-on gating plus trial logic (reshaped Phase 4), built against validated packaging | commercialisation | self-serve monetisation after evidence, not before | D-4 evidence, C-6, Mo Stripe keys | medium | XL | plan purchase, trial, add-on unlock, invoice parity with metering | Yes | Yes (keys, final pricing)
D-6 | P2 | W2 full website plus published pricing plus first case study | website | public soft launch surface | D-4, D-5, first partner reference | low | L | site live per GTM plan structure | Yes | Yes (case-study approval)
D-7 | P2 | Recruitment-industry channel research (directories, communities, press) and listing plan | GTM | distribution beyond network; external research required | D-6 | low | S-M | channel list with effort/impact ranking | Yes | No
D-8 | P3 | SOC 2 readiness assessment (post-revenue) | commercialisation | competitor parity signal (Hedy has Type I); not an SMB blocker | revenue | low | XL | readiness gap list; go/no-go on audit | Partially | Yes (budget)

## Track E: Post-launch enhancements

E-1 | P2 | Bot as customer-facing convenience ("we can join for you") after A-6/A-7/B-13/B-14 | Fable review + original roadmap | converts the bot programme into a marketable feature | all bot gates | medium | L | customer schedules bot from session prep; capture feeds coach | Yes | No
E-2 | P2 | Insights (Phase 5) scoped to retention drivers proven by partner feedback | original roadmap | retention driver, post-revenue | paying users, saved sessions | low | XL | per existing Phase 5 acceptance | Yes | Yes (scope)
E-3 | P3 | Evidence pack branding polish: agency logo, export theming | Fable review | growth loop strengthening | C-2 | low | M | branded pack shipped to a partner | Yes | No
E-4 | P3 | Hindi/Urdu code-mix as a marketed capability page and targeted outreach | Fable review | niche moat activation | D-6 | low | S-M | capability page live; two targeted conversations | Yes | No
E-5 | P3 | DO-per-user scale review (hot users, team accounts, multi-session semantics) | original decision log (Codex "revisit at scale") | pre-team-accounts architecture check | team-account demand | medium | M | written review with go/no-go on redesign | Yes | No
E-6 | P3 | Enterprise controls (SSO, custom retention, procurement pack) | original roadmap deferred list | unchanged, demand-driven | enterprise pipeline | n/a | XL | per future spec | Yes | Yes

## Sequencing note for the original chat

The critical path is: A-1 and A-2 in parallel with C-1; C-2/C-3/C-4 started immediately because their clocks are external; then A-3/A-4/A-5, B-4, B-5, C-5, C-6, C-7, D-1, D-2; D-3 lands when C-2 clears; D-4 begins the moment two partners can be onboarded safely. Everything in Track E and the bot line (A-6 onward) is deliberately off the critical path and must not pull executor capacity from it. Route launch-critical executor jobs to the Mac executor only, per the current reliability picture.
