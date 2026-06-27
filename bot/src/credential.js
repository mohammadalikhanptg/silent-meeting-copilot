// ---------------------------------------------------------------------------
// Session-bound bot credential (Bot build 1/N)
// ---------------------------------------------------------------------------
//
// The bot runtime is an ISOLATED, low-privilege process: it holds NO core app or
// database credentials. The only secret it carries is a short-lived, single-use,
// session-scoped bot credential that authorises it to stream frames into ONE SMC
// session for ONE meeting on behalf of ONE operator.
//
// This deliberately MIRRORS the merged H4 engine-token model
// (app/lib/auth.js generateSessionToken / verifySessionToken and the
// used_engine_tokens replay table):
//   • HMAC-SHA256 signed, base64url payload + signature, visible prefix.
//   • bound to the issuing SMC app session (sid) → revoking that session
//     invalidates every bot credential minted for it.
//   • additionally bound to the meeting reference (mref) and operator (u).
//   • carries typ / aud / iat / exp / jti, like the engine token.
//   • single-use via jti (replay protection) — the engine equivalent is the
//     used_engine_tokens INSERT ... ON CONFLICT on the WebSocket-upgrade path.
//
// When the live capture path is wired (a later increment), minting/validation
// move into the app's internal endpoints against used_engine_tokens; this module
// is the self-contained, offline-testable reference of that contract. It is NOT
// wired into the live app in this increment (flag off, no real joins).

import crypto from 'node:crypto';

const PREFIX = 'smcb1_';
const AUD = 'smc-engine-bot';
const TYP = 'bot-capture';
const DEFAULT_TTL_SEC = 10 * 60; // short-lived

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function hmac(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}
function timingEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Mint a session-bound bot credential.
 * @param {Object} p
 * @param {string} p.operator   Operator account (email)  → bound as u.
 * @param {string} p.sid        SMC app session id         → bound as sid.
 * @param {string} p.meetingRef Meeting reference          → bound as mref.
 * @param {string} p.secret     Signing secret.
 * @param {number} [p.ttlSec]   TTL seconds (default 10 min).
 * @param {() => number} [p.clock] Injectable clock (epoch ms).
 * @returns {string} the credential string.
 */
export function mintBotCredential({ operator, sid, meetingRef, secret, ttlSec = DEFAULT_TTL_SEC, clock }) {
  if (!operator || !sid || !meetingRef) throw new Error('mintBotCredential: operator, sid and meetingRef are required');
  if (!secret) throw new Error('mintBotCredential: signing secret required');
  const now = Math.floor((typeof clock === 'function' ? clock() : Date.now()) / 1000);
  const payload = {
    u: operator,
    sid,
    mref: meetingRef,
    typ: TYP,
    aud: AUD,
    iat: now,
    exp: now + ttlSec,
    jti: crypto.randomBytes(12).toString('base64url'),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = hmac(payloadB64, secret);
  return `${PREFIX}${payloadB64}.${sig}`;
}

/**
 * Verify a bot credential against a RevocationStore + ReplayStore.
 * Returns { valid:false, reason } or { valid:true, claims }.
 * @param {string} token
 * @param {Object} opts
 * @param {string} opts.secret
 * @param {{isRevoked:(claims:Object)=>boolean}} [opts.revocation]
 * @param {{consume:(jti:string)=>boolean}} [opts.replay] consume returns false if already used.
 * @param {string} [opts.expectMeetingRef] enforce the credential is bound to this meeting.
 * @param {() => number} [opts.clock]
 */
export function verifyBotCredential(token, { secret, revocation, replay, expectMeetingRef, clock } = {}) {
  if (!secret) return { valid: false, reason: 'server misconfigured' };
  if (!token || typeof token !== 'string' || !token.startsWith(PREFIX)) return { valid: false, reason: 'malformed' };
  const rest = token.slice(PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return { valid: false, reason: 'malformed' };
  const payloadB64 = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  let claims;
  try { claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); }
  catch { return { valid: false, reason: 'malformed' }; }

  if (!timingEq(sig, hmac(payloadB64, secret))) return { valid: false, reason: 'bad_signature' };
  if (claims.typ !== TYP || claims.aud !== AUD) return { valid: false, reason: 'wrong_audience' };
  if (!claims.u || !claims.sid || !claims.mref || !claims.jti || !claims.exp) return { valid: false, reason: 'incomplete_claims' };

  const nowSec = Math.floor((typeof clock === 'function' ? clock() : Date.now()) / 1000);
  if (claims.exp < nowSec) return { valid: false, reason: 'expired' };
  if (expectMeetingRef && claims.mref !== expectMeetingRef) return { valid: false, reason: 'meeting_ref_mismatch' };

  if (revocation && typeof revocation.isRevoked === 'function' && revocation.isRevoked(claims)) {
    return { valid: false, reason: 'revoked' };
  }
  // Replay protection: each jti is accepted exactly once.
  if (replay && typeof replay.consume === 'function') {
    if (!replay.consume(claims.jti)) return { valid: false, reason: 'already_used' };
  }
  return { valid: true, claims };
}

// In-memory replay store (single-use jti). The live engine equivalent is the
// used_engine_tokens table with an ON CONFLICT DO NOTHING insert.
export class ReplayStore {
  constructor() { this._used = new Set(); }
  consume(jti) {
    if (!jti || this._used.has(jti)) return false;
    this._used.add(jti);
    return true;
  }
}

// In-memory revocation store. Revoking by sid invalidates every credential minted
// for that SMC session — the same semantics as revoking the app session in H4.
export class RevocationStore {
  constructor() { this._sids = new Set(); this._jtis = new Set(); }
  revokeSession(sid) { if (sid) this._sids.add(sid); }
  revokeCredential(jti) { if (jti) this._jtis.add(jti); }
  isRevoked(claims) {
    if (!claims) return true;
    return this._sids.has(claims.sid) || this._jtis.has(claims.jti);
  }
}
