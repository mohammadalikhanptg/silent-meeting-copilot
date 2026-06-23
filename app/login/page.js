'use client';
import { useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';

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
    <main className="aurora-bg auth-root">
      <ThemeToggle className="auth-theme-btn" />
      <div className="auth-card glass-raised">
        <h1 className="auth-wordmark">Silent Meeting Copilot</h1>
        <p className="auth-tagline">Live coaching · Transcription · Follow-up</p>

        {sent ? (
          <div className="auth-success">
            <span className="auth-success-icon">✓</span>
            <span className="auth-success-text">
              If that address is allowed, a sign-in link is on its way. It expires in 15 minutes.
            </span>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="auth-prompt">Enter your email to receive a sign-in link.</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              autoFocus
            />
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
