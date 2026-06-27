// Consent evidence-record sealing test (Bot build 3/N).
//
// Proves, fully offline (no network, no real meeting joins, no Workers AI), that
// a ConsentGate's verifiable evidence record can be CANONICALLY SERIALISED,
// SEALED with a content hash and a hash-chained participant log, and then
// INDEPENDENTLY RE-VERIFIED by another system — directly serving SMC's core
// principle that the system is "never taken at its word".
//
// This increment is still synthetic-only, the engine bot flag stays OFF, there
// is no /bot/ws route, and nothing real runs: it only adds a pure, offline
// serialise/seal/verify module under bot/ plus a thin BotRuntime accessor.
//
// Run: node scripts/test-bot-evidence-record.mjs   (also part of `npm run test:bot`)

import crypto from 'node:crypto';

import {
  canonicalize,
  sha256Hex,
  chainParticipantLog,
  sealEvidence,
  verifyEvidenceRecord,
  EVIDENCE_SCHEMA,
  EVIDENCE_VERSION,
  GENESIS_HASH,
} from '../bot/src/evidence-record.js';
import { ConsentGate, DISCLOSURE_METHODS } from '../bot/src/consent.js';
import { FakeAdapter } from '../bot/src/fake-adapter.js';
import { BotRuntime } from '../bot/src/index.js';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
}
function section(t) { console.log('\n' + t); }

const clock = () => 1_750_000_000_000; // fixed epoch ms for deterministic seals

// Build an affirmed gate with a scripted roster, deterministic throughout.
function affirmedGate() {
  const g = new ConsentGate({ operator: 'ali@pacific.london', meetingRef: 'meet-abc-123', clock });
  g.affirm({ confirmationText: 'I confirm all parties consent', disclosureMethod: DISCLOSURE_METHODS.IN_MEETING_ANNOUNCEMENT });
  g.recordJoin('p-1', 'Alice (Interviewer)');
  g.recordJoin('p-2', 'Bob (Candidate)');
  g.recordLeave('p-2');
  return g;
}

