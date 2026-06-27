// Per-device helper pairing (security finding F2).
//
// Before F2 a user had ONE pairing key {email, version}; the only revocation was
// bumping the version, which kicked every one of that user's devices at once. F2
// adds a per-device identity (a server-issued device id baked into the signed key)
// plus an individual revocation list (the `helper_devices` table), so a single
// leaked or retired device can be revoked without disturbing the others.
//
// This module is deliberately free of any Next.js / DB imports so the
// security-critical decision can be unit-tested offline with real coverage. The
// key codec itself lives in app/lib/auth.js (it needs the signing keyring); this
// module owns the device id generator and the accept/reject decision.

import crypto from 'node:crypto';

// Server-issued, unguessable, PII-free device identifier. Baked into the pairing
// key payload (`d`) at issue time and recorded in helper_devices.device_id.
export function newHelperDeviceId() {
  return 'hd_' + crypto.randomBytes(12).toString('base64url');
}

// Decide whether a verified pairing key may connect, given the device row looked
// up from helper_devices (or null if there is no such row). `decoded` is the
// result of verifyHelperKeyHmac — its HMAC and the coarse helper_key_version are
// checked by the caller BEFORE this; here we apply only the per-device layer.
//
// Returns { ok: boolean, reason?: string, legacy?: boolean }. Fails closed.
export function helperDeviceDecision(decoded, deviceRow) {
  if (!decoded || !decoded.email) return { ok: false, reason: 'invalid key' };

  // Legacy key minted before F2 (no device id). Accept on the coarse checks the
  // caller already passed — this is the migration bridge so currently-paired
  // helpers keep working until they re-pair. Flagged so the caller can log it and
  // a future hard cutover can reject these once every device has re-paired.
  if (!decoded.deviceId) return { ok: true, legacy: true };

  if (!deviceRow) return { ok: false, reason: 'device unknown' };
  // Defence in depth: the lookup is already scoped by user_email, but never let a
  // device row from a different account authorise this key.
  if (deviceRow.user_email && deviceRow.user_email !== decoded.email) {
    return { ok: false, reason: 'device mismatch' };
  }
  if (deviceRow.revoked_at) return { ok: false, reason: 'device revoked' };
  return { ok: true };
}
