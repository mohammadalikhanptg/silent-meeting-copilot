// Test script for Phase 3 — usage metering helpers.
// Pure unit tests, no database or network. Run: node scripts/test-metering.mjs
import { meteredSecondsFor, periodFor, planFor, PLANS, DEFAULT_PLAN } from '../app/lib/entitlements.js';

let passed = 0;
let failed = 0;
function assert(label, condition) {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else { console.log(`  FAIL  ${label}`); failed++; }
}

console.log('\nmeteredSecondsFor');
{
  const start = '2026-07-08T10:00:00.000Z';
  assert('30 min session -> 1800s', meteredSecondsFor(start, '2026-07-08T10:30:00.000Z') === 1800);
  assert('exact minute rounds', meteredSecondsFor(start, '2026-07-08T10:00:59.400Z') === 59);
  assert('negative (clock skew) clamps to 0', meteredSecondsFor('2026-07-08T10:30:00Z', '2026-07-08T10:00:00Z') === 0);
  assert('same instant -> 0', meteredSecondsFor(start, start) === 0);
  assert('stuck session capped at 6h', meteredSecondsFor(start, '2026-07-09T10:00:00Z') === 6 * 3600);
  assert('invalid input -> 0', meteredSecondsFor('not-a-date', 'also-bad') === 0);
}

console.log('\nperiodFor');
{
  assert('YYYY-MM format', periodFor('2026-07-08T23:59:00Z') === '2026-07');
  assert('UTC month boundary', periodFor('2026-12-31T23:00:00Z') === '2026-12');
  assert('default returns a period string', /^\d{4}-\d{2}$/.test(periodFor()));
}

console.log('\nplanFor');
{
  assert('known plan resolves', planFor('pro').includedMinutes === PLANS.pro.includedMinutes);
  assert('unknown plan falls back to default', planFor('nonsense').includedMinutes === PLANS[DEFAULT_PLAN].includedMinutes);
  assert('undefined falls back to default', planFor(undefined).label === PLANS[DEFAULT_PLAN].label);
  assert('every plan has label + includedMinutes', Object.values(PLANS).every(p => typeof p.label === 'string' && Number.isFinite(p.includedMinutes)));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
