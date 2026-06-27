# Silent Meeting Copilot — Data Retention & Deletion Policy

Owner: Pacific Technology Group (Mo Khan) · Status: implemented 25 Jun 2026 ·
Closes security-framework finding F4. Code: `app/lib/retention.js` (single source
of truth). Enforcement: `scripts/purge-retention.mjs` + `DELETE /api/meetings/[id]`.

## 1. Retention windows

All windows are env-overridable (defaults shown). Days.

| Data | Store | Default window | How it is removed |
|------|-------|----------------|-------------------|
| Session row (`meetings`) | Neon | **90 days** after `ended_at` (or `started_at` if never ended) — env `RETENTION_SESSION_DAYS` | scheduled purge or operator hard-delete |
| Future **bot** sessions (third-party voice) | Neon | **7 days** — env `RETENTION_BOT_SESSION_DAYS` | scheduled purge honours `mode_type='bot'` |
| Transcript segments (`transcript_segments`) | Neon | lifecycle of parent session | deleted with the session |
| Derived coaching artifacts (`flagged_items`: flags, assist text, references) | Neon | lifecycle of parent session | deleted with the session |
| Session reference docs / CVs (`session_reference_docs`) | Neon | lifecycle of parent session | deleted with the session (also FK `ON DELETE CASCADE`) |
| **Temporary audio chunks** | **none** | **never persisted** | n/a — see §2 |
| Server logs | Vercel / Cloudflare platform | platform default; **no app-level content logging** | platform-managed |
| Magic links (`magic_links`) | Neon | **7 days** — env `RETENTION_MAGIC_LINK_DAYS` | scheduled purge |
| Auth attempts (`auth_attempts`) | Neon | **30 days** — env `RETENTION_AUTH_ATTEMPT_DAYS` | scheduled purge |
| Expired/revoked auth sessions (`sessions`) | Neon | **30 days** — env `RETENTION_AUTH_SESSION_DAYS` | scheduled purge |

## 2. Audio is never persisted

The desktop helper streams discrete WebM audio segments to the engine over WSS.
The engine transcribes each segment in memory (`env.AI.run`) and **discards the
audio**; only the resulting **text** is returned and persisted to Neon. There is
no audio table, no audio file artifact, and no storage-service write from the AI
path. A CI grep asserts no code writes audio to disk or DB. Consequently a session
hard-delete only has to clear text rows — there is no audio to delete.

## 3. Operator-triggerable hard-delete

`DELETE /api/meetings/[id]` (authenticated, ownership-scoped) removes, in order:

1. `flagged_items` for the session (first — they reference transcript segments),
2. `transcript_segments`,
3. `session_reference_docs`,
4. the `meetings` row itself (re-scoped by owner).

It then **re-counts every table** and returns `purged: true` only when zero rows
remain. A cross-account id deletes nothing and returns 404 (IDOR-safe). The same
`hardDeleteSession` function backs the scheduled purge, so manual and automatic
deletion can never diverge. `hardDeleteAccountContent` extends this to all of a
user's sessions plus their profile docs for account offboarding.

## 4. Scheduled purge

`node scripts/purge-retention.mjs` (`npm run purge-retention`) hard-deletes every
session past its window (bot sessions use the short bot window) and runs auth-side
housekeeping. `--dry-run` reports the count without deleting. Wire it to a daily
cron (Vercel cron route or Mac cron) once real or bot data lands; until then it is
a safe no-op.

## 5. Proof

`node scripts/test-retention.mjs` seeds a session with rows in every child table,
hard-deletes it, and asserts nothing remains (`remaining.total === 0`) while a
sibling session survives; it also proves window-based purge including the short
bot window. `node scripts/test-idor.mjs` proves one account cannot read or delete
another's session/transcript/reference data. Both run offline (in-memory) for CI
and against live Neon when `DATABASE_URL` is set, and are enforced by
`.github/workflows/security.yml`.
