// ---------------------------------------------------------------------------
// Consent evidence record — canonical serialisation + tamper-evident seal
// (Bot build 3/N)
// ---------------------------------------------------------------------------
//
// The ConsentGate (consent.js) produces an in-memory evidence() object: the
// timestamp, the exact confirmation, the disclosure method, the meeting
// reference, and the live participant join/leave log. SMC's core principle is
// that the system is "never taken at its word" — that basis-for-capture record
// must be independently re-verifiable AFTER the fact, by a human or another
// system, including detecting any later tampering with the persisted artefact.
//
// This module turns the evidence() object into a SEALED record fit for
// persistence and independent review:
//
//   • canonicalize()        — deterministic JSON (recursively sorted object
//                             keys, array order preserved) so equal records
//                             always serialise identically and hash the same.
//   • sha256Hex()           — synchronous SHA-256, matching credential.js's use
//                             of node:crypto.
//   • chainParticipantLog() — a hash chain over the roster so deleting,
//                             inserting, or reordering a join/leave event breaks
//                             the chain at a localisable point.
//   • sealEvidence()        — wraps the evidence in {schema, version, sealedAt,
//                             sealedBy, evidence, participantLogChain,
//                             contentHash}.
//   • verifyEvidenceRecord() — recomputes the content hash and re-derives the
//                             chain, returning { valid, reasons[] }. This is the
//                             "another system can re-verify it" half.
//
// It contains NO audio and NO transcript — exactly like the evidence() object it
// seals. It performs no network I/O and is fully offline-testable. It does not
// flip any flag and is not wired into the live app: persisting the sealed record
// (and the consent UI that produces it) is a later, gated increment.

import crypto from 'node:crypto';

export const EVIDENCE_SCHEMA = 'smc-bot-consent-evidence';
export const EVIDENCE_VERSION = 1;

// Synchronous SHA-256 → lowercase hex. node:crypto matches credential.js so the
// bot package keeps a single crypto dependency and stays offline-deterministic.
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Genesis seed for the participant-log hash chain. A fixed, domain-separated
// constant so an empty log has a well-defined head and chains are reproducible.
export const GENESIS_HASH = sha256Hex('smc-bot-consent-evidence/v1/genesis');

// Deterministic JSON serialisation: object keys sorted recursively, array order
// preserved, primitives JSON-encoded. The function is TOTAL — it throws on any
// value that JSON cannot reproduce faithfully (undefined, functions, symbols,
// non-finite numbers) or that would loop (circular refs), so a successful
// canonicalisation always round-trips and always hashes the same.
export function canonicalize(value) {
  const seen = new Set();
  function enc(v) {
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'number') {
      if (!Number.isFinite(v)) throw new Error('canonicalize: non-finite number');
      return JSON.stringify(v);
    }
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return JSON.stringify(v);
    if (t === 'bigint') throw new Error('canonicalize: bigint not supported');
    if (t === 'undefined' || t === 'function' || t === 'symbol') {
      throw new Error('canonicalize: unsupported value of type ' + t);
    }
    if (t === 'object') {
      if (seen.has(v)) throw new Error('canonicalize: circular reference');
      seen.add(v);
      let out;
      if (Array.isArray(v)) {
        out = '[' + v.map((x) => enc(x)).join(',') + ']';
      } else {
        const keys = Object.keys(v).sort();
        out = '{' + keys.map((k) => JSON.stringify(k) + ':' + enc(v[k])).join(',') + '}';
      }
      seen.delete(v);
      return out;
    }
    throw new Error('canonicalize: unsupported value of type ' + t);
  }
  return enc(value);
}

// Hash-chain a participant log (array of {participantId, displayName?, event, at}).
// Each entry is reproduced with its original fields plus {seq, prevHash, hash},
// where hash = sha256Hex(prevHash + '|' + canonicalize(coreFields)). prevHash of
// the first entry is GENESIS_HASH. Returns { entries, head }; head is the last
// entry's hash (or GENESIS_HASH for an empty log). Because each hash folds in the
// previous one, any deletion/insertion/reorder/edit cascades to every later hash
// and to the head, which the verifier localises.
export function chainParticipantLog(log) {
  const src = Array.isArray(log) ? log : [];
  const entries = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < src.length; i++) {
    const core = src[i];
    const hash = sha256Hex(prevHash + '|' + canonicalize(core));
    entries.push({ ...core, seq: i, prevHash, hash });
    prevHash = hash;
  }
  return { entries, head: prevHash };
}

