import { NextResponse } from 'next/server';

const PUBLIC = ['/login', '/verify', '/totp', '/api/auth/', '/api/internal/', '/mockups', '/api/bot-queue'];

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyCookie(token, secretStr) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  if (bytesToB64url(new Uint8Array(mac)) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
    if (payload.t !== 'session') return null;
    return payload;
  } catch {
    return null;
  }
}

function isCsrfSafe(req) {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const host = req.nextUrl.host;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  if (origin && origin !== 'null') {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  if (referer) {
    try { return new URL(referer).host === host; } catch { return false; }
  }
  return false; // no origin or referer — reject
}

// ── Content-Security-Policy (strict, nonce-based) ─────────────────────────────
// A fresh nonce is minted per request and attached to the inline theme-bootstrap
// script (the only inline script) and to Next.js's own scripts (Next propagates
// the nonce it finds in the request CSP header). 'strict-dynamic' lets nonced
// scripts load their chunks while ignoring host allowlists, so no 'unsafe-inline'
// is needed for scripts. style-src keeps 'unsafe-inline' only because the UI uses
// React inline style attributes throughout (not nonceable); no inline scripts
// rely on it. connect-src is locked to self + the engine (HTTPS + WSS).
const ENGINE_ORIGIN = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
const WS_ENGINE_ORIGIN = ENGINE_ORIGIN.replace(/^http/, 'ws');

function buildCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${ENGINE_ORIGIN} ${WS_ENGINE_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p));

  const nonce = newNonce();
  const csp = buildCsp(nonce);

  // CSRF: reject state-changing requests whose Origin/Referer doesn't match the app host.
  // Skip CSRF for public routes — machine-to-machine API calls (bot poller, internal)
  // use their own bearer-secret auth and must not be blocked by browser-only CSRF logic.
  if (!isPublic && !isCsrfSafe(req)) {
    return new NextResponse(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Content-Security-Policy': csp },
    });
  }

  // Forward the nonce + CSP on the request so Next.js nonces its own scripts and
  // the root layout can read the nonce for the inline theme script.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const ok = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  if (isPublic) return ok();

  // Session auth: fast cookie signature + expiry check (DB row check happens in server routes)
  const token = req.cookies.get('smc_session')?.value;
  const secretStr = process.env.AUTH_SECRET;
  const payload = secretStr ? await verifyCookie(token, secretStr) : null;
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }
  return ok();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)'],
};
