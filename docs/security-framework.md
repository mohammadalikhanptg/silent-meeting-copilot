# Silent Meeting Copilot — Security Framework v1

Owner: Pacific Technology Group (Mo Khan)
Status: pre-first-preview. This document is the security baseline for the whole SMC setup and is the subject of an independent LLM cross-review. It is written to be honest about controls in place and gaps still open. It does not claim the system is invulnerable; it states the posture, the threats, the controls, and the remediation plan.

## 1. System overview and trust boundaries

SMC has three runtime components and one data store:

- Cockpit + API (Next.js on Vercel, app domain). Authenticated web app. Holds all signing secrets. Talks to Neon. Issues short-lived engine tokens and helper pairing keys.
- Engine (Cloudflare Worker + Durable Objects, `smc-engine.*.workers.dev`). Stateless HTTP transforms (transcribe, coach, minutes, action-points, interview-assessment) plus two authenticated WebSocket endpoints (`/app/ws` for the cockpit, `/helper/ws` for the desktop helper). A per-session Durable Object holds session lifecycle and enforces capture authorisation. The engine holds no signing secret; it validates tokens by calling back to the app's internal endpoints with a shared bearer secret.
- Desktop helper (Electron). Captures the user's microphone (ME) and system audio (OTHERS) and streams audio to the engine over an authenticated WebSocket, only when the cockpit authorises capture.
- Data store (Neon Postgres). Users, sessions, magic links, auth attempts, meetings, transcript segments, reference docs (CVs etc.), profiles, invites, flagged items.

Trust boundaries:
- B1 Browser to App (session cookie, CSRF-checked).
- B2 Browser to Engine (short-lived engine-ws token over WSS; plus, currently, unauthenticated HTTP calls — see F1).
- B3 Helper to Engine (helper pairing key over WSS).
- B4 Engine to App internal validation (INTERNAL_SHARED_SECRET bearer).
- B5 App to Neon (TLS, connection string secret).
- B6 App/Engine to AI providers (Cloudflare Workers AI: Whisper, Deepgram nova-3, Llama models).

## 2. Data classification

- Special-category / sensitive: meeting audio and transcripts (may contain anything), candidate CVs and interview content (employment data, potentially special-category), interview assessment output (decision-support about a person).
- Personal data: user email, profile (phone, address, businesses), IP addresses in auth_attempts and alerts.
- Secrets: AUTH_SECRET, HELPER_SIGNING_SECRET, TOTP_ENC_KEY, INTERNAL_SHARED_SECRET, DATABASE_URL, AI provider credentials, Cloudflare/Vercel deploy tokens.
- Audio is transient: streamed as discrete WebM segments, transcribed, not persisted as files. Only text transcripts persist.

## 3. Controls in place (verified in code)

Authentication and session:
- Closed system. Login is gated by an explicit allowlist (AUTH_ALLOWLIST) plus accepted invites. No open sign-up.
- Two factor. Passwordless magic link (single-use, IP rate limited) followed by TOTP. TOTP secrets are encrypted at rest with AES-256-GCM (TOTP_ENC_KEY); the pre-auth stage uses a separate 10-minute cookie.
- Session cookie is HMAC-SHA256 signed (AUTH_SECRET), httpOnly, Secure, SameSite=strict, 7-day max age, verified with constant-time comparison and expiry. Server side, every request re-checks the session row for revocation and expiry; use of a revoked session raises an alert.
- TOTP brute force is locked out after repeated failures (429, 15-minute window). Magic-link requests are IP rate limited (15-minute window).

Cross-site and transport:
- Middleware rejects state-changing requests whose Origin/Referer does not match the app host, and rejects when neither is present (CSRF defence).
- All transport is HTTPS/WSS (Vercel, Cloudflare).

Engine and capture:
- WebSocket endpoints are authenticated: `/app/ws` validates a short-lived, audience-bound engine token (typ engine-ws, aud smc-engine, ~15 min TTL, jti); `/helper/ws` validates a versioned helper pairing key. (A legacy unauthenticated `/session/:id/ws` route that bypassed this was found in the review and has been removed — see Section 8.) Both are validated by the engine calling back to the app's internal endpoints, so the signing secret never leaves the app.
- The Durable Object enforces capture authorisation: capture happens only on an explicit cockpit control message, a newest-wins epoch election allows only one active helper, with a grace window and a 3-hour hard cap auto-suspend.
- Secret separation: the engine-to-app transport secret (INTERNAL_SHARED_SECRET) is deliberately separate from the key/token signing secret, so rotating transport never invalidates issued keys or tokens.

