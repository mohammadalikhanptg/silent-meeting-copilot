// Synthetic meeting-bot ingestion test (Bot build 1/N).
//
// Proves, fully offline (synthetic audio only, no real meeting joins, no Workers
// AI), that:
//   1. A FakeAdapter's synthetic per-participant audio flows through the runtime
//      (consent gate + hard guard) and the ENGINE ingestion path to produce a
//      PARTICIPANT-LABELLED transcript, reusing the transcription seam via an
//      injected transcriber.
//   2. The hard guard refuses REAL (non-synthetic) capture in this increment,
//      and refuses it for the flag-off / consent-missing cases.
//   3. The session-bound bot credential mints, verifies, is single-use
//      (replay-protected), meeting-bound, and revocable — aligned to H4.
//   4. The engine feature flag is OFF by default and the SessionDO branch is
//      gated behind it (structural check).
//
// Run: node scripts/test-bot-synthetic.mjs   (also `npm run test:bot`)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FakeAdapter, readSynthText } from '../bot/src/fake-adapter.js';
import { ConsentGate, DISCLOSURE_METHODS } from '../bot/src/consent.js';
import { BotRuntime } from '../bot/src/index.js';
import { assertCaptureAllowed } from '../bot/src/guard.js';
import {
  mintBotCredential, verifyBotCredential, ReplayStore, RevocationStore,
} from '../bot/src/credential.js';
import {
  ingestParticipantFrame, assertBotCaptureAllowed, botCaptureEnabled, PROVENANCE,
} from '../worker/src/bot-ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); }
}
function section(t) { console.log('\n' + t); }

// A deterministic, injected "transcriber" standing in for transcribeAndClean.
// It echoes the synthetic text the FakeAdapter carried on the frame — no audio
// decoding, no network, no Workers AI.
function fakeTranscribe(audioBytes, _env, _lang, _mode) {
  // The FakeAdapter encodes the scripted text into the bytes; recover it.
  const text = readSynthText(audioBytes);
  return { raw: text, cleaned: text, provider: 'fake-test-transcriber' };
}

const clock = () => 1_750_000_000_000; // fixed epoch ms for deterministic tokens/timestamps

