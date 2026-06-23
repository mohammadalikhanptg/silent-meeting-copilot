// Test script for repeat-back detection (P1).
// Run: node scripts/test-repeat-back.mjs
// Expects the Cloudflare worker to be deployed and reachable.

const ENGINE_URL = process.env.ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

let passed = 0;
let failed = 0;

async function callCoach(body) {
  const res = await fetch(`${ENGINE_URL}/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS ✅  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ❌  ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Garbled OTHERS turn followed by a clear ME repeat-back
//         → system MUST detect correction and return it
// ---------------------------------------------------------------------------
console.log('\nTest 1 — REPEAT-BACK DETECTION (expect correction)\n');

// Garbled OTHERS is the most recent OTHERS turn before the ME restatement.
// No further OTHERS turn follows (no confirmatory reply), so it will be the target.
const garbledOthers = 'Uh the dedline is… we have ressource issue because recrutment is frozed and team cannot deliver by orignal date.';
const clearRestatement = 'So if I understand correctly, you\'re saying that the deadline needs to move to end of month because your team is short-staffed due to the recruitment freeze, and you cannot hit the original date?';

const t1 = await callCoach({
  me: [
    'Good morning everyone, thanks for joining.',
    'We need to discuss the project timeline.',
    clearRestatement,
  ],
  others: [
    'Morning, yes we should get started.',
    garbledOthers,
    // NOTE: no further OTHERS turn — so garbledOthers (index 1) is the most recent OTHERS turn
    // and should be the correction target
  ],
  objective: 'Agree on revised project timeline',
});

console.log('  Response corrections:', JSON.stringify(t1.corrections, null, 4));

assert(t1.ok === true, 'Response is ok');
assert(Array.isArray(t1.corrections), 'corrections field is an array');
assert(t1.corrections.length > 0, 'At least one correction detected');

if (t1.corrections.length > 0) {
  const c = t1.corrections[0];
  assert(typeof c.othersIndex === 'number', 'correction.othersIndex is a number');
  assert(typeof c.original === 'string' && c.original.length > 0, 'correction.original is non-empty');
  assert(typeof c.corrected === 'string' && c.corrected.length > 0, 'correction.corrected is non-empty');
  assert(c.othersIndex === 1, 'correction targets OTHERS index 1 (the garbled turn, most recent OTHERS)');
  assert(c.original === garbledOthers, 'correction.original matches the garbled OTHERS turn');
  console.log(`  Corrected text: "${c.corrected}"`);
}

assert(Array.isArray(t1.openItems), 'openItems is an array');
assert(Array.isArray(t1.suggestions), 'suggestions is an array');
assert(t1.talkBalance !== undefined, 'talkBalance present');

// ---------------------------------------------------------------------------
// Test 2: Normal ME turn (new argument, not a repeat-back)
//         → system MUST NOT generate a spurious correction
// ---------------------------------------------------------------------------
console.log('\nTest 2 — NO FALSE POSITIVE (normal ME turn, no correction expected)\n');

const t2 = await callCoach({
  me: [
    'Good morning everyone.',
    'I think we should focus on the core deliverables first.',
    'My recommendation is to deprioritize the nice-to-haves and focus on the MVP by the deadline.',
  ],
  others: [
    'We have too many features on the backlog.',
    'The team is feeling overwhelmed with the current scope.',
  ],
  objective: 'Prioritize the product backlog',
});

console.log('  Response corrections:', JSON.stringify(t2.corrections, null, 4));

assert(t2.ok === true, 'Response is ok');
assert(Array.isArray(t2.corrections), 'corrections field is an array');
assert(t2.corrections.length === 0, 'No spurious corrections on normal ME turn');

// ---------------------------------------------------------------------------
// Test 3: Short ME acknowledgement that contains a signpost phrase but is too short
//         → should NOT trigger (below the 8-word minimum)
// ---------------------------------------------------------------------------
console.log('\nTest 3 — SHORT SIGNPOST ACKNOWLEDGEMENT (too brief to correct)\n');

const t3 = await callCoach({
  me: [
    'Let me start the meeting.',
    "So you're saying yes.", // signpost but < 8 words
  ],
  others: [
    'Yes I agree with the plan.',
    'We should proceed.',
  ],
});

console.log('  Response corrections:', JSON.stringify(t3.corrections, null, 4));

assert(t3.ok === true, 'Response is ok');
assert(t3.corrections.length === 0, 'Short signpost not treated as repeat-back');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✅');
}
