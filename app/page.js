import { redirect } from 'next/navigation';
import { getSessionPayload } from './lib/auth';
import LogoutButton from './components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');
  return (
    <main style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '26px', color: '#0f2236', margin: '0 0 8px' }}>Silent Meeting Copilot</h1>
      <p style={{ color: '#5a6b7c', fontSize: '15px' }}>Signed in as {session.email}.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <a href="/session" style={{ display: 'inline-block', padding: '10px 20px', background: '#2AB49F', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
          Open Live Session
        </a>
        <a href="/meetings" style={{ display: 'inline-block', padding: '10px 20px', background: '#1e293b', color: '#38bdf8', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px', border: '1px solid #2a3f55' }}>
          Past Meetings
        </a>
        <a href="/profile" style={{ display: 'inline-block', padding: '10px 20px', background: '#1e293b', color: '#a78bfa', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '14px', border: '1px solid #3b2f6e' }}>
          My Profile
        </a>
      </div>
      <LogoutButton />
    </main>
  );
}
