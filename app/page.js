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
      <p style={{ color: '#5a6b7c', fontSize: '15px' }}>Signed in as {session.email}. The product surface is under construction. This page confirms the workspace is locked to your account behind magic-link and authenticator sign-in.</p>
      <LogoutButton />
    </main>
  );
}