Authorisation and isolation:
- App data routes scope queries by the authenticated session email (observed in meetings, segments, profile, and the new interview-assessment route). A full route-by-route IDOR audit is still recommended (F7).
- The interview assessment is decision-support only, computed deterministically from cited evidence, with protected-characteristic exclusions and a prominent human-decision disclaimer (UK GDPR Article 22 posture).

## 4. Findings register (open)

F1 — High — Unauthenticated engine HTTP endpoints with wildcard CORS.
The engine's POST endpoints (`/transcribe`, `/coach`, `/minutes`, `/action-points`, `/interview-assessment`) perform no authentication, and CORS is `Access-Control-Allow-Origin: *`. The cockpit calls `/coach` directly from the browser with no token. Anyone who knows the worker URL can call these endpoints, submit arbitrary content, and consume AI compute. Impact: cost abuse and denial of service, and free use of the transforms; not a direct leak of other users' stored data, because these endpoints are stateless and operate only on the caller's submitted text. Remediation: require the engine-ws session token (or a dedicated short-lived HMAC) on every generation endpoint; validate it the same way the WS path already does; restrict CORS to the app origin; add per-user and per-IP rate limiting and a max payload size. Route the cockpit's coach call through the token it already fetches.

F2 — Medium — Helper pairing key is a long-lived bearer with coarse revocation.
The pairing key embeds {email, version} and is valid until the version is bumped, which revokes all of that user's devices at once. There is no per-device identity or selective revocation. Impact: a leaked key lets an attacker stream audio as that user until the user rotates, which also kicks their own legitimate devices. Remediation: per-device key id with an individual revocation list, or mint short-lived helper session tokens from the key at connect time so the long-lived secret is used rarely.

F3 — Medium — Secret inventory, rotation, and migration fallback.
Five app secrets plus provider and deploy tokens. HELPER_SIGNING_SECRET is still accepted as an internal-bearer fallback during migration and should be dropped once the engine is confirmed sending INTERNAL_SHARED_SECRET, otherwise the transport and signing secrets remain coupled. Remediation: drop the fallback, document a rotation runbook per secret (blast radius, procedure, who can do it), and confirm all secrets are stored only in Vercel/Cloudflare/Mac env and never in the repo.

F4 — Medium — Data at rest and retention.
Transcripts and reference documents (CVs, potentially special-category employment data) are stored in Neon in plaintext columns; only the TOTP secret is application-encrypted. There is no stated retention or auto-purge policy and no self-service data deletion for meeting content. Remediation: define a retention period with automatic purge; provide per-meeting and per-account hard delete; consider application-level encryption of transcript and reference-doc content; confirm Neon encryption at rest and backup handling.

F5 — Medium — Third-party AI data handling and error leakage.
Audio and text are sent to Cloudflare Workers AI (Whisper, Deepgram nova-3, Llama). The data-processing terms and any retention or training-use by these models must be confirmed and recorded, since interview and meeting content is sensitive. Separately, the engine broadcasts raw error strings to connected clients, which can leak internal detail. Remediation: confirm and document the AI provider data terms (no training retention) as a processor relationship; replace client-facing error broadcasts with generic codes and log detail server-side only.

F6 — Low/Medium — Security headers and session lifetime.
Confirm HSTS, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options/frame-ancestors, and Referrer-Policy are set (Vercel does not set a strict CSP by default). The 7-day session has no rotation on re-authentication. Remediation: add a strict security-header set in the Next config; rotate the session id on each fresh login; consider a shorter idle timeout.

F7 — Low — IDOR audit.
The routes reviewed scope by session email, but not every route has been audited. Remediation: enumerate every data route and assert ownership scoping; add an automated test that a second user cannot read the first user's meetings, segments, reference docs, downloads, or flagged items.

F8 — Low — Supply chain and CI.
No automated dependency or secret scanning in CI is documented; a GitHub credential is embedded in the Mac git remote (flagged separately in the cloud framework). Remediation: enable dependency and secret scanning on the repo, pin and review dependencies, and rotate the embedded GitHub credential.

