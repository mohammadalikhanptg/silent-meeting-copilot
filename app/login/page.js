'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '14px', padding: '28px', boxShadow: '0 16px 40px rgba(10,25,41,0.14)' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '22px', margin: '0 0 6px', color: '#0f2236' }}>Silent Meeting Copilot</h1>
        {sent ? (
          <p style={{ color: '#5a6b7c', fontSize: '14px' }}>If that address is allowed, a sign-in link is on its way. It expires in 15 minutes.</p>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: '#5a6b7c', fontSize: '14px', margin: '0 0 16px' }}>Enter your email to receive a sign-in link.</p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #c4ccd4', fontSize: '15px', marginBottom: '12px', boxSizing: 'border-box' }} />
            <button type="submit" disabled={loading} style={{ width: '100%', minHeight: '44px', background: '#2AB49F', color: '#062b27', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>{loading ? 'Sending...' : 'Send sign-in link'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