await (async function main() {
  // ── 1. Synthetic per-participant ingestion → participant-labelled transcript ──
  section('Test 1: synthetic per-participant audio → participant-labelled transcript');

  const participants = [
    { participantId: 'p-1', displayName: 'Alice (Interviewer)' },
    { participantId: 'p-2', displayName: 'Bob (Candidate)' },
  ];
  const script = [
    { participantId: 'p-1', text: 'Welcome, can you describe your last project?' },
    { participantId: 'p-2', text: 'I led the migration of our billing service.' },
    { participantId: 'p-1', text: 'What was the hardest part?' },
    { participantId: 'p-2', text: 'Coordinating the data backfill without downtime.' },
  ];

  const consent = new ConsentGate({ operator: 'ali@pacific.london', meetingRef: 'meet-abc-123', clock });
  consent.affirm({ confirmationText: 'I confirm all parties consent', disclosureMethod: DISCLOSURE_METHODS.IN_MEETING_ANNOUNCEMENT });

  const adapter = new FakeAdapter({ participants, script });

  // Engine-side env with the flag explicitly ON — proves the engine path works;
  // synthetic frames are allowed regardless, real frames still refused (Test 2).
  const engineEnv = { BOT_CAPTURE_ENABLED: 'true' };
  const consentState = consent.state();

  const segments = [];
  const sink = async (frame) => {
    const out = await ingestParticipantFrame(
      { env: engineEnv, frame, consentState, lang: null, mode: 'auto' },
      fakeTranscribe
    );
    if (out.ok && out.segment) segments.push(out.segment);
  };

  const runtime = new BotRuntime({ adapter, consentGate: consent, credential: 'smcb1_dummy.sig', flagEnabled: true, sink });
  const startDecision = await runtime.start();
  ok(startDecision.ok && startDecision.mode === 'synthetic', 'runtime start allowed in synthetic mode');

  await adapter.replay();
  // sink is async; drain microtasks
  await new Promise((r) => setTimeout(r, 0));

  ok(segments.length === 4, `four participant segments produced (got ${segments.length})`);
  ok(segments.every((s) => s.channel === 'participant'), 'every segment is participant-labelled (not me/others)');
  ok(segments[0].participantId === 'p-1' && segments[0].displayName === 'Alice (Interviewer)', 'first segment attributed to Alice');
  ok(segments[1].participantId === 'p-2' && segments[1].displayName === 'Bob (Candidate)', 'second segment attributed to Bob');
  ok(segments[1].raw === 'I led the migration of our billing service.', 'transcript text carried through the engine ingestion');
  ok(segments.every((s) => s.provenance === PROVENANCE.SYNTHETIC), 'every segment marked provenance=synthetic');
  ok(runtime.stats().identity === 'SMC Recording Bot', "bot identity is 'SMC Recording Bot'");

  // ── 2. Hard guard refuses real capture / flag-off / consent-missing ──────────
  section('Test 2: hard guard refuses real capture in this increment');

  const realFrame = { participantId: 'p-9', displayName: 'X', frame: new Uint8Array([1, 2, 3]), provenance: PROVENANCE.ZOOM_MEETING_SDK };
  const realGate = assertBotCaptureAllowed({ env: { BOT_CAPTURE_ENABLED: 'true' }, frame: realFrame, consentState });
  ok(!realGate.ok && realGate.reason === 'real_capture_not_built_in_this_increment', 'engine refuses non-synthetic frame even with flag on + consent');

  const realIngest = await ingestParticipantFrame({ env: { BOT_CAPTURE_ENABLED: 'true' }, frame: realFrame, consentState }, fakeTranscribe);
  ok(!realIngest.ok && realIngest.reason === 'real_capture_not_built_in_this_increment', 'engine ingest drops the real frame');

  // Runtime guard: a real adapter kind is refused outright in this increment.
  const realGuard = assertCaptureAllowed({ adapterKind: 'zoom-meeting-sdk', flagEnabled: true, consent: consentState, boundaries: { oneActiveSession: true }, session: { activeSessions: 1 } });
  ok(!realGuard.ok && realGuard.reason === 'real_capture_not_built_in_this_increment', 'runtime guard refuses real adapter');

  // Flag default OFF.
  ok(botCaptureEnabled({}) === false, 'engine bot flag defaults OFF (no env)');
  ok(botCaptureEnabled({ BOT_CAPTURE_ENABLED: 'false' }) === false, "engine bot flag OFF for 'false'");
  ok(botCaptureEnabled({ BOT_CAPTURE_ENABLED: 'true' }) === true, "engine bot flag ON only for 'true'");

  // Synthetic still allowed regardless of flag (it is all the increment does).
  const synthFlagOff = assertBotCaptureAllowed({ env: {}, frame: { participantId: 'p', frame: new Uint8Array([1]), provenance: PROVENANCE.SYNTHETIC }, consentState: null });
  ok(synthFlagOff.ok && synthFlagOff.mode === 'synthetic', 'synthetic frame allowed even with flag off and no consent (no real capture)');

  // Malformed frame dropped.
  const bad = await ingestParticipantFrame({ env: engineEnv, frame: { participantId: '', frame: new Uint8Array() } }, fakeTranscribe);
  ok(!bad.ok && bad.reason === 'malformed_frame', 'malformed frame rejected');

  // ── 3. Session-bound bot credential (aligned to H4) ──────────────────────────
  section('Test 3: session-bound bot credential — mint / verify / replay / revoke');

  const secret = 'test-bot-signing-secret';
  const cred = mintBotCredential({ operator: 'ali@pacific.london', sid: 'sess-1', meetingRef: 'meet-abc-123', secret, clock });
  ok(cred.startsWith('smcb1_'), 'credential carries the smcb1_ prefix');

  const replay = new ReplayStore();
  const revocation = new RevocationStore();

  const v1 = verifyBotCredential(cred, { secret, replay, revocation, expectMeetingRef: 'meet-abc-123', clock });
  ok(v1.valid && v1.claims.sid === 'sess-1' && v1.claims.mref === 'meet-abc-123' && v1.claims.u === 'ali@pacific.london', 'verifies and is bound to session + meeting + operator');

  const v2 = verifyBotCredential(cred, { secret, replay, revocation, clock });
  ok(!v2.valid && v2.reason === 'already_used', 'single-use: second verify is rejected (replay protection)');

  const wrongSecret = verifyBotCredential(mintBotCredential({ operator: 'a@b', sid: 's', meetingRef: 'm', secret: 'other', clock }), { secret, clock });
  ok(!wrongSecret.valid && wrongSecret.reason === 'bad_signature', 'credential signed with a different secret is rejected');

  const wrongMeeting = verifyBotCredential(mintBotCredential({ operator: 'a@b', sid: 's', meetingRef: 'meet-OTHER', secret, clock }), { secret, expectMeetingRef: 'meet-abc-123', clock });
  ok(!wrongMeeting.valid && wrongMeeting.reason === 'meeting_ref_mismatch', 'credential bound to a different meeting is rejected');

  const expired = verifyBotCredential(mintBotCredential({ operator: 'a@b', sid: 's', meetingRef: 'm', secret, ttlSec: 1, clock: () => clock() - 10_000 }), { secret, clock });
  ok(!expired.valid && expired.reason === 'expired', 'expired credential is rejected');

  // Revoking the SMC session invalidates its bot credentials (H4 semantics).
  const cred2 = mintBotCredential({ operator: 'ali@pacific.london', sid: 'sess-2', meetingRef: 'meet-xyz', secret, clock });
  revocation.revokeSession('sess-2');
  const v3 = verifyBotCredential(cred2, { secret, replay: new ReplayStore(), revocation, clock });
  ok(!v3.valid && v3.reason === 'revoked', 'revoking the SMC session revokes its bot credential');

  // ── 4. Product boundaries + flag-gating structural checks ────────────────────
  section('Test 4: product boundaries + engine flag-gating');

  const twoSessions = assertCaptureAllowed({ adapterKind: 'fake', flagEnabled: true, consent: consentState, boundaries: { oneActiveSession: true }, session: { activeSessions: 2 } });
  ok(!twoSessions.ok && twoSessions.reason === 'more_than_one_active_session', 'one-active-session boundary enforced');

  const doSrc = readFileSync(join(__dirname, '..', 'worker', 'src', 'session-do.js'), 'utf8');
  ok(doSrc.includes("import { botCaptureEnabled, ingestParticipantFrame } from './bot-ingest.js'"), 'SessionDO imports the bot-ingest seam');
  ok(/ctrl\.type === 'bot_frame'/.test(doSrc) && /botCaptureEnabled\(this\.env\)/.test(doSrc), 'SessionDO bot_frame branch is gated behind botCaptureEnabled (default off)');

  const wrangler = readFileSync(join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
  ok(/BOT_CAPTURE_ENABLED\s*=\s*"false"/.test(wrangler), 'wrangler.toml ships BOT_CAPTURE_ENABLED="false" (default off)');

  const idxSrc = readFileSync(join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
  ok(!/\/bot\/ws/.test(idxSrc), 'no /bot/ws live route exposed in this increment (no real bot can connect)');

  // Consent evidence is verifiable.
  const ev = consent.evidence();
  ok(ev.botIdentity === 'SMC Recording Bot' && ev.affirmed === true && ev.meetingRef === 'meet-abc-123', 'consent evidence records identity, affirmation and meeting ref');
  ok(ev.participantLog.length === 2 && ev.participantLog.every((r) => r.event === 'join'), 'consent evidence logged participant joins from the roster');
  ok(typeof ev.affirmedAt === 'number' && ev.disclosureMethod === DISCLOSURE_METHODS.IN_MEETING_ANNOUNCEMENT && !!ev.confirmationText, 'consent evidence has timestamp, disclosure method and confirmation');

  // ── summary ──
  console.log('\n' + '─'.repeat(60));
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('SOME TESTS FAILED ❌'); process.exit(1); }
  console.log('All tests passed ✅');
})();
