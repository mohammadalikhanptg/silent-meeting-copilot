'use client';
import { useEffect, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';

export default function Verify() {
  const [status, setStatus] = useState('ready');
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) setStatus('error');
  }, []);

  async function go() {
    setStatus('working');
    try {
      const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { window.location.href = d.redirect || '/totp'; }
      else { setStatus('error'); }
    } catch {
      setStatus('error');
    }
  }

  return (
    <main className="aurora-bg auth-root">
      <ThemeToggle className="auth-theme-btn" />
      <div className="auth-card glass-raised">
        <h1 className="auth-wordmark">Silent Meeting Copilot</h1>
        <p className="auth-tagline">Confirm your identity to continue</p>

        {status === 'error' ? (
          <div>
            <p className="auth-error-msg">This sign-in link is invalid or has expired.</p>
            <a href="/login" className="auth-link">Request a new link →</a>
          </div>
        ) : (
          <div>
            <p className="auth-prompt">Confirm it is you to continue signing in.</p>
            <button
              onClick={go}
              disabled={status === 'working' || !token}
              className="auth-btn"
            >
              {status === 'working' ? 'Verifying…' : 'Continue sign in'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
