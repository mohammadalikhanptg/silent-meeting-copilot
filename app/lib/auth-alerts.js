const ADMIN = process.env.AUTH_ALERT_EMAIL || process.env.AUTH_ALLOWLIST?.split(',')[0]?.trim();

async function send(subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Silent Meeting Copilot <noreply@pacific.london>';
  if (!apiKey || !ADMIN) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [ADMIN], subject, html }),
  });
}

function row(label, value) {
  return `<tr><td style="padding:4px 12px 4px 0;color:#5a6b7c;font-size:13px">${label}</td><td style="padding:4px 0;font-size:13px">${value || '—'}</td></tr>`;
}

function wrap(title, rows) {
  return `<!doctype html><html><body style="font-family:Outfit,Segoe UI,Arial,sans-serif;background:#0a1929;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
    <h2 style="font-family:Georgia,serif;font-size:18px;margin:0 0 16px;color:#0f2236">⚠️ SMC Security Alert: ${title}</h2>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin:16px 0 0;font-size:11px;color:#8a97a4">Silent Meeting Copilot automated security notification</p>
  </div></body></html>`;
}

export async function alertNewDevice(email, ip, ua) {
  try {
    await send(
      'New device login',
      wrap('New device login', [
        row('Account', email),
        row('IP', ip),
        row('User-Agent', ua),
        row('Time', new Date().toUTCString()),
      ].join(''))
    );
  } catch {}
}

export async function alertTotpLockout(email, ip) {
  try {
    await send(
      'TOTP lockout triggered',
      wrap('TOTP lockout', [
        row('Account', email),
        row('IP', ip),
        row('Time', new Date().toUTCString()),
        row('Action', 'Account locked for 15 minutes after 5 failed TOTP attempts'),
      ].join(''))
    );
  } catch {}
}

export async function alertRevokedSession(email, sid, ip) {
  try {
    await send(
      'Revoked session used',
      wrap('Revoked session attempt', [
        row('Account', email),
        row('Session ID', sid),
        row('IP', ip),
        row('Time', new Date().toUTCString()),
        row('Action', 'Access denied — session was revoked'),
      ].join(''))
    );
  } catch {}
}
