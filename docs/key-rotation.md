# Signing-key rotation (engine tokens + helper pairing keys)

Engine session tokens (`smcs1_…`) and helper pairing keys (`smc1_…`) are HMAC-signed
and now carry a key id (`kid`) in their payload. Verification selects the signing
secret by `kid`, so signing keys can be rotated without a flag day.

## Configuration

Two environment variables on the **app** (Vercel) drive the keyring. They are the
only source of signing secrets — there is no hardcoded or implicit default.

| Var | Meaning |
| --- | --- |
| `TOKEN_SIGNING_KEYS` | Comma-separated `kid:secret` pairs, e.g. `k2:9f3a…,k3:b71c…`. All listed keys are accepted for **verification**. |
| `TOKEN_SIGNING_ACTIVE_KID` | The `kid` used to **sign** new tokens/keys. Must be present in `TOKEN_SIGNING_KEYS`. |

Each secret should be ≥32 bytes of randomness, e.g. `openssl rand -base64 48`.

### Bootstrap (current deployed state)

If `TOKEN_SIGNING_KEYS` is unset, the keyring falls back to the existing
`HELPER_SIGNING_SECRET` as a single key under `kid = k1`, and signs with it. This
keeps the live system working before the first rotation. It is still explicit
configuration (an env var you set), not a default baked into the code.

> Note: `HELPER_SIGNING_SECRET` is now used **only** as the bootstrap signing seed.
> It is no longer accepted as the engine↔app transport bearer — that is exclusively
> `INTERNAL_SHARED_SECRET` (H3). The transport and signing secrets are decoupled.

## Rotation procedure (zero-downtime)

Engine tokens live ~15 minutes; helper pairing keys live until the user's
`helper_key_version` is bumped. Rotation overlaps the old and new key long enough
for old material to age out.

1. **Add the new key alongside the old.** Generate a new secret and set both keys,
   keeping the old `kid` active for now:
   ```
   TOKEN_SIGNING_KEYS = k1:<old-secret>,k2:<new-secret>
   TOKEN_SIGNING_ACTIVE_KID = k1
   ```
   Deploy. The app can now *verify* `k2` but still *signs* with `k1`. Nothing
   changes for clients.

2. **Promote the new key.** Flip the active kid:
   ```
   TOKEN_SIGNING_ACTIVE_KID = k2
   ```
   Deploy. New tokens/keys are signed with `k2`; tokens already signed with `k1`
   still verify during the overlap.

3. **Drain.** Wait for old material to expire:
   - Engine tokens: ≥15 minutes (the token TTL).
   - Helper pairing keys: until every active helper has reconnected with a `k2`
     key. Force this immediately by rotating pairing keys (Profile → Desktop
     helper → rotate, or bump `helper_key_version` for affected users), which makes
     helpers fetch a freshly-signed key.

4. **Retire the old key.** Remove it from the ring:
   ```
   TOKEN_SIGNING_KEYS = k2:<new-secret>
   ```
   Deploy. Any token/key still signed with `k1` now fails with “unknown kid”.

## Emergency revocation

- **A single app session / its engine tokens:** revoke the app session
  (`POST /api/auth/logout`, or set `sessions.revoked_at`). Engine-token validation
  checks the bound session id (`sid`) on every call, so all of that session's
  engine tokens stop validating immediately (H4).
- **A user's helper devices:** bump `helper_key_version` (Profile → Desktop helper
  → rotate). All older pairing keys for that user are rejected.
- **A leaked signing secret:** rotate the keyring (above), retiring the compromised
  `kid` as fast as the drain window allows.
