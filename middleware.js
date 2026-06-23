import { NextResponse } from 'next/server';

const PUBLIC = ['/login', '/verify', '/totp', '/api/auth/'];

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

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p));

  // CSRF: reject state-changing requests whose Origin/Referer doesn't match the app host
  if (!isCsrfSafe(req)) {
    return new NextResponse(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isPublic) return NextResponse.next();

  // Session auth: fast cookie signature + expiry check (DB row check happens in server routes)
  const token = req.cookies.get('smc_session')?.value;
  const secretStr = process.env.AUTH_SECRET;
  const payload = secretStr ? await verifyCookie(token, secretStr) : null;
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)'],
};
