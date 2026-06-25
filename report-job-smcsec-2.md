# Job report — job-smcsec-2

**Security hardening 2/2: retention + hard-delete, IDOR test, CI scanning, AI-provider confirmation**

Author: ali@khan.vg · Branch: `worker/job-smcsec-2` → PR to `main` (**not merged, not deployed** — orchestrator reviews and merges). Implemented against `docs/security-framework.md` definitions (F4, F5, F7, F8). Keyless; no third-party data introduced; transcription pipeline logic untouched except the one data-handling flag noted below.

## Acceptance criteria — per item

### (1) Retention windows + verifiable, operator-triggerable hard-delete
- **`app/lib/retention.js` (new)** — single source of truth. `RETENTION` defines explicit, env-overridable windows: sessions **90d** after end (`RETENTION_SESSION_DAYS`); future **bot** sessions **7d** (`RETENTION_BOT_SESSION_DAYS`); magic links 7d; auth attempts 30d; expired/revoked auth sessions 30d. `RETENTION_CLASSES` documents every class including **temporary audio chunks = never persisted** and **server logs = platform-managed**. `SESSION_CHILD_TABLES` lists every per-session table so delete and verify stay in lockstep.
  - `hardDeleteSession(sql, {meetingId, ownerEmail})` — ownership-scoped; deletes `flagged_items` → `transcript_segments` → `session_reference_docs` → `meetings` (order respects the `flagged_items.source_segment` FK), then **re-counts every table** and returns `remaining.total`. A cross-account caller gets `{ok:false, reason:'not_found_or_forbidden'}` and deletes nothing.
  - `verifySessionPurged` (the proof), `hardDeleteAccountContent` (account offboarding), `purgeExpiredSessions` (window enforcement, bot window honoured via `mode_type='bot'`), `purgeAuthHousekeeping`.
- **`app/api/meetings/[id]/route.js`** — added `DELETE` handler: authenticated, ownership-scoped, calls `hardDeleteSession`, returns `purged:true` only when `remaining.total===0`.
- **`scripts/purge-retention.mjs` (new)** — operator/cron-triggerable bulk purge (`npm run purge-retention`, `--dry-run`); fails if any session still has rows post-delete.
- **`docs/retention-policy.md` (new)** + **security-framework.md §10** — the written policy.
- **Bot hook:** the purge already branches on `mode_type='bot'` to apply the short 7d window the day the bot lands (bot not built yet).
- **Audio confirmation:** grep across `app/ worker/src helper/` found no code persisting audio to disk or DB; documented and asserted in the test.
- **Verification:** `node scripts/test-retention.mjs` → **20/20**. Seeds a session with rows in every child table, hard-deletes, asserts `remaining.total===0` and an independent re-count = 0, sibling session untouched, re-delete is a safe no-op, and window-based purge removes expired standard + bot sessions while a fresh one survives. Runs offline (in-memory store exercising the real lib) and against live Neon when `DATABASE_URL` is set.

### (2) Automated IDOR test
- **`scripts/test-idor.mjs` (new)** + **`scripts/lib/fake-sql.mjs` (new, shared in-memory client)**.
  - **Structural sweep:** walks `app/api/**/route.js` and asserts **every** route under `meetings`, `flagged-items`, `profile-docs` (18 route files) authenticates the caller *and* scopes its query by the authenticated owner (email filter, meeting-ownership join, or `hardDeleteSession` delegation).
  - **Runtime:** account B cannot read (`getOwnedSession`→null) or delete (`ok:false`) account A's session; B's delete attempt removes **zero** of A's transcript/flag/reference rows; A can delete its own. Offline + live-Neon modes.
- **Wired into the test run** via `.github/workflows/security.yml` and `npm run test:security`.
- **Verification:** `node scripts/test-idor.mjs` → **40/40**.

### (3) CI dependency audit + secret scanning
- **`.github/workflows/security.yml` (new)** — on `pull_request` and `push` to `main`:
  - `dependency-audit`: `npm audit --audit-level=high` for the **web app** and the **worker** (fails on high/critical).
  - `secret-scan`: gitleaks binary, full-history `gitleaks detect --exit-code 1` (fails on any finding; binary avoids the org-licence requirement of the action wrapper).
  - `security-tests`: runs the retention + IDOR proofs.
- **Current audit status:** 2 **moderate** advisories (postcss/next transitive), **no high/critical** → the gate passes on this PR. (Verified locally with `npm audit --audit-level=high` → exit 0.)

### (4) AI-provider confirmation + `mip_opt_out`
- **`docs/security-framework.md` §9 (new)** records the confirmed **Cloudflare Workers AI** position with the exact quote: Cloudflare *does not use Customer Content to train models or improve services without explicit consent*, and retains nothing unless content is written to a Cloudflare storage service in conjunction with the call — which our path never does (it persists only text, to our own Neon). Processor relationship; operator remains controller.
- **`worker/src/session-do.js`** — `transcribeDeepgram` now sets **`mip_opt_out: true`** on every `@cf/deepgram/nova-3` call (the only model we use that exposes a model-improvement opt-out; Whisper/Llama are Cloudflare-native with no such program). Source: Cloudflare nova-3 model docs — `mip_opt_out` is a top-level boolean input that opts out of the Deepgram Model Improvement Program.

## Build / checks
- `npm run build` (migrate + `next build`) → **success**, exit 0.
- `node --check` → clean on all changed/new JS (`retention.js`, the route, both scripts, `fake-sql.mjs`, both tests, `session-do.js`, `index.js`).
- `npm run test:security` → **60/60** (retention 20 + IDOR 40).
- `package-lock.json` reverted after `npm install` (my changes add no dependencies — kept the PR free of lockfile churn).

## Honest notes for the merge
- The hard-delete and IDOR proofs run against an **in-memory** client offline (CI-safe, no secrets) and switch to **live Neon** automatically when `DATABASE_URL` is present. The in-memory client exercises the *real* `app/lib/retention.js` functions; it is a faithful stand-in for the specific query shapes, not a SQL engine — if a retention query changes shape, the test fails loudly by design.
- `scripts/purge-retention.mjs` is built and tested but **not yet scheduled**; wire it to a daily cron when real/bot data lands (noted in the policy doc).
- `mip_opt_out: true` is the only change to the transcription pipeline — a data-handling flag explicitly requested by the brief, not a logic change.
- F8's other half — rotating the GitHub credential embedded in the Mac git remote — is an operator action outside this repo and is not done here.
- This branch is based on `main`; it does **not** include the H2–H4 changes from job-smcsec-1's open PR (#2). No overlap in files of concern except `docs/security-framework.md` (append-only additions here), which the orchestrator can merge in either order.