## 5. Compliance posture (UK)

- Roles: for the operator's own meetings the operator is controller. If SMC is offered to others, a processor agreement and clear controller/processor split are needed.
- Special-category data: interview and meeting content can contain special-category data. Lawful basis, explicit notice, and the compliance acknowledgement at session start are the current controls; retention and deletion (F4) close the loop.
- Automated decision-making: the interview signal is decision-support, deterministic from cited evidence, with protected-characteristic exclusions and a human-decision disclaimer, which is the correct Article 22 posture. Keep a human in the loop and never present it as an automated hiring decision.

## 6. Remediation priority

1. F1 authenticate engine endpoints + tighten CORS + rate limit (before any non-test use).
2. F4 retention + hard delete + at-rest handling (before real third-party data).
3. F5 confirm AI provider data terms; remove client error leakage.
4. F2 per-device helper key revocation.
5. F3 drop signing-secret fallback; rotation runbook.
6. F6/F7/F8 headers, IDOR audit, CI scanning.

## 7. Cross-review

This document and the underlying code are submitted to an independent LLM (Codex) for an adversarial security review. The reviewer is asked to challenge the findings, find additional vulnerabilities across all boundaries (auth, session, tokens, helper key, engine, capture authorisation, data isolation, injection, SSRF, supply chain), and rank by exploitability. The reconciliation is recorded in Section 8.

## 8. Cross-review reconciliation (Codex, 25 Jun 2026)

The full independent review is saved alongside this document (security-codex-review-20260625.md). Verdict: BLOCK / REJECT as the system stood, moving to APPROVE-WITH-CHANGES once the Critical and High items are fixed and tested. The review was correct on the material points and found two criticals I had missed.

### Criticals it found — now FIXED this session
- C1 Legacy `/session/:id/ws` accepted browser WebSocket connections with no token. A missing role defaulted to browser inside the Durable Object, so an unauthenticated client could send capture control and receive broadcast messages. Nuance: current clients use the per-user Durable Object, while the legacy route addressed a session-id-named object, so live meetings were not actually exposed on it; nonetheless it was a real unauthenticated capture-and-transcript control surface. FIXED: the route is removed, and the Durable Object now fails closed, rejecting any WebSocket that does not carry the Worker-injected authenticated identity.
- C2 Legacy `/session/:id/info` returned success for any id (a session-existence oracle). FIXED: route removed.
- Also done now: client-facing error strings on the engine (HTTP responses and the WebSocket error broadcast) are genericised; details are logged server-side only.

### High items accepted — remediation backlog (required before any real third-party or candidate data)
- H1 Authenticate every engine POST endpoint (transcribe, coach, minutes, action-points, interview-assessment, and the public enrich-flag) with the short-lived engine token; lock CORS from `*` to the app origin; enforce a body-size cap before parsing and per-user and per-IP rate limits. The cockpit must send the token it already holds on its coach call; the app-server callers must mint and send a token.
- H2 Move the helper pairing key and the engine token out of the URL query string (where they reach logs and telemetry) into the WebSocket subprotocol or an authorization mechanism; stop logging full URLs.
- H3 Drop the HELPER_SIGNING_SECRET internal-bearer fallback once the engine is confirmed sending INTERNAL_SHARED_SECRET, then rotate both; add a key id and support two active signing keys for staged rotation.
- H4 Bind the engine token to the active app session id and verify session revocation at validation time; store and check jti for replay resistance, or drop the implied claim.

