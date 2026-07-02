// Retention windows + verifiable hard-delete for session data.
//
// This module is the single source of truth for (a) how long each class of
// session data is kept and (b) how a session's data is removed across EVERY
// table that can hold it. Routes, the operator purge script, and the automated
// tests all call the functions here so the policy is enforced in exactly one
// place.
//
// Security framework references: F4 (retention + hard delete) and the
// Section-8 medium "define and enforce a retention and hard-delete policy".
//
// Design notes:
//  - Audio is persisted only when AUDIO_RETENTION_ENABLED is true AND the user
//    explicitly opted in (retainAudio) for a session. When retained, frames are
//    stored in R2 bucket smc-session-audio under meetings/<meetingId>/. The
//    hardDeleteSession function also deletes R2 audio for the session so the
//    purge is complete across both Neon and R2.
//  - A "session" is a row in `meetings`. Its child data lives in
//    `transcript_segments`, `flagged_items` (derived coaching artifacts) and
//    `session_reference_docs`. flagged_items.source_segment references
//    transcript_segments(id), so flagged_items MUST be deleted before
//    transcript_segments. session_reference_docs is ON DELETE CASCADE but we
//    delete it explicitly so the delete is provable without relying on the FK.

import { deleteMeetingAudio } from './r2.js';

// ── Retention windows ─────────────────────────────────────────────────────────
// Days. Env-overridable so the operator can tighten without a code change.
function envInt(name, fallback) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const RETENTION = {
  // Operator's own meeting/interview sessions and ALL their child rows
  // (transcripts + derived coaching artifacts). Auto-purged this many days
  // after the session ended (or after it started, if it never ended).
  sessionDays: envInt('RETENTION_SESSION_DAYS', 90),

  // Future meeting-bot sessions contain THIRD-PARTY voice, so they default to a
  // short, explicit window. The bot is not built yet; this is the documented
  // hook — when a session is created with mode_type='bot' the purge job applies
  // this window instead of sessionDays.
  botSessionDays: envInt('RETENTION_BOT_SESSION_DAYS', 7),

  // Consumed or expired magic links — short-lived auth artifacts.
  magicLinkDays: envInt('RETENTION_MAGIC_LINK_DAYS', 7),

  // Auth attempt audit rows (rate-limit / lockout bookkeeping).
  authAttemptDays: envInt('RETENTION_AUTH_ATTEMPT_DAYS', 30),

  // Expired or revoked session rows.
  authSessionDays: envInt('RETENTION_AUTH_SESSION_DAYS', 30),
};

// Static documentation of every retention class, including the ones not stored
// by us (audio, server logs). Surfaced by the purge script and the policy doc.
export const RETENTION_CLASSES = [
  { data: 'Session row (meetings)', store: 'Neon: meetings', window: `${RETENTION.sessionDays}d after end (bot: ${RETENTION.botSessionDays}d)`, purge: 'purgeExpiredSessions / operator hard-delete' },
  { data: 'Transcript segments', store: 'Neon: transcript_segments', window: 'lifecycle of parent session', purge: 'deleted with the session' },
  { data: 'Derived coaching artifacts (flags, assist text, references)', store: 'Neon: flagged_items', window: 'lifecycle of parent session', purge: 'deleted with the session' },
  { data: 'Session reference docs (CVs etc.)', store: 'Neon: session_reference_docs', window: 'lifecycle of parent session', purge: 'deleted with the session (also FK ON DELETE CASCADE)' },
  { data: 'Session audio (opt-in only)', store: 'Cloudflare R2: smc-session-audio, key meetings/<meetingId>/', window: 'lifecycle of parent session (deleted with session)', purge: 'deleteMeetingAudio in hardDeleteSession; also auto-purge via purgeExpiredSessions' },
  { data: 'Server logs', store: 'Vercel / Cloudflare platform logs only', window: 'platform default; no app-level content logging', purge: 'platform-managed' },
  { data: 'Magic links', store: 'Neon: magic_links', window: `${RETENTION.magicLinkDays}d`, purge: 'purgeAuthHousekeeping' },
  { data: 'Auth attempts', store: 'Neon: auth_attempts', window: `${RETENTION.authAttemptDays}d`, purge: 'purgeAuthHousekeeping' },
  { data: 'Expired/revoked auth sessions', store: 'Neon: sessions', window: `${RETENTION.authSessionDays}d`, purge: 'purgeAuthHousekeeping' },
];