// Strip the chain-bookkeeping fields from a chained entry to recover the original
// roster core, so the verifier can re-derive the chain from either the chain
// entries or the human-readable participantLog and compare.
function coreOf(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const { seq, prevHash, hash, ...core } = entry;
  return core;
}

/**
 * Seal a ConsentGate.evidence() object into a verifiable, persistable record.
 * @param {Object} evidence  The output of ConsentGate.evidence().
 * @param {Object} [opts]
 * @param {string} [opts.sealedBy] Who/what sealed it (e.g. the bot identity).
 * @param {() => number} [opts.clock] Injectable clock (epoch ms).
 * @returns {Object} the sealed record.
 */
export function sealEvidence(evidence, { sealedBy = 'SMC Recording Bot', clock } = {}) {
  if (!evidence || typeof evidence !== 'object') throw new Error('sealEvidence: evidence object required');
  const sealedAt = typeof clock === 'function' ? clock() : Date.now();
  const participantLogChain = chainParticipantLog(evidence.participantLog || []);
  const body = {
    schema: EVIDENCE_SCHEMA,
    version: EVIDENCE_VERSION,
    sealedAt,
    sealedBy,
    evidence,
    participantLogChain,
  };
  // contentHash covers the entire body (which includes the chain), so any edit to
  // the evidence, the chain, or the seal metadata is detectable. The hash itself
  // is added alongside, never inside, the hashed body.
  const contentHash = sha256Hex(canonicalize(body));
  return { ...body, contentHash };
}

/**
 * Independently re-verify a sealed evidence record.
 * Pure and total: never throws; returns { valid, reasons[] }. reasons is empty
 * on success and otherwise enumerates each integrity failure for human review.
 * @param {Object} sealed
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function verifyEvidenceRecord(sealed) {
  const reasons = [];
  if (!sealed || typeof sealed !== 'object' || Array.isArray(sealed)) {
    return { valid: false, reasons: ['not_an_object'] };
  }
  if (sealed.schema !== EVIDENCE_SCHEMA) reasons.push('unknown_schema');
  if (sealed.version !== EVIDENCE_VERSION) reasons.push('unsupported_version');
  for (const f of ['sealedAt', 'sealedBy', 'evidence', 'participantLogChain', 'contentHash']) {
    if (!(f in sealed)) reasons.push('missing_field:' + f);
  }
  // If structurally broken, stop here — the hash checks below would be noise.
  if (reasons.length > 0) return { valid: false, reasons };

  // 1. Content hash: recompute over the body (everything except contentHash).
  const { contentHash, ...body } = sealed;
  let recomputed;
  try { recomputed = sha256Hex(canonicalize(body)); }
  catch { return { valid: false, reasons: ['content_not_canonicalisable'] }; }
  if (recomputed !== contentHash) reasons.push('content_hash_mismatch');

  // 2. Participant-log chain: re-derive from the human-readable log and compare
  //    to the stored chain, so tampering with either side is caught and the
  //    failing position is localised.
  const log = (sealed.evidence && Array.isArray(sealed.evidence.participantLog))
    ? sealed.evidence.participantLog : [];
  const storedChain = sealed.participantLogChain || {};
  const storedEntries = Array.isArray(storedChain.entries) ? storedChain.entries : [];
  let rederived;
  try { rederived = chainParticipantLog(log); }
  catch { return { valid: false, reasons: reasons.concat('participant_log_not_canonicalisable') }; }

  if (rederived.entries.length !== storedEntries.length) {
    reasons.push('participant_log_length_mismatch');
  } else {
    for (let i = 0; i < rederived.entries.length; i++) {
      const a = rederived.entries[i];
      const b = storedEntries[i];
      if (!b || a.hash !== b.hash || a.prevHash !== b.prevHash ||
          canonicalize(coreOf(a)) !== canonicalize(coreOf(b))) {
        reasons.push('participant_log_chain_broken_at_seq_' + i);
        break;
      }
    }
  }
  if (rederived.head !== storedChain.head) reasons.push('participant_log_head_mismatch');

  return { valid: reasons.length === 0, reasons };
}
