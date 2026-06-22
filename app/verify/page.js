'use client';
import { useEffect, useState } from 'react';

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
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '14px', padding: '28px', boxShadow: '0 16px 40px rgba(10,25,41,0.14)' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '20px', margin: '0 0 6px', color: '#0f2236' }}>Silent Meeting Copilot</h1>
        {status === 'error' ? (
          <div>
            <p style={{ color: '#c0392b', fontSize: '14px', margin: '0 0 12px' }}>This sign-in link is invalid or has expired.</p>
            <a href="/login" style={{ color: '#2AB49F', fontSize: '14px', fontWeight: 600 }}>Request a new link</a>
          </div>
        ) : (
          <div>
            <p style={{ color: '#5a6b7c', fontSize: '14px', margin: '0 0 16px' }}>Confirm it is you to continue signing in.</p>
            <button onClick={go} disabled={status === 'working' || !token} style={{ width: '100%', minHeight: '44px', background: '#2AB49F', color: '#062b27', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>{status === 'working' ? 'Verifying...' : 'Continue sign in'}</button>
          </div>
        )}
      </div>
    </main>
  );
}
