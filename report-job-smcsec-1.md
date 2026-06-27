# Report — job-smcsec-1

**Security hardening 1/2: H2–H4 token/transport hardening + strict CSP**

Implemented against the exact H2/H3/H4 definitions in `docs/security-framework.md`
(Section 8). PR opened to `main`; **not merged** — the orchestrator reviews the diff
and merges. Commit author: `ali@khan.vg`. No new external dependencies. Keyless; no
third-party data touched; the just-landed transcription pipeline (segmentation /
model / labels) is untouched except for the WS token plumbing it sits behind.

---

## H2 — move tokens out of URLs

Goal: no auth/engine/session token in any URL or query string; carry them in headers
or the WebSocket subprotocol.

**Carriage design.** Browsers and the Electron helper cannot set headers on a
WebSocket handshake, so tokens travel in `Sec-WebSocket-Protocol`. The client offers
two subprotocols: a marker `smc.v1` plus a value entry `smc.token.<token>` (cockpit)
or `smc.key.<key>` (helper). The engine reads the value entry and echoes back **only
the marker**, so the secret is never reflected in a response header. Subprotocol
tokens are valid RFC7230 token chars (`A–Za–z0–9-._`), which our `smcs1_…`/`smc1_…`
formats satisfy.

| File | Change |
| --- | --- |
| `app/session/page.js` | Both `/app/ws` connect sites (live `openWs` + pre-start monitor) drop `token` from the query and pass `['smc.v1', 'smc.token.'+token]` as the WebSocket subprotocol. |
| `helper/renderer.js` | `/helper/ws` connect drops `key` from the query and passes `['smc.v1', 'smc.key.'+pairingKey]` as the subprotocol. `device`/`role` (non-secret) stay in the query. |
| `worker/src/index.js` | `/app/ws` and `/helper/ws` read the token/key from `Sec-WebSocket-Protocol` (`offeredProtocols` / `extractProtoValue`), delete any stray `token`/`key` query param before forwarding to the DO, and echo only `smc.v1`. The engine→app validation fetches now send the token/key/session-code in `X-Session-Token` / `X-Helper-Key` / `X-Session-Code` headers instead of query params, and `wsAuthError` echoes the marker so the browser receives the `auth_error` before close. |
| `worker/src/session-do.js` | The DO's 101 response echoes `Sec-WebSocket-Protocol: smc.v1` when offered, so the handshake completes. |
| `app/api/internal/validate-session-token/route.js` | Reads the token from `X-Session-Token` (was `?token=`). |
| `app/api/internal/validate-helper-key/route.js` | Reads key + session code from `X-Helper-Key` / `X-Session-Code` (was `?key=` / `?session_code=`). |
| `scripts/test-helper-pairing.mjs` | Source-check updated: asserts the worker reads the key from the subprotocol and **no longer** from `searchParams.get('key')`. |

Verified: `grep` shows no `token=`/`key=`/`session_code=` engine/session/helper params
remain in code (the only remaining `?token=` uses are email magic-links, a separate
mechanism out of H2 scope). Pairing source-check suite 53/0.

## H3 — signing hygiene (drop fallback + key id)

**Fallback removed.** `HELPER_SIGNING_SECRET` is no longer accepted as the
engine↔app transport bearer anywhere — only `INTERNAL_SHARED_SECRET` is. This
decouples the transport secret from the signing secret.

| File | Change |
| --- | --- |
| `app/lib/auth.js` | `checkInternalBearer` now accepts only `INTERNAL_SHARED_SECRET` (was a two-secret list including `HELPER_SIGNING_SECRET`). |
| `worker/src/index.js` | `requirePostAuth`, `validateHelperKey`, `validateSessionToken` use only `env.INTERNAL_SHARED_SECRET` (dropped `|| env.HELPER_SIGNING_SECRET`). |
| `app/api/.../{flagged-items/[itemId]/process, meetings/[id]/minutes, minutes-docx, action-points, interview-assessment}/route.js` | The five server-side engine callers drop `|| process.env.HELPER_SIGNING_SECRET` from the Bearer. |

**Key id (`kid`) for rotation.** A `kid`-based keyring was added so signing keys can
rotate with no flag day.

| File | Change |
| --- | --- |
| `app/lib/auth.js` | New `signingKeyring()` reads `TOKEN_SIGNING_KEYS` (`kid:secret,…`) + `TOKEN_SIGNING_ACTIVE_KID`; falls back to `HELPER_SIGNING_SECRET` as `kid k1` for bootstrap (explicit config, **no hardcoded/implicit default** — throws if nothing is set). `generateSessionToken` and `generateHelperKey` embed the active `kid` and sign with it; `verifySessionToken` and `verifyHelperKeyHmac` parse the `kid`, select the matching key, and reject unknown kids. Shared `hmacSign`/`timingEq` helpers replace the duplicated HMAC + length-checked `timingSafeEqual` blocks. |
| `docs/key-rotation.md` | **New.** Zero-downtime rotation runbook (add → promote → drain → retire), bootstrap notes, and emergency revocation. |

