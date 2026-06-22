export async function sendMagicLink(email, link) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Silent Meeting Copilot <noreply@pacific.london>';
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const html = `<!doctype html><html><body style="font-family:Outfit,Segoe UI,Arial,sans-serif;background:#0a1929;padding:32px;color:#0f2236;margin:0">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px">
      <h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 8px">Silent Meeting Copilot</h1>
      <p style="margin:0 0 20px;color:#5a6b7c;font-size:14px">Click below to sign in. This link expires in 15 minutes and can be used once.</p>
      <a href="${link}" style="display:inline-block;background:#2AB49F;color:#062b27;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">Sign in</a>
      <p style="margin:22px 0 0;font-size:12px;color:#8a97a4;word-break:break-all">${link}</p>
      <p style="margin:16px 0 0;font-size:12px;color:#8a97a4">If you did not request this, you can ignore this email.</p>
    </div></body></html>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Your Silent Meeting Copilot sign-in link', html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return true;
}
