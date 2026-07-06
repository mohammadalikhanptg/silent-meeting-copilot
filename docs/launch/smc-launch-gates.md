# SMC Launch-Gate Register

The single authoritative gate list for taking Silent Meeting Copilot (name pending D1) to external users. Adopted 6 July 2026 from the absorbed Fable 5 review (docs/fable-review/FABLE_ARCHITECTURE_SECURITY_OPERATIONS_REVIEW.md section 4) and the absorption verdicts (docs/FABLE_ABSORPTION.md). Blocks columns: IB internal build, DP design-partner invite, PC paid customer, PL public launch.

## The ten launch gates (in order)

G1 Cockpit Phase 2 verified and merged. Status: in progress (built on review branch, unverified). Owner: chat + Mo (interactive pass; magic-link + TOTP needs the operator). Evidence: Live Focus renders on the live URL, all controls preserved, no behavioural regression, merged, deploy READY. Blocks: IB yes (head of commercial track), DP yes, PC yes, PL yes. Next: verify branch, merge on pass, deployed-CSS check, Mo pass.

G2 Operator real-audio Windows helper end-to-end. Status: pending (oldest open Phase 1 acceptance). Owner: Mo (hardware). Evidence: real-audio session recorded as passed. Blocks: DP yes, PC yes, PL yes. Next: Mo runs it once G1 lands.

G3 Auth multi-user hardening closed and cross-reviewed. Status: pending dispatch. Owner: chat (Mac executor) + Codex cross-review; D7 approval folds TOTP replacement in. Evidence: edge revocation within 60s of logout; 5-failure lockout with backoff on verify/TOTP; allowlist re-checked at every phase; TOTP secrets encrypted at rest; vetted TOTP library; auth-anomaly alert fires in test; IDOR suite green. Blocks: DP yes, PC yes, PL yes. Next: dispatch C-1 immediately after G1.

G4 Helper productisation. Status: pending. Owner: chat (two persistence bugs) + Mo (three signing secrets, D9). Evidence: signed installer with no SmartScreen block; pairing key survives restart; reopened session keeps language and engine. Blocks: DP yes (strangers install the helper), PC yes, PL yes. Next: one helper job for both bugs; Mo adds secrets.

G5 Monitoring/alerting plus CI engine deploy. Status: pending. Owner: chat; Mo provisions the deploy token (D9). Evidence: induced engine failure and induced helper drop each alert within 5 minutes with runbook entries; merge to main deploys the engine via CI; rollback drill passed once. Blocks: PC yes, PL yes (DP tolerable briefly, not recommended). Next: dispatch B-4; finish PR #4 on token.

G6 Trust pack with counsel review plus employment-AI position. Status: pending Mo D6. Owner: Mo (counsel) + chat (drafting). Evidence: counsel-reviewed privacy policy, terms, DPA template, sub-processor list, retention statement, recording-consent guidance; written employment-AI/Article 22 position for the Interviewer add-on with any required product changes ticketed. Blocks: DP practical (agencies will ask), PC yes, PL yes; the employment-AI position specifically gates selling the Interviewer add-on. Next: drafting starts now; counsel on D6 approval.

G7 Name cleared and flipped. Status: pending Mo D1. Owner: Mo (pick + clearance budget) + chat (brand token flip, domains). Evidence: trademark clearance on file; brand token flipped; domains live. Blocks: PL yes and all public assets; DP tolerable under the working name in private. Next: D1 this week; clearance is the longest external clock.

G8 Minimal metering and entitlements. Status: pending (reshaped Phase 3). Owner: chat. Evidence: admin-visible per-session processed minutes and per-interview counts matching logged sessions; entitlement flag gates the Interviewer add-on; built on the confirmed schema (B-10) and the billable-minute definition (B-2). Blocks: PC yes (invoices reference it), PL yes; DP no for the first feedback weeks. Next: after G1 and B-2/B-10.

G9 Stranger-capable onboarding. Status: pending (reshaped c4). Owner: chat. Evidence: a non-operator completes install, pairing, consent and a first session using only the guide plus one founder call. Blocks: DP yes, PC yes, PL yes. Next: after G4.

G10 Payment path. Status: satisfied for design partners by manual Xero invoicing once D5 approves; Stripe required only for public self-serve (deferred until the proof bar: 3+ paying partners, one referenceable, gross margin above 70 percent at target price). Blocks: PL yes (self-serve), PC no (manual invoicing suffices). Next: D4/D5 answers, founding terms sheet.

## Supporting controls inside the launch window (not top-level gates, tracked to closure)

Unit-economics instrumentation (B-1) and the precise billable-minute definition (B-2): block pricing sign-off; P0. Passcode-at-rest fix (B-7). Staging environment (B-3, pending D8) and the staging-only auth bypass in its tightened form: compile-time excluded from production builds with an absence-proof test (B-6). Schema documentation before metering (B-10). Backup/restore drill and runbook (B-9). Load sanity and 30-minute coach soak on staging (B-12). Cockpit screenshot-diff CI after G1 (B-11). Per-device helper key revocation UI before any non-operator device (C-5). Rate-limiter fail-mode review (B-8). Git credential rotation (B-15, Mo). Support minimum published (C-8). Demo assets (D-2). Standing rule: launch-critical executor jobs route to the Mac executor only.

## Explicit non-gates

The meeting bot (live join, per-participant capture, rehost, Zoom distribution research): fast-follow pending D3, never gates launch. Insights: post-revenue. Customer-service vertical: post-launch. Audio retention go-live: dormant until customer need plus consent framework. Interviewee coach: deferred pending a fresh go/no-go (A-8), unless later promoted by Mo.

## Register maintenance

Update gate status in this file whenever a gate closes, with the evidence link (commit, test output, counsel letter reference). The absorption queue (docs/FABLE_ABSORPTION.md section 6) and the Sanity hub mirror status; this file is the gate source of truth.
