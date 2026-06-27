# Job report — job-smcbot-4

**Bot build 3/N: sealed, independently-verifiable consent evidence record — synthetic-only, feature-flag OFF**

Author: ali@khan.vg · Branch: `worker/job-smcbot-4` → **PR to `main`** (open, not merged — orchestrator reviews and merges). Continues the bot track after build 1/N (PR #5, merged) and build 2/N (PR #7, merged).

Committed architecture honoured: **self-hosted** (not a managed Recall.ai-class API); **provider-adapter** so platforms are pluggable; the real Zoom Meeting SDK adapter remains a later increment (needs operator Zoom credentials + a Linux host). Keyless; no audio retention beyond policy; **no real third-party data, no real meeting joins, no `/bot/ws` route** in this increment.

## What this increment delivers

The `ConsentGate` (build 1/N) produces a verifiable **consent evidence record** — the basis for capturing third parties: timestamp, exact confirmation text, disclosure method, meeting reference, and the live participant join/leave log, with **no audio and no transcript**. Until now that record was an in-memory object that went nowhere.

SMC's repeated core principle is that the system is **never taken at its word**: that record must be independently re-verifiable *after the fact*, by a human or another system, including detecting any tampering with the persisted artefact. This increment adds the seal-and-verify layer that makes the record persistable and auditable — the contract the future consent-UI / evidence-persistence increment will store against.

### New module — `bot/src/evidence-record.js` (pure, offline, no flag, no socket, no app change)
- **`canonicalize(value)`** — deterministic JSON: object keys sorted recursively, array order preserved, primitives JSON-encoded. **Total** — throws on any value JSON cannot faithfully reproduce (`undefined`, functions, symbols, non-finite numbers) or that would loop (circular refs), so a successful canonicalisation always round-trips and always hashes the same.
- **`sha256Hex(input)`** — synchronous SHA-256 → hex via `node:crypto` (matches `credential.js`, keeping one crypto dependency in the bot package).
- **`chainParticipantLog(log)`** — a **hash chain** over the roster. Each entry's hash folds in the previous one (`hash = sha256(prevHash + '|' + canonical(core))`, seeded by a fixed `GENESIS_HASH`), so deleting, inserting, reordering, or editing any join/leave event cascades to every later hash and the chain `head`, localising *where* tampering occurred.
- **`sealEvidence(evidence, {sealedBy, clock})`** — wraps the record into `{schema:'smc-bot-consent-evidence', version:1, sealedAt, sealedBy, evidence, participantLogChain, contentHash}`, where `contentHash = sha256(canonical(body))` over everything except the hash itself. Deterministic: identical evidence → identical content hash.
- **`verifyEvidenceRecord(sealed)`** — the "another system can re-verify it" half. Pure and total (never throws); returns `{valid, reasons[]}`. It recomputes the content hash **and** re-derives the participant-log chain from the human-readable log, comparing both to the stored chain, so tampering with the evidence, the chain, or the seal metadata is caught and the failing roster position is named.

### Runtime hand-off — additive, `bot/src/index.js`
`BotRuntime.sealConsentEvidence({clock})` returns the sealed record for its consent gate (or `null` if none) under the bot identity (`SMC Recording Bot`). This is the clean integration point the future persistence increment will call; it opens no socket, flips no flag, and adds no audio/transcript.

## Safety invariants (unchanged from builds 1–2/N)
- Flag `BOT_CAPTURE_ENABLED` still ships `"false"`; only `"true"`/`"1"` enable the dormant branch. **This increment did not touch the flag, the engine, or `wrangler.toml`.**
- **No `/bot/ws` route** is exposed — nothing real can connect to the engine.
- Both hard gates (`REAL_CAPTURE_IMPLEMENTED = false`, engine + runtime) still refuse any non-synthetic frame.
- **Tighter scope than builds 1–2/N:** changes are confined to **`bot/` + `scripts/` + `package.json`** — **no `app/` and no `worker/` files touched at all**, so `next build` and the engine bundle are unaffected and not re-run.

## Build / checks
- `npm run test:bot` → synthetic **31/0** + envelope **31/0** + **evidence-record 41/0**, all passed. The evidence-record suite covers:
  - canonicalisation: key-order independence, array-order preservation, primitive encoding, and totality (rejects NaN/`undefined`/functions/circular);
  - `sha256Hex` against the published `"abc"` vector and `node:crypto`; the documented `GENESIS_HASH` seed;
  - chain: one entry per event, genesis link, prev→hash links, head correctness, determinism, empty-log head, and the edit-cascade property;
  - seal: schema/version, `sealedAt`/`sealedBy`, 64-hex content hash, human-readable evidence retained, **structural no-audio/transcript/frame check** (walks the object for binary values and data-bearing keys — a substring scan would false-positive on the disclosure prose, which legitimately uses the word "audio"), and determinism;
  - verify: success, JSON serialise/parse round-trip, and tamper detection for a flipped `affirmed`, a deleted roster event, a reordered roster, a doctored chain head, and a dual log+chain edit; plus structural rejects (`unknown_schema`/`unsupported_version`/non-object) returned, not thrown;
  - integration: `BotRuntime.sealConsentEvidence()` over a real synthetic session (two joins + two leaves) verifies, seals under the bot identity, and returns `null` with no gate.
- `node --check` → clean on all changed/new JS files.
- Zero new dependencies; no lockfile churn.

## Delivery notes
- Branched cleanly off `main` at the PR #7 merge (`2a4a6b9`). Working tree was clean at start.
- **Nothing real runs.** The flag is off, there is no `/bot/ws` route, both guards hard-refuse non-synthetic capture, and this increment adds only a pure serialise/seal/verify module plus a thin runtime accessor exercised entirely by offline tests.

## Out of scope this increment (next, all gated behind the consent + final security review before any real participant audio)
1. Real **Zoom Meeting SDK** adapter binary that carries the build-2/N envelope — operator Zoom Marketplace SDK credentials + a Linux host + the real `/bot/ws` engine route with bot-credential auth.
2. Wire the bot credential mint/validate into the app internal endpoints against `used_engine_tokens`.
3. In-product consent UI + **persistence** of the consent evidence record — which will store the now-sealable record produced here.
4. Bot session lifecycle in the cockpit.

## Delivery
- Branch `worker/job-smcbot-4`, commit authored ali@khan.vg.
- PR to base `main`, **open, not merged** — orchestrator reviews and merges.