await (async function main() {
  // ── 1. canonicalize — deterministic, key-order independent, total ────────────
  section('Test 1: canonicalize is deterministic and key-order independent');

  const a = canonicalize({ b: 1, a: 2, nested: { y: [3, 2, 1], x: 'k' } });
  const b = canonicalize({ nested: { x: 'k', y: [3, 2, 1] }, a: 2, b: 1 });
  ok(a === b, 'same content with different key insertion order canonicalises identically');
  ok(a === '{"a":2,"b":1,"nested":{"x":"k","y":[3,2,1]}}', 'object keys sorted, array order preserved');
  ok(canonicalize([{ b: 1, a: 2 }, { d: 4, c: 3 }]) === '[{"a":2,"b":1},{"c":3,"d":4}]', 'arrays of objects canonicalise element-wise with sorted keys');
  ok(canonicalize(null) === 'null' && canonicalize(true) === 'true' && canonicalize('x') === '"x"', 'primitives encode as JSON');

  let threw = false; try { canonicalize({ x: NaN }); } catch { threw = true; }
  ok(threw, 'rejects non-finite numbers (NaN) so serialisation stays reproducible');
  threw = false; try { canonicalize({ x: undefined }); } catch { threw = true; }
  ok(threw, 'rejects undefined values');
  threw = false; try { canonicalize({ x: () => 1 }); } catch { threw = true; }
  ok(threw, 'rejects functions');
  threw = false; const circ = {}; circ.self = circ; try { canonicalize(circ); } catch { threw = true; }
  ok(threw, 'rejects circular references');

  // ── 2. sha256Hex — stable, matches node:crypto ───────────────────────────────
  section('Test 2: sha256Hex matches a known vector and node:crypto');

  ok(sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256Hex("abc") matches the published vector');
  const ref = crypto.createHash('sha256').update('smc-bot').digest('hex');
  ok(sha256Hex('smc-bot') === ref, 'sha256Hex agrees with node:crypto');
  ok(GENESIS_HASH === sha256Hex('smc-bot-consent-evidence/v1/genesis'), 'GENESIS_HASH is the documented genesis seed');

  // ── 3. chainParticipantLog — tamper-evident hash chain over the roster ────────
  section('Test 3: chainParticipantLog hash-chains the participant log');

  const log = affirmedGate().evidence().participantLog;
  const chain = chainParticipantLog(log);
  ok(chain.entries.length === 3, 'chain has one entry per roster event');
  ok(chain.entries[0].seq === 0 && chain.entries[0].prevHash === GENESIS_HASH, 'first entry chains from the genesis hash');
  ok(chain.entries[1].prevHash === chain.entries[0].hash && chain.entries[2].prevHash === chain.entries[1].hash, 'each entry links to the previous entry hash');
  ok(chain.head === chain.entries[2].hash, 'head is the last entry hash');
  ok(chain.entries.every((e) => e.participantId && e.event), 'chained entries preserve the human-readable roster fields');
  ok(canonicalize(chainParticipantLog(log)) === canonicalize(chain), 'chaining is deterministic for the same input');
  const empty = chainParticipantLog([]);
  ok(empty.entries.length === 0 && empty.head === GENESIS_HASH, 'empty log head is the genesis hash');

  // changing one event changes that entry hash AND every hash after it
  const log2 = log.map((e, i) => (i === 1 ? { ...e, participantId: 'p-EVIL' } : e));
  const chain2 = chainParticipantLog(log2);
  ok(chain2.entries[0].hash === chain.entries[0].hash, 'unchanged earlier entry keeps its hash');
  ok(chain2.entries[1].hash !== chain.entries[1].hash && chain2.head !== chain.head, 'editing one event cascades to all later hashes and the head');

  // ── 4. sealEvidence — shape, seal, and NO audio/transcript leakage ────────────
  section('Test 4: sealEvidence wraps the record and never leaks audio/transcript');

  const sealed = sealEvidence(affirmedGate().evidence(), { sealedBy: 'SMC Recording Bot', clock });
  ok(sealed.schema === EVIDENCE_SCHEMA && sealed.version === EVIDENCE_VERSION, 'sealed record carries the schema + version');
  ok(sealed.sealedAt === clock() && sealed.sealedBy === 'SMC Recording Bot', 'sealed record records when and by whom it was sealed');
  ok(typeof sealed.contentHash === 'string' && sealed.contentHash.length === 64, 'sealed record carries a 64-hex content hash');
  ok(sealed.evidence.affirmed === true && sealed.evidence.meetingRef === 'meet-abc-123', 'sealed record keeps the human-readable evidence');
  ok(sealed.participantLogChain.head === chain.head, 'sealed participant-log chain head matches an independent chaining of the same roster');
  // The evidence contract carries NO audio/transcript DATA. Assert structurally —
  // no data-bearing key (frame/audio bytes/transcript) and no binary value anywhere.
  // (The disclosure PROSE legitimately uses the word "audio", so a substring scan
  // would be a false positive; we check keys and value types instead.)
  let leaked = null;
  (function walk(v, path) {
    if (v && typeof v === 'object') {
      if (v instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(v))) { leaked = path + ' (binary)'; return; }
      for (const k of Object.keys(v)) {
        if (/^(frame|audio|audioBytes|transcript|rawAudio)$/i.test(k)) { leaked = path + '.' + k; return; }
        walk(v[k], path + '.' + k);
      }
    }
  })(sealed, '$');
  ok(leaked === null, 'sealed record carries no audio/transcript/frame data (structural check)' + (leaked ? ' — leaked at ' + leaked : ''));
  ok(sealEvidence(affirmedGate().evidence(), { sealedBy: 'SMC Recording Bot', clock }).contentHash === sealed.contentHash, 'sealing identical evidence is deterministic (same content hash)');

  // ── 5. verifyEvidenceRecord — independent re-verification + tamper detection ──
  section('Test 5: verifyEvidenceRecord re-verifies and localises tampering');

  const good = verifyEvidenceRecord(sealed);
  ok(good.valid && good.reasons.length === 0, 'an untampered sealed record verifies');

  // round-trip through JSON (as a persisted artefact would be) still verifies
  const roundTripped = JSON.parse(JSON.stringify(sealed));
  ok(verifyEvidenceRecord(roundTripped).valid, 'verification survives a JSON serialise/parse round-trip');

  // tamper: flip the affirmation
  const t1 = JSON.parse(JSON.stringify(sealed)); t1.evidence.affirmed = false;
  const r1 = verifyEvidenceRecord(t1);
  ok(!r1.valid && r1.reasons.includes('content_hash_mismatch'), 'flipping evidence.affirmed is detected as a content-hash mismatch');

  // tamper: delete a participant-log entry (shrink the roster)
  const t2 = JSON.parse(JSON.stringify(sealed)); t2.evidence.participantLog.splice(1, 1);
  const r2 = verifyEvidenceRecord(t2);
  ok(!r2.valid && r2.reasons.some((x) => x.startsWith('participant_log')), 'deleting a roster event breaks the participant-log chain');

  // tamper: reorder two participant-log entries
  const t3 = JSON.parse(JSON.stringify(sealed));
  [t3.evidence.participantLog[0], t3.evidence.participantLog[1]] = [t3.evidence.participantLog[1], t3.evidence.participantLog[0]];
  const r3 = verifyEvidenceRecord(t3);
  ok(!r3.valid, 'reordering roster events is detected');

  // tamper: edit the chain head without touching the log
  const t4 = JSON.parse(JSON.stringify(sealed)); t4.participantLogChain.head = sha256Hex('forged');
  const r4 = verifyEvidenceRecord(t4);
  ok(!r4.valid && r4.reasons.some((x) => x.startsWith('participant_log')), 'editing the chain head alone is detected');

  // tamper: forge a chain entry hash to try to match a doctored log
  const t5 = JSON.parse(JSON.stringify(sealed));
  t5.evidence.participantLog[0].participantId = 'p-EVIL';
  t5.participantLogChain.entries[0].participantId = 'p-EVIL';
  const r5 = verifyEvidenceRecord(t5);
  ok(!r5.valid, 'editing both the log and the chain entry is still caught (content hash + recomputed chain)');

  // structural: unknown schema / unsupported version
  ok(!verifyEvidenceRecord({ ...sealed, schema: 'nope' }).valid, 'unknown schema is rejected');
  ok(!verifyEvidenceRecord({ ...sealed, version: 999 }).valid, 'unsupported version is rejected');
  ok(!verifyEvidenceRecord(null).valid && !verifyEvidenceRecord('x').valid, 'non-object input is rejected, not thrown');

  // ── 6. BotRuntime.sealConsentEvidence — integration over a synthetic run ──────
  section('Test 6: BotRuntime seals the consent evidence after a synthetic session');

  const participants = [
    { participantId: 'p-1', displayName: 'Alice (Interviewer)' },
    { participantId: 'p-2', displayName: 'Bob (Candidate)' },
  ];
  const gate = new ConsentGate({ operator: 'ali@pacific.london', meetingRef: 'meet-xyz', clock });
  gate.affirm({ confirmationText: 'all parties consent', disclosureMethod: DISCLOSURE_METHODS.BOT_DISPLAY_NAME });
  const adapter = new FakeAdapter({ participants, script: [{ participantId: 'p-1', text: 'hi' }] });
  const runtime = new BotRuntime({ adapter, consentGate: gate, credential: 'smcb1_dummy.sig', flagEnabled: true, sink: () => {} });
  await runtime.start();          // emits participant_join → recorded in the gate roster
  await adapter.replay();
  await runtime.stop();           // emits participant_leave → recorded in the gate roster

  const runtimeSealed = runtime.sealConsentEvidence({ clock });
  const rv = verifyEvidenceRecord(runtimeSealed);
  ok(rv.valid, 'runtime-sealed evidence verifies independently');
  ok(runtimeSealed.sealedBy === 'SMC Recording Bot', 'runtime seals under the bot identity');
  ok(runtimeSealed.evidence.participantLog.length === 4 && runtimeSealed.participantLogChain.entries.length === 4, 'roster captured the two joins and two leaves from the synthetic session');

  const noGate = new BotRuntime({ adapter: new FakeAdapter({}), credential: 'smcb1_x.y', sink: () => {} });
  ok(noGate.sealConsentEvidence() === null, 'a runtime with no consent gate returns null (nothing to seal)');

  // ── summary ──
  console.log('\n' + '─'.repeat(60));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('SOME TESTS FAILED ❌'); process.exit(1); }
  console.log('All tests passed ✅');
})();