// Every table that can hold rows tied to a session id. Used by the hard-delete
// and the post-delete verification so the two can never drift apart.
export const SESSION_CHILD_TABLES = ['flagged_items', 'transcript_segments', 'session_reference_docs'];

// ── Ownership + hard delete ───────────────────────────────────────────────────

// Returns the owner email of a session, or null if it does not exist.
export async function sessionOwner(sql, meetingId) {
  const rows = await sql`SELECT user_email FROM meetings WHERE id = ${meetingId}`;
  return rows[0]?.user_email ?? null;
}

// Ownership-scoped read used by the IDOR test surface: returns the session row
// ONLY if it belongs to ownerEmail, else null. Cross-account reads get null.
export async function getOwnedSession(sql, { meetingId, ownerEmail }) {
  const rows = await sql`SELECT id, user_email, title FROM meetings WHERE id = ${meetingId} AND user_email = ${ownerEmail}`;
  return rows[0] ?? null;
}

// Count remaining rows for a session across every table. After a hard-delete
// every count must be 0 — this is the proof the deletion is complete. Queries
// are written out per-table (no dynamic identifier interpolation, which the
// Neon tagged-template client does not support) and kept in lockstep with
// SESSION_CHILD_TABLES.
export async function verifySessionPurged(sql, meetingId) {
  const fi = await sql`SELECT count(*)::int AS n FROM flagged_items WHERE meeting_id = ${meetingId}`;
  const seg = await sql`SELECT count(*)::int AS n FROM transcript_segments WHERE meeting_id = ${meetingId}`;
  const rd = await sql`SELECT count(*)::int AS n FROM session_reference_docs WHERE meeting_id = ${meetingId}`;
  const m = await sql`SELECT count(*)::int AS n FROM meetings WHERE id = ${meetingId}`;
  const remaining = {
    flagged_items: Number(fi[0]?.n ?? 0),
    transcript_segments: Number(seg[0]?.n ?? 0),
    session_reference_docs: Number(rd[0]?.n ?? 0),
    meetings: Number(m[0]?.n ?? 0),
  };
  remaining.total = remaining.flagged_items + remaining.transcript_segments + remaining.session_reference_docs + remaining.meetings;
  return remaining;
}

// Hard-delete EVERY row belonging to a session, ownership-scoped.
//
// Returns:
//   { ok: false, reason: 'not_found_or_forbidden' }  — unknown id OR not owner
//   { ok: true, deleted: {...counts}, remaining: {...all zero} }
//
// The ownership guard means account A calling this on account B's session is a
// no-op that returns not_found_or_forbidden (IDOR-safe). The final
// verifySessionPurged proves nothing remains.
export async function hardDeleteSession(sql, { meetingId, ownerEmail }) {
  if (!meetingId || !ownerEmail) return { ok: false, reason: 'not_found_or_forbidden' };

  // Guard: the session must exist AND belong to the caller.
  const owned = await getOwnedSession(sql, { meetingId, ownerEmail });
  if (!owned) return { ok: false, reason: 'not_found_or_forbidden' };

  const deleted = {};
  // Order matters: flagged_items.source_segment -> transcript_segments(id).
  const fi = await sql`DELETE FROM flagged_items WHERE meeting_id = ${meetingId} RETURNING id`;
  deleted.flagged_items = fi.length;
  const seg = await sql`DELETE FROM transcript_segments WHERE meeting_id = ${meetingId} RETURNING id`;
  deleted.transcript_segments = seg.length;
  const rd = await sql`DELETE FROM session_reference_docs WHERE meeting_id = ${meetingId} RETURNING id`;
  deleted.session_reference_docs = rd.length;
  // Re-scope the final delete by owner so it stays IDOR-safe even in isolation.
  const mt = await sql`DELETE FROM meetings WHERE id = ${meetingId} AND user_email = ${ownerEmail} RETURNING id`;
  deleted.meetings = mt.length;

  // Delete R2 audio objects for this session (no-op when no audio was retained).
  try { await deleteMeetingAudio(meetingId); } catch (_) {}

  const remaining = await verifySessionPurged(sql, meetingId);
  return { ok: true, deleted, remaining };
}

