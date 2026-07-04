import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import NewSessionButton from './NewSessionButton';
import SessionsManager from './SessionsManager';
import AppShell from '../components/AppShell';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const sql = getSql();
  const meetings = await sql`
    SELECT m.id, m.title, m.objective, m.language_mode, m.started_at, m.ended_at,
           COUNT(s.id)::int AS segment_count
    FROM meetings m
    LEFT JOIN transcript_segments s ON s.meeting_id = m.id
    WHERE m.user_email = ${session.email}
    GROUP BY m.id
    ORDER BY m.started_at DESC
    LIMIT 50
  `;

  return (
    <AppShell>
      <main className="sessions-root">
        {/* Header */}
        <div className="sessions-header">
          <div>
            <h1 className="sessions-title">Sessions</h1>
            <p className="sessions-sub">Signed in as {session.email}</p>
          </div>
          <div className="sessions-nav">
            <a href="/profile" className="sessions-nav-link">Profile</a>
            {session.role === 'admin' && <a href="/admin" className="sessions-nav-link">Admin</a>}
            <NewSessionButton />
          </div>
        </div>

        <SessionsManager
          initialMeetings={meetings}
          userEmail={session.email}
          userRole={session.role}
        />
      </main>
    </AppShell>
  );
}
