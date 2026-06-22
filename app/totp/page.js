'use client';
import { useEffect, useState } from 'react';

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

  if (!stage) return (<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#5a6b7c' }}>Loading...</p></main>);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '14px', padding: '28px', boxShadow: '0 16px 40px rgba(10,25,41,0.14)' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '20px', margin: '0 0 6px', color: '#0f2236' }}>Two-factor authentication</h1>
        {stage === 'enroll' && (
          <div>
            <p style={{ color: '#5a6b7c', fontSize: '14px' }}>Scan this with your authenticator app, then enter the 6-digit code to finish setup.</p>
            {qr && <img src={qr} alt="Authenticator QR code" style={{ width: '180px', height: '180px', display: 'block', margin: '14px auto' }} />}
            {secret && <p style={{ fontFamily: 'monospace', fontSize: '13px', textAlign: 'center', color: '#3d5063', wordBreak: 'break-all' }}>{secret}</p>}
          </div>
        )}
        {stage === 'verify' && <p style={{ color: '#5a6b7c', fontSize: '14px' }}>Enter the 6-digit code from your authenticator app.</p>}
        <form onSubmit={submit}>
          <input inputMode="numeric" pattern="[0-9]*" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))} placeholder="123456" style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #c4ccd4', fontSize: '18px', letterSpacing: '4px', textAlign: 'center', margin: '12px 0', boxSizing: 'border-box' }} />
          {error && <p style={{ color: '#c0392b', fontSize: '13px', margin: '0 0 8px' }}>{error}</p>}
          <button type="submit" disabled={loading || code.length !== 6} style={{ width: '100%', minHeight: '44px', background: '#2AB49F', color: '#062b27', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>{loading ? 'Verifying...' : 'Verify'}</button>
        </form>
      </div>
    </main>
  );
}