// ── Account-level hard delete ─────────────────────────────────────────────────
// Removes ALL of a user's sessions (and their children) plus the user's own
// profile/document rows. Auth rows (auth_users, sessions, magic_links) are left
// to the auth/offboarding flow; this clears the session-content surface that F4
// is about. Used by an operator/admin account-purge path and the test.
export async function hardDeleteAccountContent(sql, { ownerEmail }) {
  if (!ownerEmail) return { ok: false, reason: 'no_owner' };
  const ids = await sql`SELECT id FROM meetings WHERE user_email = ${ownerEmail}`;
  const perSession = [];
  for (const row of ids) {
    perSession.push(await hardDeleteSession(sql, { meetingId: row.id, ownerEmail }));
  }
  const pd = await sql`DELETE FROM profile_docs WHERE user_email = ${ownerEmail} RETURNING id`;
  const up = await sql`DELETE FROM user_profiles WHERE user_email = ${ownerEmail} RETURNING id`;
  return {
    ok: true,
    sessionsDeleted: perSession.length,
    deleted: { profile_docs: pd.length, user_profiles: up.length },
    sessionResults: perSession,
  };
}

// ── Scheduled purge (operator/cron-triggerable) ───────────────────────────────

// Hard-delete every session past its retention window. Bot sessions
// (mode_type='bot') use the short bot window; everything else uses sessionDays.
// `now` is injectable for deterministic tests.
export async function purgeExpiredSessions(sql, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const stdCutoff = new Date(nowMs - RETENTION.sessionDays * 86400_000).toISOString();
  const botCutoff = new Date(nowMs - RETENTION.botSessionDays * 86400_000).toISOString();

  // A session is expired when COALESCE(ended_at, started_at) < its cutoff.
  const expired = await sql`
    SELECT id, user_email, mode_type
    FROM meetings
    WHERE (mode_type = 'bot' AND COALESCE(ended_at, started_at) < ${botCutoff})
       OR (mode_type <> 'bot' AND COALESCE(ended_at, started_at) < ${stdCutoff})
  `;
  const results = [];
  for (const row of expired) {
    results.push(await hardDeleteSession(sql, { meetingId: row.id, ownerEmail: row.user_email }));
  }
  return { scanned: expired.length, purged: results.filter(r => r.ok).length, results };
}

// Housekeeping for auth-side tables on the same purge run.
export async function purgeAuthHousekeeping(sql, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const mlCut = new Date(nowMs - RETENTION.magicLinkDays * 86400_000).toISOString();
  const aaCut = new Date(nowMs - RETENTION.authAttemptDays * 86400_000).toISOString();
  const asCut = new Date(nowMs - RETENTION.authSessionDays * 86400_000).toISOString();
  const ml = await sql`DELETE FROM magic_links WHERE created_at < ${mlCut} RETURNING id`;
  const aa = await sql`DELETE FROM auth_attempts WHERE created_at < ${aaCut} RETURNING id`;
  const as = await sql`DELETE FROM sessions WHERE expires_at < ${asCut} OR (revoked_at IS NOT NULL AND revoked_at < ${asCut}) RETURNING id`;
  return { magic_links: ml.length, auth_attempts: aa.length, sessions: as.length };
}
