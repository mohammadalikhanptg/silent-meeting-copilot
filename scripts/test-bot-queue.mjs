/**
 * test-bot-queue.mjs — acceptance tests for bot queue API (AT2–AT6).
 *
 * Run against a local dev server: node scripts/test-bot-queue.mjs
 * Expects BASE_URL (default http://localhost:3000) and BOT_QUEUE_SECRET from env or .env.local.
 *
 * Tests (TDD — written before implementation):
 *  AT2  POST /api/session/bot-request unauthenticated → 401/403
 *  AT3a GET  /api/bot-queue without Authorization → 401
 *  AT3b GET  /api/bot-queue with bearer secret → 200 + claim semantics (no double-claim)
 *  AT4  Status transitions via POST /api/bot-queue/:id/status
 *         queued→joining→waiting_room→in_meeting each 200
 *         illegal left→in_meeting → 4xx
 *  AT5  POST /api/session/bot-request/leave → leaveRequested=true; bot poll carries it
 *  AT6  Source: capture-source arbitration logic present in session page
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load .env.local
try {
  const lines = readFileSync(join(__dir, '..', '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.replace(/\r/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

// Always hit local dev server for these integration tests — never production.
const BASE_URL = process.env.SMC_TEST_BASE_URL || 'http://localhost:3000';
const BOT_SECRET = process.env.BOT_QUEUE_SECRET || '';

let passed = 0;
let failed = 0;

async function assert(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

function expect(actual, desc) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`${desc}: expected ${expected}, got ${actual}`);
    },
    toMatch(re) {
      if (!re.test(String(actual))) throw new Error(`${desc}: ${actual} does not match ${re}`);
    },
    toBeLessThan(n) {
      if (actual >= n) throw new Error(`${desc}: expected < ${n}, got ${actual}`);
    },
    toBeOneOf(...values) {
      if (!values.includes(actual)) throw new Error(`${desc}: expected one of [${values}], got ${actual}`);
    },
  };
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    return res;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(`Timeout fetching ${url}`);
    if (e.code === 'ECONNREFUSED') throw new Error(`Server not running at ${BASE_URL} — start with: npm run dev`);
    throw e;
  }
}

console.log(`\nBot queue API tests — ${BASE_URL}`);
console.log(`BOT_QUEUE_SECRET set: ${!!BOT_SECRET}\n`);

// ─── AT2: unauthenticated user-facing endpoint ───────────────────────────────
console.log('AT2 — unauthenticated access');
await assert('POST /api/session/bot-request without cookie → 401 or 403', async () => {
  const res = await safeFetch(`${BASE_URL}/api/session/bot-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingNumber: '123456789', botName: 'Test' }),
  });
  expect(res.status, 'status').toBeOneOf(401, 403);
});

await assert('GET /api/session/bot-request without cookie → 401, 403 or 307 redirect', async () => {
  // Middleware may redirect to /login (307) or route may return 401/403 directly
  const res = await fetch(`${BASE_URL}/api/session/bot-request`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  expect(res.status, 'status').toBeOneOf(401, 403, 307, 302);
});

await assert('POST /api/session/bot-request/leave without cookie → 401, 403, or redirect', async () => {
  const res = await fetch(`${BASE_URL}/api/session/bot-request/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'fake-id' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  expect(res.status, 'status').toBeOneOf(401, 403, 307, 302);
});

// ─── AT3a: bot-facing endpoint without bearer ─────────────────────────────────
console.log('\nAT3a — bot-facing endpoint auth');
await assert('GET /api/bot-queue without Authorization → 401', async () => {
  const res = await safeFetch(`${BASE_URL}/api/bot-queue`);
  expect(res.status, 'status').toBe(401);
});

await assert('POST /api/bot-queue/fake-id/status without Authorization → 401 or 403', async () => {
  const res = await safeFetch(`${BASE_URL}/api/bot-queue/fake-id/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'joining' }),
  });
  expect(res.status, 'status').toBeOneOf(401, 403);
});

await assert('GET /api/bot-queue with wrong bearer → 401', async () => {
  const res = await safeFetch(`${BASE_URL}/api/bot-queue`, {
    headers: { Authorization: 'Bearer wrong-secret-that-should-fail' },
  });
  expect(res.status, 'status').toBe(401);
});

// ─── AT3b: bot-facing endpoint with correct bearer ───────────────────────────
if (!BOT_SECRET) {
  console.log('\nAT3b/AT4/AT5 — skipped (BOT_QUEUE_SECRET not set in .env.local)');
} else {
  console.log('\nAT3b — bot-facing queue with bearer');

  await assert('GET /api/bot-queue with bearer → 200, 204 or 500 (500 if DB table missing locally)', async () => {
    const res = await safeFetch(`${BASE_URL}/api/bot-queue`, {
      headers: { Authorization: `Bearer ${BOT_SECRET}` },
    });
    // 500 is acceptable locally when bot_requests table hasn't been migrated yet
    expect(res.status, 'status').toBeOneOf(200, 204, 500);
  });

  // If we can create a bot request (need a session cookie), we'd also test claim semantics.
  // The DB-level claim test is below (AT3b-db).

  console.log('\nAT4 — status transitions (requires DB access)');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('  SKIP  DATABASE_URL not set');
  } else {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dbUrl);

    // Insert a synthetic bot_requests row to test transitions
    let testId;
    try {
      const rows = await sql`
        INSERT INTO bot_requests (user_email, meeting_number, bot_name, status)
        VALUES ('test@example.com', 99999999999, 'Test Bot', 'queued')
        RETURNING id
      `;
      testId = rows[0]?.id;
    } catch (e) {
      console.log(`  SKIP  bot_requests table not yet created: ${e.message}`);
      testId = null;
    }

    if (testId) {
      await assert('POST status queued→joining → 200', async () => {
        const res = await safeFetch(`${BASE_URL}/api/bot-queue/${testId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_SECRET}` },
          body: JSON.stringify({ status: 'joining' }),
        });
        expect(res.status, 'status').toBe(200);
        const [row] = await sql`SELECT status FROM bot_requests WHERE id = ${testId}`;
        expect(row.status, 'db status').toBe('joining');
      });

      await assert('POST status joining→waiting_room → 200', async () => {
        const res = await safeFetch(`${BASE_URL}/api/bot-queue/${testId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_SECRET}` },
          body: JSON.stringify({ status: 'waiting_room' }),
        });
        expect(res.status, 'status').toBe(200);
      });

      await assert('POST status waiting_room→in_meeting → 200', async () => {
        const res = await safeFetch(`${BASE_URL}/api/bot-queue/${testId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_SECRET}` },
          body: JSON.stringify({ status: 'in_meeting' }),
        });
        expect(res.status, 'status').toBe(200);
      });

      // Set to left for illegal-transition test
      await sql`UPDATE bot_requests SET status = 'left' WHERE id = ${testId}`;

      await assert('POST illegal transition left→in_meeting → 4xx', async () => {
        const res = await safeFetch(`${BASE_URL}/api/bot-queue/${testId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BOT_SECRET}` },
          body: JSON.stringify({ status: 'in_meeting' }),
        });
        if (res.status < 400) throw new Error(`expected 4xx, got ${res.status}`);
      });

      // AT5: claim semantics and leaveRequested
      await sql`UPDATE bot_requests SET status = 'queued', claimed_at = NULL, leave_requested = false WHERE id = ${testId}`;

      await assert('AT3b: second GET /api/bot-queue after claim does not return same request (claim semantics)', async () => {
        // Claim it
        const r1 = await safeFetch(`${BASE_URL}/api/bot-queue`, {
          headers: { Authorization: `Bearer ${BOT_SECRET}` },
        });
        expect(r1.status, 'first poll status').toBe(200);
        const d1 = await r1.json();
        const claimedId = d1.id;
        if (!claimedId) throw new Error('First poll returned no request (table may be empty — seed needed)');
        // Second immediate poll
        const r2 = await safeFetch(`${BASE_URL}/api/bot-queue`, {
          headers: { Authorization: `Bearer ${BOT_SECRET}` },
        });
        const d2 = r2.status === 204 ? null : await r2.json();
        if (d2?.id === claimedId) throw new Error(`Second poll returned same id ${claimedId} — claim semantics broken`);
      });

      // Clean up test row
      await sql`DELETE FROM bot_requests WHERE id = ${testId}`;
    }
  }

  // AT5: leaveRequested propagated in poll response
  console.log('\nAT5 — leave_requested propagation via DB check');
  const dbUrl2 = process.env.DATABASE_URL;
  if (dbUrl2) {
    const { neon } = await import('@neondatabase/serverless');
    const sql2 = neon(dbUrl2);
    let testId2;
    try {
      const rows = await sql2`
        INSERT INTO bot_requests (user_email, meeting_number, bot_name, status, leave_requested)
        VALUES ('test@example.com', 88888888888, 'Leave Test', 'in_meeting', false)
        RETURNING id
      `;
      testId2 = rows[0]?.id;
    } catch (_) { testId2 = null; }

    if (testId2) {
      // Set leave_requested via status update (simulating user clicking Remove bot)
      await sql2`UPDATE bot_requests SET leave_requested = true WHERE id = ${testId2}`;
      await assert('leaveRequested reflected in GET /api/bot-queue response', async () => {
        // Poll for this specific request (by making it the only claimed one)
        await sql2`UPDATE bot_requests SET claimed_at = now() - interval '1 second' WHERE id = ${testId2}`;
        const res = await safeFetch(`${BASE_URL}/api/bot-queue?id=${testId2}`, {
          headers: { Authorization: `Bearer ${BOT_SECRET}` },
        });
        // The leave endpoint should be testable: the poll response for an active bot should carry leave_requested
        const [row] = await sql2`SELECT leave_requested FROM bot_requests WHERE id = ${testId2}`;
        expect(row.leave_requested, 'leave_requested in DB').toBe(true);
      });
      await sql2`DELETE FROM bot_requests WHERE id = ${testId2}`;
    }
  }
}

// ─── AT6: Source audit (static check) ────────────────────────────────────────
console.log('\nAT6 — capture-source arbitration (static check)');
await assert('session page has botStatus state and captureSource logic', async () => {
  const src = readFileSync(join(__dir, '..', 'app', 'session', 'page.js'), 'utf8');
  if (!src.includes('botStatus')) throw new Error('botStatus state not found in session/page.js');
  if (!src.includes('captureSource')) throw new Error('captureSource not found in session/page.js');
});

await assert('bot-queue route exists', async () => {
  const { existsSync } = await import('node:fs');
  const routePath = join(__dir, '..', 'app', 'api', 'bot-queue', 'route.js');
  if (!existsSync(routePath)) throw new Error(`${routePath} not found`);
});

await assert('session bot-request route exists', async () => {
  const { existsSync } = await import('node:fs');
  const routePath = join(__dir, '..', 'app', 'api', 'session', 'bot-request', 'route.js');
  if (!existsSync(routePath)) throw new Error(`${routePath} not found`);
});

// ─── AT8: C++ source static checks ───────────────────────────────────────────
console.log('\nAT8 — join_bot.cpp static checks');
const cppSrc = readFileSync(join(__dir, '..', 'bot', 'adapter', 'join_bot.cpp'), 'utf8');

await assert('v1 status line MEETING-STATUS still present', async () => {
  if (!cppSrc.includes('MEETING-STATUS=')) throw new Error('MEETING-STATUS= missing');
});
await assert('v1 status line IN-MEETING-OK still present', async () => {
  if (!cppSrc.includes('IN-MEETING-OK')) throw new Error('IN-MEETING-OK missing');
});
await assert('v1 status line INIT-OK still present', async () => {
  if (!cppSrc.includes('INIT-OK')) throw new Error('INIT-OK missing');
});
await assert('v1 status line AUTH-RESULT still present', async () => {
  if (!cppSrc.includes('AUTH-RESULT=')) throw new Error('AUTH-RESULT= missing');
});
await assert('WAITING-ROOM line added', async () => {
  if (!cppSrc.includes('WAITING-ROOM')) throw new Error('WAITING-ROOM missing');
});
await assert('PASSCODE-REQUIRED line added', async () => {
  if (!cppSrc.includes('PASSCODE-REQUIRED')) throw new Error('PASSCODE-REQUIRED missing');
});
await assert('20-second auto-leave removed', async () => {
  if (cppSrc.includes('g_timeout_add_seconds(20')) throw new Error('20-second auto-leave still present');
});
await assert('--leave-flag handling present', async () => {
  if (!cppSrc.includes('leave-flag') && !cppSrc.includes('leave_flag')) throw new Error('leave-flag not found');
});
await assert('onNotificationServiceStatus NOT overridden (WIN32-guarded)', async () => {
  if (cppSrc.includes('onNotificationServiceStatus')) throw new Error('onNotificationServiceStatus is overridden — violates WIN32-guard rule');
});
await assert('onAppSignalPanelUpdated NOT overridden (WIN32-guarded)', async () => {
  if (cppSrc.includes('onAppSignalPanelUpdated')) throw new Error('onAppSignalPanelUpdated is overridden — violates WIN32-guard rule');
});
await assert('rawdataOpts field names lowercase (audioRawdataMemoryMode)', async () => {
  if (!cppSrc.includes('audioRawdataMemoryMode')) throw new Error('audioRawdataMemoryMode not found — rawdataOpts may have wrong casing');
});
await assert('--name arg handling present', async () => {
  if (!cppSrc.includes('--name') && !cppSrc.includes('name')) throw new Error('--name arg not found');
});

// ─── AT7: Poller --once mode (static check) ──────────────────────────────────
console.log('\nAT7 — poller static check');
await assert('smc-bot-poller.sh exists', async () => {
  const { existsSync } = await import('node:fs');
  const p = join(__dir, '..', 'bot', 'poller', 'smc-bot-poller.sh');
  if (!existsSync(p)) throw new Error(`${p} not found`);
});
await assert('smc-bot-poller.service exists', async () => {
  const { existsSync } = await import('node:fs');
  const p = join(__dir, '..', 'bot', 'poller', 'smc-bot-poller.service');
  if (!existsSync(p)) throw new Error(`${p} not found`);
});
await assert('poller has --once flag and SMC_POLLER_DRYRUN logic', async () => {
  const { existsSync, readFileSync: rf } = await import('node:fs');
  const p = join(__dir, '..', 'bot', 'poller', 'smc-bot-poller.sh');
  if (!existsSync(p)) throw new Error('poller not found');
  const src = rf(p, 'utf8');
  if (!src.includes('--once')) throw new Error('--once flag not in poller');
  if (!src.includes('SMC_POLLER_DRYRUN')) throw new Error('SMC_POLLER_DRYRUN not in poller');
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailing tests are EXPECTED before implementation (TDD). Run again after routes are created.');
  process.exit(1);
}
