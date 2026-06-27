// Engine rate limiting (F1) — abuse / cost / DoS backstop for the stateless
// generation endpoints (/transcribe, /coach, /enrich-flag, /minutes,
// /action-points, /interview-assessment).
//
// Built on Cloudflare's native Rate Limiting bindings (env.RL_*; see
// worker/wrangler.toml). The limits are PER cloudflare location, not global,
// which is the documented behaviour and is sufficient as an abuse/DoS backstop
// on top of the auth + body-size cap that already gate these endpoints.
//
// FAIL-OPEN by design. The limiter is a backstop, never a hard dependency of the
// live meeting loop: if a binding is missing (e.g. a dev environment without the
// bindings) or `.limit()` throws, the request is allowed. Authentication and the
// body-size cap still apply, so failing open degrades gracefully to "no extra
// rate limit" rather than taking the copilot offline.
//
// Trusted server-to-server calls (the app server presenting INTERNAL_SHARED_SECRET,
// trust boundary B4) are exempt — they are already authenticated and may
// legitimately burst (e.g. generating minutes); rate limiting them would throttle
// the shared app egress IP for every user at once.

// period must match the `period` configured on each binding in wrangler.toml.
export const RL_PERIOD_SECONDS = 60;

// Source IP for per-IP limiting. CF-Connecting-IP is set by Cloudflare on every
// request; the X-Forwarded-For fallback covers non-CF test harnesses.
export function clientIp(request) {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct.trim();
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

// Check one rate-limit bucket. Returns true if the request is allowed, false if
// the limit was exceeded. Fail-open on a missing/invalid binding or any error.
export async function allow(env, bindingName, key) {
  const rl = env && env[bindingName];
  if (!rl || typeof rl.limit !== 'function') return true; // not configured → allow
  try {
    const res = await rl.limit({ key: String(key) });
    return !(res && res.success === false);
  } catch (_) {
    return true; // a limiter outage must never block the app
  }
}

// Per-IP backstop, applied before the auth callback so a flood of bad-token
// requests cannot hammer the app's validate endpoint. Call only for non-svc
// requests. Returns { ok } — { ok:false, scope:'ip' } when the IP is throttled.
export async function checkIpLimit(env, ip) {
  if (await allow(env, 'RL_IP', `ip:${ip}`)) return { ok: true };
  return { ok: false, scope: 'ip' };
}

// Per-identity limits, applied after auth. `id` is the authenticated user email
// (falls back to the IP when no email is available). Each endpoint gets its own
// counter (path in the key), and the expensive /transcribe path gets an extra,
// tighter bucket. Call only for non-svc requests.
export async function checkUserLimit(env, { id, path }) {
  const who = id || 'unknown';
  if (!(await allow(env, 'RL_USER', `u:${who}:${path}`))) return { ok: false, scope: 'user' };
  if (path === '/transcribe' && !(await allow(env, 'RL_HEAVY', `h:${who}`))) {
    return { ok: false, scope: 'heavy' };
  }
  return { ok: true };
}
