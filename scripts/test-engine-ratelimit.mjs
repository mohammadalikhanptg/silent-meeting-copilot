/**
 * Engine rate-limiting (F1) + error-leakage (F5) test suite — job-smcsec-3.
 * Runs fully offline: it imports the real worker modules and drives the real
 * fetch handler with stubbed Cloudflare bindings (rate limiters, AI, internal
 * validate fetch). No secrets, no network.
 *
 * Run: node scripts/test-engine-ratelimit.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'worker', 'src');
// Dynamic import() needs a file:// URL on Windows (absolute paths are rejected).
const mod = (name) => pathToFileURL(join(SRC, name)).href;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', msg); }
}
async function throws(fn) { try { await fn(); return false; } catch { return true; } }

// A fake Cloudflare rate-limit binding. verdict: 'allow' | 'deny' | 'throw'.
function fakeLimiter(verdict) {
  const calls = [];
  return {
    calls,
    async limit({ key }) {
      calls.push(key);
      if (verdict === 'throw') throw new Error('limiter unavailable');
      return { success: verdict !== 'deny' };
    },
  };
}

// ── Part A — ratelimit.js unit behaviour ─────────────────────────────────────
const rl = await import(mod('ratelimit.js'));

async function partA() {
  console.log('A. ratelimit.js unit');

  // allow(): missing binding fails open
  ok(await rl.allow({}, 'RL_IP', 'k') === true, 'allow() true when binding absent');
  ok(await rl.allow({ RL_IP: {} }, 'RL_IP', 'k') === true, 'allow() true when binding has no limit()');

  // allow(): honours success boolean
  ok(await rl.allow({ RL_IP: fakeLimiter('allow') }, 'RL_IP', 'k') === true, 'allow() true on success');
  ok(await rl.allow({ RL_IP: fakeLimiter('deny') }, 'RL_IP', 'k') === false, 'allow() false on deny');

  // allow(): fail-open when limit() throws
  ok(await rl.allow({ RL_IP: fakeLimiter('throw') }, 'RL_IP', 'k') === true, 'allow() fail-open on throw');

  // allow(): forwards the exact key
  const lim = fakeLimiter('allow');
  await rl.allow({ RL_IP: lim }, 'RL_IP', 'ip:1.2.3.4');
  ok(lim.calls[0] === 'ip:1.2.3.4', 'allow() forwards key verbatim');

  // clientIp(): CF header → XFF → unknown
  const mk = (h) => ({ headers: { get: (n) => h[n] || null } });
  ok(rl.clientIp(mk({ 'CF-Connecting-IP': '5.5.5.5' })) === '5.5.5.5', 'clientIp prefers CF-Connecting-IP');
  ok(rl.clientIp(mk({ 'X-Forwarded-For': '6.6.6.6, 7.7.7.7' })) === '6.6.6.6', 'clientIp falls back to first XFF');
  ok(rl.clientIp(mk({})) === 'unknown', 'clientIp defaults to unknown');

  // checkIpLimit
  ok((await rl.checkIpLimit({ RL_IP: fakeLimiter('allow') }, '1.1.1.1')).ok === true, 'checkIpLimit allows');
  const ipDeny = await rl.checkIpLimit({ RL_IP: fakeLimiter('deny') }, '1.1.1.1');
  ok(ipDeny.ok === false && ipDeny.scope === 'ip', 'checkIpLimit denies with scope ip');

  // checkUserLimit: per-endpoint key, heavy only for /transcribe
  const userLim = fakeLimiter('allow');
  await rl.checkUserLimit({ RL_USER: userLim, RL_HEAVY: fakeLimiter('allow') }, { id: 'a@b.c', path: '/coach' });
  ok(userLim.calls[0] === 'u:a@b.c:/coach', 'checkUserLimit keys by user+path');

  const heavy = fakeLimiter('allow');
  await rl.checkUserLimit({ RL_USER: fakeLimiter('allow'), RL_HEAVY: heavy }, { id: 'a@b.c', path: '/coach' });
  ok(heavy.calls.length === 0, 'heavy bucket NOT consulted for /coach');
  await rl.checkUserLimit({ RL_USER: fakeLimiter('allow'), RL_HEAVY: heavy }, { id: 'a@b.c', path: '/transcribe' });
  ok(heavy.calls[0] === 'h:a@b.c', 'heavy bucket consulted (keyed) for /transcribe');

  const uDeny = await rl.checkUserLimit({ RL_USER: fakeLimiter('deny') }, { id: 'a@b.c', path: '/coach' });
  ok(uDeny.ok === false && uDeny.scope === 'user', 'checkUserLimit denies with scope user');
  const hDeny = await rl.checkUserLimit({ RL_USER: fakeLimiter('allow'), RL_HEAVY: fakeLimiter('deny') }, { id: 'a@b.c', path: '/transcribe' });
  ok(hDeny.ok === false && hDeny.scope === 'heavy', 'checkUserLimit denies with scope heavy on /transcribe');

  // id fallback to ip-derived value when no email
  const noEmail = fakeLimiter('allow');
  await rl.checkUserLimit({ RL_USER: noEmail }, { id: '', path: '/coach' });
  ok(noEmail.calls[0] === 'u:unknown:/coach', 'checkUserLimit falls back to "unknown" when no id');
}

// ── Part B — wired worker.fetch behaviour ────────────────────────────────────
const worker = (await import(mod('index.js'))).default;
const SVC = 'internal-shared-secret-test';

function aiStub() {
  const calls = [];
  return { calls, run: async (...a) => { calls.push(a); return { response: '{}' }; } };
}
function baseEnv(over = {}) {
  return {
    INTERNAL_SHARED_SECRET: SVC,
    APP_BASE_URL: 'https://app.test',
    AI: aiStub(),
    RL_IP: fakeLimiter('allow'),
    RL_USER: fakeLimiter('allow'),
    RL_HEAVY: fakeLimiter('allow'),
    ...over,
  };
}
function postReq(path, { bearer, ip = '9.9.9.9', body = '{"me":[],"others":[]}' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  return new Request(`https://engine.test${path}`, { method: 'POST', headers, body });
}

async function partB() {
  console.log('B. worker.fetch wiring');

  // B1 — per-IP limit denies a non-svc request BEFORE auth/AI.
  {
    const env = baseEnv({ RL_IP: fakeLimiter('deny') });
    const res = await worker.fetch(postReq('/coach', { bearer: 'a-browser-token' }), env, {});
    ok(res.status === 429, 'B1 IP-limited → 429');
    ok(res.headers.get('Retry-After') === '60', 'B1 sends Retry-After: 60');
    ok(env.AI.calls.length === 0, 'B1 AI not invoked when IP-limited');
    ok(env.RL_IP.calls[0] === 'ip:9.9.9.9', 'B1 IP limiter keyed by client IP');
  }

  // B2 — svc bearer (internal secret) is EXEMPT: limiters never consulted, not 429.
  {
    const env = baseEnv({ RL_IP: fakeLimiter('deny'), RL_USER: fakeLimiter('deny') });
    const res = await worker.fetch(postReq('/coach', { bearer: SVC }), env, {});
    ok(res.status !== 429, 'B2 svc call not rate-limited');
    ok(env.RL_IP.calls.length === 0 && env.RL_USER.calls.length === 0, 'B2 svc call bypasses all limiters');
  }

  // B3 — per-user limit denies an authenticated token user (IP allowed).
  {
    const env = baseEnv({ RL_USER: fakeLimiter('deny') });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
      if (String(u).includes('/api/internal/validate-session-token')) {
        return new Response(JSON.stringify({ valid: true, email: 'u@e.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const res = await worker.fetch(postReq('/coach', { bearer: 'a-browser-token' }), env, {});
      ok(res.status === 429, 'B3 user-limited → 429');
      ok(env.AI.calls.length === 0, 'B3 AI not invoked when user-limited');
      ok(env.RL_USER.calls[0] === 'u:u@e.com:/coach', 'B3 user limiter keyed by email+path');
    } finally { globalThis.fetch = prevFetch; }
  }

  // B4 — heavy limit denies /transcribe for an authenticated user.
  {
    const env = baseEnv({ RL_HEAVY: fakeLimiter('deny') });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
      if (String(u).includes('/api/internal/validate-session-token')) {
        return new Response(JSON.stringify({ valid: true, email: 'u@e.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const res = await worker.fetch(postReq('/transcribe', { bearer: 'a-browser-token', body: 'audio-bytes' }), env, {});
      ok(res.status === 429, 'B4 transcribe heavy-limited → 429');
      ok(env.RL_HEAVY.calls[0] === 'h:u@e.com', 'B4 heavy limiter keyed by email');
      ok(env.RL_USER.calls[0] === 'u:u@e.com:/transcribe', 'B4 user limiter also consulted for /transcribe');
    } finally { globalThis.fetch = prevFetch; }
  }

  // B5 — limiter throwing fails OPEN: not 429 (auth still runs).
  {
    const env = baseEnv({ RL_IP: fakeLimiter('throw'), RL_USER: fakeLimiter('throw') });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
      if (String(u).includes('/api/internal/validate-session-token')) {
        return new Response(JSON.stringify({ valid: true, email: 'u@e.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const res = await worker.fetch(postReq('/coach', { bearer: 'a-browser-token' }), env, {});
      ok(res.status !== 429, 'B5 fail-open: limiter throw does not block (not 429)');
    } finally { globalThis.fetch = prevFetch; }
  }

  // B6 — bad token (IP allowed) still rejected by auth with 401, not 429.
  {
    const env = baseEnv();
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (u) => {
      if (String(u).includes('/api/internal/validate-session-token')) {
        return new Response(JSON.stringify({ valid: false, reason: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const res = await worker.fetch(postReq('/coach', { bearer: 'bogus' }), env, {});
      ok(res.status === 401, 'B6 invalid token → 401 (auth still enforced)');
      ok(env.AI.calls.length === 0, 'B6 AI not invoked for invalid token');
    } finally { globalThis.fetch = prevFetch; }
  }

  // B7 — payload over the cap is rejected with 413 before any limiter/auth.
  {
    const env = baseEnv();
    const big = new Request('https://engine.test/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' },
      body: '{}',
    });
    const res = await worker.fetch(big, env, {});
    ok(res.status === 413, 'B7 oversize body → 413');
    ok(env.RL_IP.calls.length === 0, 'B7 limiter not consulted for oversize body');
  }
}

// ── Part C — F5: no raw error strings reach engine clients ────────────────────
function partC() {
  console.log('C. F5 error-leakage source checks');
  const sd = readFileSync(join(SRC, 'session-do.js'), 'utf8');
  ok(!/String\(err\.message/.test(sd), 'no "String(err.message" leak in session-do.js');
  ok(!/\$\{String\(err/.test(sd), 'no interpolated raw error in session-do.js');
  ok((sd.match(/error: 'generation_failed'/g) || []).length >= 2, 'action-points + interview return generic generation_failed code');
  ok(/Minutes generation failed\. Please try again\./.test(sd), 'minutes returns a generic failure message');
  ok((sd.match(/console\.error\('(Minutes|Action points|Interview assessment) generation error:'/g) || []).length === 3, 'all three catches log detail server-side');

  const idx = readFileSync(join(SRC, 'index.js'), 'utf8');
  ok(/from '\.\/ratelimit\.js'/.test(idx), 'index.js imports ratelimit.js');
  ok(/checkIpLimit\(/.test(idx) && /checkUserLimit\(/.test(idx), 'index.js wires both IP and user limits');
  ok(/Retry-After/.test(idx), 'index.js sets Retry-After on 429');
  ok(/isSvc/.test(idx), 'index.js exempts svc callers');
  // HTTP catch handlers must not echo error detail.
  ok(!/catch \(err\) \{[\s\S]{0,80}?err\.message/.test(idx), 'index.js HTTP catches do not leak err.message');
}

await partA();
await partB();
partC();

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
