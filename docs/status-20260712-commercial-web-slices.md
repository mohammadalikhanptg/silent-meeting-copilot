# Status — 2026-07-12 — commercial web-session slices

Autonomous web session. Everything below was independently verified (git origin,
byte-for-byte fetch-back, and Vercel production READY), not taken from a runner's
self-report. Commit author ali@khan.vg throughout.

## Shipped and live this session

- Phase 2 (live cockpit rebuild + Live Focus card): verified and squash-merged
  to main (PR #13, commit 9a1e6d13), production deploy READY. Remaining: operator
  interactive authenticated pass on the live cockpit (operator-gated).
- Phase 3 slice 1 (usage metering foundation): commit 8d4c527f, READY. Records
  billable session minutes per user per month; read-only /api/usage; plan config
  with placeholder allowances; idempotent self-migration (no migrate.mjs edit).
  Additive, non-enforcing. Unit tests scripts/test-metering.mjs (13 pass).
  Spec: docs/SPEC-commercial-phase3-metering.md.
- Phase 3 slice 2a (usage on billing screen): commit a6c97e15, READY. Billing
  page now shows plan, minutes used with a progress bar, sessions, allowance and
  remaining. Display only.
- Phase 5 slice 1 (Insights from real data): commit f3ab8392, READY. Insights
  page shows sessions/time stats, talk balance, weekly cadence, session types and
  follow-up completion, all from the user's own data. Honest scope: no fabricated
  topic clustering or coaching trend lines (signals not persisted).

## Blocked — needs an operator decision

- Phase 3 slice 2b (turn metering into enforced plan limits): needs pricing/
  packaging decision D4. Built so this is a small contained change when D4 lands.
- Phase 4 (Settings/Billing/Stripe, product rename, Interviewer add-on gating):
  needs D1 (name), D4 (pricing), D6 (legal budget), D9 (signing secrets), plus
  Stripe keys. Not started to avoid baking in unmade decisions.

## Blocked — needs a desktop session (bridges are desktop-only)

- Phase 3 slice 3 (engine-measured true minutes): needs a Cloudflare engine
  deploy, which uses the SMC-exclusive token held on the Mac. Not reachable from
  a web session.
- Zoom bot first live-join test; Worker 2 cutover; any host/firewall/VLAN work.

## State discipline note

The authoritative state is the git history on main plus the Vercel deploy history
and the committed spec docs. ROADMAP.md prose has not been rewritten this session
(the large-file edit carries transcription risk over the MCP push path); refresh
it in a local/desktop session. The 17 legacy hardcoded hex values in the cockpit
page remain a small tokenisation follow-up, unchanged and non-blocking.