### Medium items accepted — backlog
Role-scope broadcasts so helpers do not receive transcript messages; isolate untrusted reference-doc and transcript text from instructions in LLM prompts and add prompt-injection tests; bind a meeting id into the token and Durable Object state so sessions cannot cross within one user object; write a durable audit trail for capture start/stop, helper election, and hard-cap suspend; add a WebSocket Origin allowlist for the browser path; complete the TOTP plaintext-to-encrypted migration and reject plaintext; add a strict security-header and CSP set; build an automated IDOR test (a second user cannot read the first user's data); define and enforce a retention and hard-delete policy; confirm and record the AI providers' data-processing terms (no training retention); enable dependency and secret scanning in CI and rotate the credential embedded in the Mac git remote.

### Corrections to my own claims (per the review)
- "WebSocket endpoints are authenticated" was materially wrong while the legacy route existed; it is now true after removal.
- The middleware cookie signature comparison is not constant-time (the server-side route verification in auth.js is); the Section 3 claim is narrowed to the server-side path.
- "The engine holds no signing secret" is overbroad while the HELPER_SIGNING_SECRET fallback can be present in the engine environment; true only after H3.
- "Computed deterministically" for the interview assessment means deterministic aggregation in code over the model-extracted, cited claims, not deterministic model output; citations themselves still require validation against source spans (covered by the prompt-injection medium).
- The single-active-helper guarantee is enforced by the active-helper id, not by the epoch value on audio frames; the epoch wording was overstated.

### Gate
Do not onboard any real third-party or candidate meeting data until H1 to H4 and the broadcast-scoping, prompt-injection, security-header, and retention mediums are implemented and tested. The operator's own first functional test of the meeting loop is acceptable now that the criticals are closed, because it uses the operator's own authenticated account and own content.

### Remediation status update (25 Jun, second pass)
Done and deployed since the review: criticals C1/C2 (legacy unauthenticated WebSocket + info routes removed; Durable Object fails closed without an injected authenticated identity); client-facing errors genericised; H1 closed — all engine POST endpoints now require either the internal service secret or a valid short-lived engine token, CORS is locked from wildcard to the app origin, and a request-body size cap is enforced; security headers added (HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy). Verified: an unauthenticated POST to a generation endpoint now returns 401 and the CORS allow-origin is the app origin only.

Still open (next dedicated pass, best done after the operator's meeting test because they touch the live authentication path or secret rotation): H2 move the helper key and engine token out of the URL query string into a header/subprotocol; H3 drop the HELPER_SIGNING_SECRET internal fallback once INTERNAL_SHARED_SECRET is confirmed, add a signing-key id for staged rotation; H4 bind the engine token to the active app session id with a revocation check and jti replay protection. Mediums remaining: role-scope broadcasts so helpers do not receive transcript messages; prompt-injection isolation for reference docs/transcripts in the coach prompt (the interview assessment already isolates them); a strict Content-Security-Policy; an automated IDOR test; data retention and hard-delete; AI-provider data-processing confirmation; CI dependency and secret scanning. The gate stands: no real third-party or candidate data until H2-H4 and the broadcast-scoping, prompt-injection and retention mediums are implemented and tested.

### Remediation status update (25 Jun, third pass — security hardening 1/2)
Done this pass (PR open for orchestrator review, not yet merged): **H2, H3, H4 and the strict CSP medium**.

- **H2 — tokens out of URLs.** The engine session token and helper pairing key no longer travel in any URL or query string. Browser cockpit and desktop helper carry them in the WebSocket `Sec-WebSocket-Protocol` subprotocol (`smc.v1` marker + a `smc.token.<token>` / `smc.key.<key>` value entry; the engine echoes only the marker, never the secret). The engine→app internal validation fetches now pass the token/key/session-code in `X-Session-Token` / `X-Helper-Key` / `X-Session-Code` headers, not the query. Verified: no `token=`/`key=` engine/session/helper params remain in code; the WS handshake reflects only `smc.v1`.
- **H3 — signing hygiene.** The `HELPER_SIGNING_SECRET` internal-bearer fallback is removed everywhere (app `checkInternalBearer`, the worker POST/validate paths, and all five server-side engine callers) — only `INTERNAL_SHARED_SECRET` is accepted as the transport bearer, fully decoupling transport from signing. Signed tokens and pairing keys now carry a `kid`; verification selects the key by `kid`, supporting two active keys for staged rotation. Rotation runbook: `docs/key-rotation.md`.
- **H4 — bind + revoke + replay.** The engine token is bound to the issuing app session id (`sid`); validation looks up that session row and rejects revoked/expired/missing sessions, so logout or admin revoke kills the session's engine tokens (revocation path). Each token's `jti` is recorded single-use on the consuming WebSocket-upgrade path (`used_engine_tokens` ledger) and rejected on reuse (replay protection). The reused POST path validates without consuming, as those endpoints are legitimately called repeatedly within the token TTL.
- **CSP.** A strict, nonce-based Content-Security-Policy is set on every app response via middleware: `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline` for scripts; the inline theme-bootstrap script and Next's own scripts are nonced), `connect-src` locked to self + the engine (HTTPS + WSS), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`. `style-src` retains `unsafe-inline` only because the UI uses React inline style attributes throughout (not nonceable; no inline scripts depend on it). The engine adds a lockdown CSP + `nosniff` to its JSON responses; the desktop helper's `connect-src *` is tightened to the engine origins.

Verified this pass: `next build` passes; `node --check` clean on all changed files; a standalone exercise of the keyring/token logic (sid binding, jti, tamper rejection, staged `kid` rotation, no-fallback bearer, subprotocol extraction) passes 19/19; the helper-pairing source-check suite passes 53/0. Still open after this pass: the remaining mediums (broadcast role-scoping, coach prompt-injection isolation, IDOR test, retention/hard-delete, AI-provider terms, CI scanning). The gate is unchanged.

## Remediation status update (26 Jun 2026)
- H2-H4 transport/token hardening + strict CSP (F3, F6) - MERGED to main via job-smcsec-1; engine redeployed.
- F7 IDOR audit — DONE. scripts/test-idor.mjs rebuilt and made tolerant of every ownership-guard spelling the routes actually use (session.email, p.email, a bare email, an m. join alias, a meetings subquery). All 18 data routes audited: each requires getSessionPayload and scopes by user_email. Verified 57 passed / 0 failed; the live-DB layer self-skips without DATABASE_URL. Wired as `npm run test:idor` and a blocking CI gate (idor-audit) in security-scan.yml. The earlier 78e0287 (add) then f853cc2 (revert) happened because the original guard pinned only the literal ${session.email} and false-failed on the other spellings.
- F8 supply chain + CI — DONE. .github/workflows/security-scan.yml runs npm audit (root/worker/helper, non-blocking warnings) plus gitleaks on push/PR/manual/weekly; idor-audit blocks merges.
- F5 third-party AI data handling — data-processing confirmation landed (Cloudflare Workers AI processor posture, dd8dd21). Remaining sub-item: confirm no raw provider error strings reach the client.
- Engine — transcription rewrite DEPLOYED to Cloudflare (smc-engine version 7a166c1e, /health 200).
- Next, in priority order: F4 data retention + hard-delete + at-rest (gate before any real third-party/candidate data), then F2 per-device helper-key revocation, the F5 error-leakage sub-item, and F1 rate-limiting (criticals/CORS/headers already closed).

## Remediation status update (27 Jun 2026, hardening 3/N — job-smcsec-3)

Done this pass (PR open for orchestrator review, not yet merged): **F1 rate-limiting** (the last open piece of F1; auth + CORS lockdown + body-size cap were already closed) and the **F5 client error-leakage sub-item**.

- **F1 — rate limiting on the engine generation endpoints.** All six protected POST endpoints (`/transcribe`, `/coach`, `/enrich-flag`, `/minutes`, `/action-points`, `/interview-assessment`) are now rate limited on top of the existing auth and body-size cap. Built on Cloudflare's native Rate Limiting bindings (`worker/src/ratelimit.js`, wired in `worker/src/index.js`, configured in `worker/wrangler.toml`):
  - **`RL_IP`** (120/60s, per source IP) is checked **before** the auth callback, so a flood of bad-token requests cannot hammer the app's `validate-session-token` endpoint.
  - **`RL_USER`** (90/60s, keyed by authenticated email + endpoint) caps each user per endpoint; 90/min comfortably covers live `/coach` polling during a meeting while still capping abuse.
  - **`RL_HEAVY`** (20/60s, per user) is an extra, tighter bucket on the expensive `/transcribe` path.
  - Limit exceeded → **HTTP 429** with `Retry-After`. Trusted server-to-server callers presenting `INTERNAL_SHARED_SECRET` (boundary B4) are **exempt** (they are authenticated and may legitimately burst; the shared app egress IP must not be throttled for all users at once). The limiter **fails open**: a missing binding or a `.limit()` error allows the request, so a limiter outage never takes the meeting copilot offline — auth and the body cap still apply. Limits are per Cloudflare location (documented native-binding behaviour), which is sufficient as an abuse/DoS/cost backstop.
- **F5 — error leakage (engine).** The remaining sub-item is closed. Three generators returned `String(err.message || err)` to the client on failure (`generateMinutes`, `generateActionPoints`, `generateInterviewAssessment` in `worker/src/session-do.js`); these now return a generic message / `generation_failed` code and log the detail server-side with `console.error`. The HTTP catch handlers in `index.js` (generic `internal error`) and the WebSocket error broadcast (generic `processing error`) were already non-leaking; the WS `auth_error` carries only controlled reason strings from the app validator, not raw provider errors.

Verified: `node --check` clean on all changed files; `node scripts/test-engine-ratelimit.mjs` 44/0 (rate-limit unit + real `worker.fetch` wiring with stubbed bindings + F5 source checks); `npm run test:security` (retention + IDOR 57/0 + rate-limit) all green; `npm run test:bot` 31/0 (shared engine modules unaffected); `wrangler deploy --dry-run` validates the three rate-limit bindings and bundles cleanly. Remaining hardening after this pass: **F2** per-device helper-key revocation, plus the operator action to rotate the git-embedded GitHub credential. The gate before real third-party/candidate data (H2, H4, CSP, F4, F5, F7, F8 — and now F1) is met.

## 9. AI-provider data-processing position (confirmed, 25 Jun 2026)

All inference runs on **Cloudflare Workers AI** (`env.AI`): Whisper large-v3-turbo (English ASR, Cloudflare-native), Llama 3.x instruct (coaching/minutes/assessment, Cloudflare-native), and Deepgram nova-3 (Hindi/Urdu + auto ASR, a third-party model hosted on Workers AI). No audio or text is sent to any provider outside Workers AI.

Confirmed Workers AI data terms (Cloudflare, *Workers AI - Data usage*):
- **No training on customer content.** Cloudflare states it does not use Customer Content to train models on Workers AI or to improve Cloudflare or third-party services without explicit consent. We give no such consent.
- **No retention in our usage.** Cloudflare retains Workers AI Customer Content only if it is written to a Cloudflare storage service (R2, KV, Durable Objects, Vectorize) in conjunction with the AI call. Our transcription/coaching path passes audio and text straight to `env.AI.run` and persists only the resulting text to **our own** Neon database - it writes nothing to Cloudflare storage from the AI path - so Workers AI retains nothing.
- **This is a processor relationship.** Cloudflare acts as a processor for the inference; the operator remains controller of the meeting/interview content.

Provider-level opt-out applied:
- nova-3 is the only model we use that exposes a model-improvement opt-out. We set **`mip_opt_out: true`** on every `@cf/deepgram/nova-3` call (`worker/src/session-do.js`, `transcribeDeepgram`), opting our requests out of the Deepgram Model Improvement Program. The Cloudflare-native Whisper and Llama models have no equivalent program and are covered by the no-training/no-retention statement above.

This closes finding **F5** (data-handling half) and the Section-8 medium to confirm and record AI-provider data-processing terms.

## 10. Retention and hard-delete (implemented, 25 Jun 2026)

Closes **F4** retention/deletion. Full policy: `docs/retention-policy.md`. Single source of truth in code: `app/lib/retention.js`.

- **Explicit windows** (env-overridable) for every data class: sessions (`meetings`) default 90 days after end; transcripts, derived coaching artifacts (`flagged_items`) and reference docs (`session_reference_docs`) share the parent session's lifecycle; magic links 7 days; auth attempts 30 days; expired/revoked auth sessions 30 days. **Temporary audio chunks: never persisted** - transcribed in memory by the engine and discarded. **Server logs:** platform-managed (Vercel/Cloudflare); we add no app-level logging of content.
- **Future bot sessions** (third-party voice) default to a **short 7-day** window (`RETENTION.botSessionDays`); the purge job already honours `mode_type='bot'` so the window is enforced the day the bot lands.
- **Operator-triggerable hard-delete:** `DELETE /api/meetings/[id]` removes the session row and every child row (transcript segments, flagged artifacts, reference docs), ownership-scoped, and returns `purged:true` only when a re-count proves zero rows remain. A scheduled `scripts/purge-retention.mjs` (`npm run purge-retention`) applies the windows in bulk; wire it to a daily cron when real/bot data lands.
- **Proof:** `scripts/test-retention.mjs` seeds a session with rows in every child table, hard-deletes it, and asserts `remaining.total === 0` while a sibling session is untouched; it also proves window-based purge (including the short bot window). Runs offline against an in-memory store and, when `DATABASE_URL` is present, against live Neon.

