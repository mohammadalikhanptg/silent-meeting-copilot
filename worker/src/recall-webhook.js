// ---------------------------------------------------------------------------
// Recall.ai inbound webhook verification (Recall integration 1/N)
// ---------------------------------------------------------------------------
//
// Recall.ai signs webhooks with the Svix scheme. This module is the near-pure
// receiver that authenticates an inbound request BEFORE any payload is trusted.
// It performs no network and no DB work; it only verifies the signature and,
// on success, parses the JSON body. Wiring it into a real route (and into the
// bot-ingest seam) is a later increment.
//
// Svix signature scheme (as Recall implements it):
//   • Headers: webhook-id, webhook-timestamp, webhook-signature.
//   • The signing secret is "whsec_" + base64(key bytes). Strip the prefix and
//     base64-decode the remainder to recover the raw HMAC key.
//   • Signed content is the exact string `${id}.${timestamp}.${rawBody}` — the
//     RAW request body, byte-for-byte, never a re-serialised object.
//   • signature = base64( HMAC-SHA256(key, signedContent) ).
//   • The webhook-signature header is a space-separated list of versioned
//     signatures like "v1,<base64> v1,<base64> v2,...". We accept the request
//     if ANY v1 entry matches, compared in constant time.
//
// Returns { ok:false, reason } on any failure (missing/invalid secret, missing
// headers, bad signature, unparseable body) and { ok:true, event, payload } on
// success. It never throws on attacker-controlled input.

const SECRET_PREFIX = 'whsec_';

// Constant-time string comparison. Returns false for unequal lengths (a length
// mismatch already proves inequality); equal-length inputs are compared without
// early exit so timing does not reveal how many leading characters matched.
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Standard base64 -> Uint8Array, runtime-portable (Workers and Node).
function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback.
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

// Uint8Array -> standard base64, runtime-portable.
function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

async function hmacSha256Base64(keyBytes, message) {
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || null;
  if (!subtle) throw new Error('WebCrypto subtle unavailable');
  const key = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

// Read a header case-insensitively from either a Headers instance or a plain
// object (as produced in tests).
function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return null;
}

// Verify the Svix signature on a raw webhook body and parse it.
//   headers : Headers instance or plain object carrying webhook-* headers
//   rawBody : the exact request body string (must NOT be re-serialised)
//   secret  : the workspace verification secret, "whsec_..."
export async function verifyAndParse(headers, rawBody, secret) {
  if (typeof secret !== 'string' || !secret.startsWith(SECRET_PREFIX)) {
    return { ok: false, reason: 'missing_or_invalid_secret' };
  }
  if (typeof rawBody !== 'string') {
    return { ok: false, reason: 'missing_body' };
  }

  const id = headerGet(headers, 'webhook-id');
  const timestamp = headerGet(headers, 'webhook-timestamp');
  const signatureHeader = headerGet(headers, 'webhook-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  let expected;
  try {
    const keyBytes = base64ToBytes(secret.slice(SECRET_PREFIX.length));
    expected = await hmacSha256Base64(keyBytes, `${id}.${timestamp}.${rawBody}`);
  } catch {
    return { ok: false, reason: 'verification_error' };
  }

  // Header may list several space-separated "version,signature" pairs. Accept
  // only v1 entries, and require at least one constant-time match.
  const matched = signatureHeader
    .split(' ')
    .some((part) => {
      const comma = part.indexOf(',');
      if (comma < 0) return false;
      const version = part.slice(0, comma);
      const sig = part.slice(comma + 1);
      return version === 'v1' && timingSafeEqualStr(sig, expected);
    });

  if (!matched) return { ok: false, reason: 'signature_mismatch' };

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  // Recall/Svix carries the event type at the top level; tolerate a nested
  // shape too. Never trust the body for anything until ok:true is returned.
  const event =
    (payload && (payload.event || (payload.data && payload.data.event))) || null;

  return { ok: true, event, payload };
}
