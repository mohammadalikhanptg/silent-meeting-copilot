# Job report — job-smcsec-4

**Security hardening 4/N: F2 — per-device helper-key revocation**

Author: ali@khan.vg · Branch: `worker/job-smcsec-4` → PR to `main` (**not merged, not deployed** — the orchestrator reviews and merges; the engine, unchanged here, needs no redeploy). Implemented against the exact F2 definition in `docs/security-framework.md` (§4 finding F2 + §6 priority #4). App-only; keyless; no third-party data introduced; the transcription hot path and the Cloudflare worker are untouched.

## Scope picked (and why)

Open-PR check first (per standing guidance): the only open PRs were **#7** (meeting-bot build 2/N, `worker/`+`bot/` — not security, not mine) and **#4** (engine-deploy CI — operator-gated, not security). No competing security PR, so F2 was clear to take.

Per the framework's own remaining backlog, every other item was closed across smcsec-1/2/3 (H1–H4, CSP, F1 rate-limiting, F4 retention/hard-delete, F5 AI-terms + error-leakage, F7 IDOR, F8 CI scanning). The §6 priority list named **F2 per-device helper-key revocation** as the next item, and smcsec-3's report explicitly handed it off as "remaining hardening." I scoped this job to F2 alone — it is cohesive (app endpoint + a new table + the profile UI), high-value (turns a coarse all-or-nothing revocation into selective per-device revocation), and self-contained.

F2's remediation offered two options: (a) per-device key id + individual revocation list, or (b) mint short-lived helper session tokens from the key at connect time. I chose **(a)** — it fits the existing "paste a long-lived key" helper UX, needs no new helper↔app round trip (the helper has no app session), and is a smaller, lower-risk change that leaves the worker and Electron client untouched.

## What changed

### (1) New table — `helper_devices` (`scripts/migrate.mjs`)
Idempotent `CREATE TABLE IF NOT EXISTS helper_devices (device_id text PRIMARY KEY, user_email text NOT NULL, label text, created_at, last_seen_at, revoked_at)` + `idx_helper_devices_user`. One row per registered device; `revoked_at` is the per-device kill switch.

### (2) Device id in the signed key (`app/lib/auth.js`)
`generateHelperKey(email, version, deviceId)` now bakes an optional `d` (device id) into the key payload; `decodeHelperKey` surfaces it as `deviceId`. The HMAC already covers the whole payload, so the device id is tamper-proof. The signing keyring (and the engine-token path) is untouched — `deviceId` is purely additive and absent on legacy keys.

### (3) Pure decision module (`app/lib/helper-devices.js`, new)
Deliberately free of Next/DB imports so the **security-critical** accept/reject decision has real offline unit coverage:
- `newHelperDeviceId()` → `hd_` + 12 random bytes (base64url): unguessable, no PII.
- `helperDeviceDecision(decoded, deviceRow)` → fails closed. Legacy key (no `d`) → `{ok:true, legacy:true}` (migration bridge). Per-device key → reject if the row is missing (`device unknown`), belongs to another account (`device mismatch`), or is revoked (`device revoked`); else accept.

### (4) Engine validation callback (`app/api/internal/validate-helper-key/route.js`)
After the existing HMAC + `helper_key_version` checks, it now looks up the `helper_devices` row (scoped by `device_id` **and** `user_email`), applies `helperDeviceDecision`, and rejects with the decision's reason. On a good connection it touches `last_seen_at` fire-and-forget (a bookkeeping write must never block or fail a valid connection). The worker still receives the same `{valid, email}` shape — **no worker change**.

### (5) Pairing-management API (`app/api/helper-key/route.js`)
- `GET` → lists the user's devices (`{version, devices[]}`) instead of re-serving a single key (per-device keys are shown once, at issue).
- `POST {action:'issue', label?}` → inserts a device row and returns the minted key **once** (`{issued, key, device_id, label}`).
- `POST {action:'revoke', device_id}` → ownership-scoped `revoked_at = now()`; the others keep working.
- `POST {action:'rotate-all'}` (the default, preserving the original rotate behaviour) → bumps `helper_key_version` **and** marks every device revoked — the panic button.

### (6) Profile UI (`app/profile/page.js`)
The single-key card becomes a **paired-devices** section: a list (label / added date / last-seen / status) with a per-device **Revoke**, a **Pair-a-device** control that displays the new key once with a Copy button, and a **Revoke-all devices** danger action. Setup steps updated to "Pair a device → copy → paste in the helper."

### (7) Tests (`scripts/test-helper-devices.mjs`, new)
Offline, no DB/engine. **46/0.** Real coverage of `helper-devices.js` (active/revoked/unknown/cross-user/legacy/null-fail-closed) + key-codec device-id round-trip and HMAC binding + source checks of the route/migration/profile wiring. Wired as `npm run test:devices` and added (with the existing pairing suite) to `npm run test:security`; also added `npm run test:pairing`.

## Build / checks
- `node --check` → clean on every changed `.js`/`.mjs`.
- `next build` → **compiles, exit 0** ("Compiled successfully"), all routes incl. `/profile`, `/api/helper-key`, `/api/internal/validate-helper-key`. (`node_modules` was installed transiently to build; `package-lock.json` churn from `npm install` was reverted — my `package.json` change adds only test scripts, no deps.)
- `node scripts/test-helper-devices.mjs` → **46/0**.
- `npm run test:security` → retention **20/0** + IDOR **57/0** + rate-limit **44/0** + pairing **53/0** + devices **46/0**, all green.
- `npm run test:bot` → **31/0** (worker untouched).

## Honest notes for the merge
- **App-only.** No `worker/` or `helper/` code changed — the device id rides transparently inside the signed key the user already pastes, so the Cloudflare engine and the Electron helper need no redeploy. The engine validation logic that enforces revocation lives in the app's internal endpoint, which the worker already calls.
- **Migration bridge is intentional.** Legacy pre-F2 keys (no `d`) still validate on the coarse HMAC + version checks (`helperDeviceDecision` → `{ok:true, legacy:true}`), so a currently-paired helper keeps working until the user re-pairs. A future hard cutover can reject legacy keys once every device has re-paired; flagged in code and in the framework status note. `helper_key_version` still works as the global "revoke all" hammer for legacy and per-device keys alike.
- **The `helper_devices` migration runs idempotently** via the existing `scripts/migrate.mjs` build step on the next Vercel deploy; no manual step.
- **Shared docs touched** are append-only: `docs/security-framework.md` (hardening 4/N status) and `ROADMAP.md` (progress entry).
- With F2 closed, **every F1–F8 finding and every Section-8 High/medium is implemented and tested.** The only outstanding security item is the **operator action** to rotate the GitHub credential embedded in the Mac git remote (outside this repo).
