# Job report — job-smcsec-3

**Security hardening 3/N: F1 engine rate-limiting + F5 error-leakage close-out (engine)**

Author: ali@khan.vg · Branch: `worker/job-smcsec-3` → PR to `main` (**not merged, not deployed** — orchestrator reviews and merges; the engine deploys manually via wrangler or the still-open PR #4). Implemented against `docs/security-framework.md` (F1, and the F5 error-leakage sub-item). Engine-only; keyless; no third-party data introduced; the ME/OTHERS transcription hot path is untouched.

## Scope picked (and why)

Open-PR check first (per standing guidance): only PR #4 was open (operator-gated engine-deploy CI — not security work, not mine to touch). No competing security PR, so this job was clear to take the next items.

Per the security framework's remaining backlog (§6 priority + the 26/27 Jun status updates), the open hardening items were **F1 rate-limiting** (the #1 remaining priority — auth, CORS lockdown and the body-size cap were already closed, leaving rate limiting as the one missing piece of F1), the **F5 client error-leakage sub-item**, and **F2** per-device helper-key revocation. I scoped this job to **F1 + F5** — both engine-side, cohesive, self-contained, and high-value (cost/DoS abuse on the AI endpoints + stopping raw error detail reaching clients) — and left F2 (which spans app DB + endpoint + engine + helper and touches the live auth path) as a clean follow-up.

## What changed

### (1) F1 — rate limiting on the engine generation endpoints
- **`worker/src/ratelimit.js` (new)** — small, pure, unit-testable helper over Cloudflare's native Rate Limiting bindings. `allow()` (single-bucket check, fail-open), `clientIp()` (CF-Connecting-IP → X-Forwarded-For → `unknown`), `checkIpLimit()` (pre-auth per-IP), `checkUserLimit()` (post-auth per-user+endpoint, with the heavy bucket only for `/transcribe`).
- **`worker/src/index.js`** — wired into the protected-POST branch: peek for the internal service secret (exempt), per-IP check **before** the auth callback, per-user/per-endpoint (+ heavy `/transcribe`) check after auth. Added a `tooMany()` → **HTTP 429** with `Retry-After`.
- **`worker/wrangler.toml`** — three `[[ratelimits]]` bindings: `RL_IP` 120/60s, `RL_USER` 90/60s, `RL_HEAVY` 20/60s (distinct namespace_ids 7701–7703).

Design decisions:
- **Pre-auth per-IP backstop** protects the app's `validate-session-token` endpoint from a bad-token flood (each unauthenticated attempt would otherwise trigger an internal validate fetch = cost).
- **Per-user limit keyed by email + path** so each endpoint gets its own counter; 90/min comfortably covers live `/coach` polling during a real meeting while still capping abuse. `/transcribe` (large payload, expensive AI) gets an extra 20/min bucket.
- **Service calls exempt.** Trusted server-to-server callers presenting `INTERNAL_SHARED_SECRET` (boundary B4) are already authenticated, may legitimately burst (e.g. minutes generation), and share the app's egress IP — rate limiting them would throttle every user at once.
- **Fail-open.** A missing binding (e.g. a dev env) or a `.limit()` error allows the request. The limiter is an abuse/DoS/cost backstop, never a hard dependency of the meeting loop; auth + the body-size cap still apply, so a limiter outage degrades to "no extra limit", not an outage. Limits are per Cloudflare location — the documented native-binding behaviour, sufficient for this purpose.

### (2) F5 — engine error leakage (sub-item) closed
- **`worker/src/session-do.js`** — `generateMinutes`, `generateActionPoints` and `generateInterviewAssessment` returned `String(err.message || err)` to the client on failure. They now return a generic message (`Minutes generation failed. Please try again.`) / generic code (`error: 'generation_failed'`) and log the detail server-side with `console.error`. The HTTP catch handlers in `index.js` (generic `internal error`) and the WS error broadcast (`processing error`) were already non-leaking; the WS `auth_error` carries only controlled validator reason strings, not raw provider errors. Grep confirms no `err.message`/interpolated-error path now reaches an engine client.

### (3) Tests
- **`scripts/test-engine-ratelimit.mjs` (new)**, fully offline:
  - **Part A** unit-tests `ratelimit.js`: fail-open on absent/invalid binding and on `.limit()` throw, honours the `success` boolean, forwards keys verbatim, `clientIp` precedence, per-endpoint key isolation, heavy bucket only for `/transcribe`, deny scopes, id fallback.
  - **Part B** drives the **real `worker.fetch`** with stubbed bindings/AI/validate-fetch: IP-limit → 429 before auth/AI with `Retry-After`; svc bearer exempt (limiters never consulted); per-user limit → 429; `/transcribe` heavy limit → 429; limiter throw fails open (not 429); invalid token still → 401; oversize body → 413 before any limiter.
  - **Part C** source-asserts the F5 fixes and the F1 wiring.
- Wired as `npm run test:ratelimit` and added to `npm run test:security`.

## Build / checks
- `node --check` → clean on `ratelimit.js`, `index.js`, `session-do.js`, the new test.
- `node scripts/test-engine-ratelimit.mjs` → **44/0**.
- `npm run test:security` → retention + IDOR (**57/0**) + rate-limit (**44/0**) all green.
- `npm run test:bot` → **31/0** (shared engine modules unaffected).
- `wrangler deploy --dry-run` → bundles cleanly (69.39 KiB); the three rate-limit bindings resolve (RL_IP 120/60s, RL_USER 90/60s, RL_HEAVY 20/60s).

## Honest notes for the merge
- **Engine-only.** No `app/` code changed, so `next build` is unaffected and was not re-run (it also runs the DB migration, which needs `DATABASE_URL`). The only root-repo change is two `package.json` test scripts.
- **Deploy is the orchestrator's.** The worker is not deployed by this job; deploy via wrangler from the Mac (`CLOUDFLARE_DEPLOY_TOKEN` → exported as `CLOUDFLARE_API_TOKEN`, per the roadmap deploy note) or via PR #4 once its repo secret is set. The new bindings take effect only after that deploy.
- **Rate-limit numbers are conservative starting points** (120 IP / 90 user / 20 transcribe per minute). They are env-free constants in `wrangler.toml`/`ratelimit.js` and easy to tune after the operator's first real-load test; per-location counting means real-world headroom is higher than the nominal numbers.
- **namespace_ids 7701–7703** are account-scoped; chosen high to avoid collision with any other worker's rate-limit namespaces in the account. No overlap with existing SMC bindings.
- This branch is based on `main` and is additive; the only shared doc touched is `docs/security-framework.md` (append-only status section) plus `ROADMAP.md` (append-only progress).
- Remaining hardening after this: **F2** per-device helper-key revocation; operator action: rotate the git-embedded GitHub credential.
