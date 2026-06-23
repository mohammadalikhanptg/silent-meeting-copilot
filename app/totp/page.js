'use client';
import { useEffect, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';

export default function Totp() {
  const [stage, setStage] = useState(null);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/totp')
      .then(async (r) => {
        if (!r.ok) { window.location.href = '/login'; return; }
        const d = await r.json();
        setStage(d.stage);
        setQr(d.qr || null);
        setSecret(d.secret || null);
      })
      .catch(() => { window.location.href = '/login'; });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/auth/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const d = await r.json();
      if (r.ok && d.ok) { window.location.href = d.redirect || '/'; }
      else { setError('That code was not valid. Use the current code from your authenticator.'); }
    } finally {
      setLoading(false);
    }
  }

  if (!stage) {
    return (
      <main className="aurora-bg auth-root">
        <p style={{ color: 'var(--tx-3)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main className="aurora-bg auth-root">
      <ThemeToggle className="auth-theme-btn" />
      <div className="auth-card glass-raised">
        <h1 className="auth-wordmark">Two-factor authentication</h1>
        <p className="auth-tagline">Authenticator app required</p>

        {stage === 'enroll' && (
          <div>
            <p className="auth-prompt">
              Scan this QR code with your authenticator app, then enter the 6-digit code to finish setup.
            </p>
            {qr && <img src={qr} alt="Authenticator QR code" className="auth-qr" />}
            {secret && <div className="auth-secret">{secret}</div>}
          </div>
        )}

        {stage === 'verify' && (
          <p className="auth-prompt">Enter the 6-digit code from your authenticator app.</p>
        )}

        <form onSubmit={submit}>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="123456"
            className="auth-input code-input"
            autoFocus
            autoComplete="one-time-code"
          />
          {error && <p className="auth-error-msg">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="auth-btn"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    </main>
  );
}
