'use client';

export default function LogoutButton() {
  async function go() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <button onClick={go} style={{ marginTop: '24px', minHeight: '44px', padding: '0 18px', background: '#0f2841', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
  );
}