## H4 — bind + revoke engine token + replay protection

| File | Change |
| --- | --- |
| `app/lib/auth.js` | `generateSessionToken(email, sid, ttl)` now embeds the issuing app session id (`sid`); the jti widened to 12 random bytes. `verifySessionToken` returns `sid` and `jti`. |
| `app/api/session/start/route.js` | Passes `session.sid` into the token and 401s if the session has no `sid`. |
| `app/api/internal/validate-session-token/route.js` | **Binding/revocation:** requires `sid`, looks up the `sessions` row, and rejects missing/revoked/expired sessions — so logout or admin-revoke kills that session's engine tokens. **Replay:** when the engine sends `X-Consume: 1` (the WS-upgrade path), the `jti` is inserted into `used_engine_tokens` `ON CONFLICT DO NOTHING`; an already-present `jti` is rejected as “token already used”. Expired ledger rows are pruned opportunistically. |
| `worker/src/index.js` | `/app/ws` validates with `{ consume: true }`; `requirePostAuth` (coach etc.) validates with `{ consume: false }` because those endpoints are legitimately reused within the token TTL. The single-use guarantee therefore protects re-establishing the capture WebSocket — the cockpit already mints a fresh token before every WS open/reconnect, so this needs no client change. |
| `scripts/migrate.mjs` | New `used_engine_tokens` table (jti PK, sid, email, exp, used_at) + `exp` index for the jti ledger. |

Honest scope note: replay/single-use is enforced on the capture WebSocket upgrade, not
on the reused POST endpoints (a stolen token still allows stateless coach calls for the
≤15-minute TTL). That is the defensible posture given the token is reused by design;
the high-value capture-control channel is the one made single-use. Recorded in the
framework status note.

## CSP — strict Content-Security-Policy

| File | Change |
| --- | --- |
| `middleware.js` | Mints a per-request nonce and sets a strict CSP on **every** app response (public, authed, redirect, and CSRF-reject). `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline` for scripts), `style-src 'self' 'unsafe-inline'` (React inline style attributes are not nonceable; no inline script relies on it), `connect-src 'self' <engine-https> <engine-wss>`, `img-src 'self' data: blob:`, `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`. The nonce + CSP are also placed on the forwarded **request** headers so Next.js nonces its own scripts and the layout can read the nonce. |
| `app/layout.js` | Root layout is now async, reads the `x-nonce` request header, and applies it to the inline theme-bootstrap script. |
| `worker/src/index.js` | Engine JSON/error responses gain `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` + `X-Content-Type-Options: nosniff`. |
| `helper/index.html` | `connect-src *` tightened to `'self' https://*.workers.dev wss://*.workers.dev ws(s)://localhost:*`; `default-src` narrowed; `script-src`/`style-src` keep `'unsafe-inline'` only for the local renderer's inline `<style>` and one inline `onclick`. |

Existing `next.config.mjs` security headers (HSTS, nosniff, X-Frame-Options DENY,
Referrer-Policy, Permissions-Policy) are retained; CSP is owned solely by middleware
to avoid conflicting duplicate headers.

---

## Verification

- `next build` — passes (all routes compile; pages render dynamically as expected
  now that the root layout reads per-request headers for the nonce).
- `node --check` — clean on all changed `.js`/`.mjs` files.
- Token/keyring logic — a standalone exercise of the exact functions passes **19/19**:
  session-token round-trip with `sid` binding + `jti`, signature-tamper rejection,
  helper-key `kid`, staged `kid` rotation (overlap then retirement → unknown-kid
  reject), internal bearer accepts only `INTERNAL_SHARED_SECRET` (no `HELPER_SIGNING_SECRET`
  fallback), and `Sec-WebSocket-Protocol` token/key extraction.
- `scripts/test-helper-pairing.mjs` — **53/0**, including the updated subprotocol
  source-checks.
- `grep` — no engine/session/helper token remains in any URL or query string.

## Operational notes for the merge

- No env changes are required to deploy: the keyring bootstraps from the existing
  `HELPER_SIGNING_SECRET` (kid `k1`). Set `TOKEN_SIGNING_KEYS` / `TOKEN_SIGNING_ACTIVE_KID`
  only when performing the first rotation (`docs/key-rotation.md`).
- The migration adds one table (`used_engine_tokens`); it runs idempotently via the
  existing `scripts/migrate.mjs` build step.
- The engine (Cloudflare Worker) must be redeployed together with the app so the
  subprotocol/header carriage and `INTERNAL_SHARED_SECRET`-only bearer match on both
  sides. (Engine deploy is the orchestrator's to perform — not done here.)
