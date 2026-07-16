# SMC Engine (smc-engine) — maintenance notes and invariants

Read this before modifying `worker/src/session-do.js` or anything on the audio
path. It exists because a subtle change here caused a production cost incident.

## Billing model you must respect

Cloudflare bills **every** Durable Object storage operation (`get`/`put`/`list`/
`delete`) as SQLite rows read or written. The free tier ceiling is **5,000,000
rows read per day**; past it, reads error until 00:00 UTC and live sessions
degrade. Storage calls on a per-audio-frame path therefore multiply into
millions of billed rows very fast: audio frames arrive several times per second
per session.

## The load-bearing rule: never touch DO storage on the audio hot path

`SessionDO.webSocketMessage` runs once per inbound audio frame. It MUST NOT call
`this.state.storage.get/put/list/delete` on that path.

Historic bug (fixed): the binary branch called `_loadState()` (a 12-key get)
**plus** a second 5-key `storage.get(...)`, ~17 row reads per frame, which
tripped the daily ceiling.

## The pattern that replaced it (keep this shape)

Session state is the 12 keys: `managed, capturing, status, mode, lang, engine,
epoch, activeHelperId, captureStartedAt, graceUntil, meetingId, retainAudio`.

- **Hydrate once.** The constructor loads all 12 keys into `this._cache` inside
  `state.blockConcurrencyWhile(...)`. The runtime awaits that before delivering
  any message or alarm, so the cache is always populated when a handler runs.
  A `_loadState()` lazy fallback re-hydrates if `_hydrated` is somehow false.
- **Read from memory.** `_loadState()` returns a shallow copy of `this._cache`.
  The audio path derives `mode/lang/engine/meetingId/retainAudio` from that copy,
  never from storage.
- **Write through one door.** `_persist(patch)` is the ONLY writer. It does
  `storage.put(patch)` AND `Object.assign(this._cache, patch)` so cache and
  storage stay in lock-step. It is called only on real transitions: control
  start/stop/resume, config change, helper election, browser-close grace, and
  suspend. Never per frame.
- **Storage is the source of truth across eviction only.** A DO instance is
  single-threaded and its memory persists for the instance lifetime, so caching
  is safe. On eviction the constructor rebuilds the cache from storage.

Invariants to preserve if you touch this file:
1. Zero `storage.get/put` calls reachable from a single audio frame. Verify by
   grep: the only `this.state.storage.get(` in the file should be inside
   `_readStateFromStorage()` (the one hydration read).
2. Every state write goes through `_persist`, never a raw `this.state.storage.put`.
3. Callers may mutate the object returned by `_loadState()` locally (it is a
   copy); that must never be relied on to persist — persistence is `_persist`'s
   job.
4. `setAlarm()` is billed as one row written. Do not add alarm churn; the alarm
   reads from the cache and only persists fields it actually changes.
5. The alarm's grace/hard-cap suspend logic and helper election must keep their
   existing behaviour; only the source of reads changed in the 2026-07 fix.

## Audio retention to R2 is a per-frame WRITE path — keep it off unless deliberate

When `AUDIO_RETENTION_ENABLED` is `"true"` AND a session opted in AND a meetingId
is present, `_retainAudioFrame` writes the raw frame to the `SESSION_AUDIO` R2
bucket **once per frame**. That is a per-frame R2 Class A operation (cost) and a
data-retention / GDPR decision, separate from the rows-read concern. It ships
OFF by default (`wrangler.toml` var) and is gated by per-session consent. If you
enable it, buffer/batch frames rather than writing one object per frame.

## Deploy

Deploy with wrangler from `worker/` using the SMC-exclusive Cloudflare token for
the SMC account (account_id in `wrangler.toml`), never a global/shared token.
Sanity-check the token first with `wrangler r2 bucket list`; an auth failure
there means the wrong or a stale token was sourced — fix the token, do not
proceed. After deploy, confirm the drop in
`durableObjectsPeriodicGroups.rowsRead` in Cloudflare analytics.
