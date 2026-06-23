import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import NewSessionButton from './NewSessionButton';
import ThemeToggle from '../components/ThemeToggle';

export const dynamic = 'force-dynamic';

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(started, ended) {
  if (!ended) return null;
  const ms = new Date(ended) - new Date(started);
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function deriveStatus(m) {
  if (m.ended_at) return 'completed';
  if (m.segment_count > 0) return 'in-progress';
  return 'prepared';
}

const STATUS_LABEL = { completed: 'Completed', 'in-progress': 'In progress', prepared: 'Prepared' };
const STATUS_COLOR = { completed: '#22c55e', 'in-progress': '#facc15', prepared: '#38bdf8' };
const STATUS_BG = { completed: '#052e16', 'in-progress': '#1c1a07', prepared: '#0c1f33' };

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
          <ThemeToggle />
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="sessions-empty">
          <div className="sessions-empty-icon">🎙</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)' }}>No sessions yet</div>
          <div style={{ fontSize: 14, color: 'var(--tx-3)', maxWidth: 360, lineHeight: 1.6 }}>
            Create your first session to start real-time coaching, transcription, and follow-up tracking.
          </div>
          <NewSessionButton style={{ marginTop: 8 }} />
        </div>
      ) : (
        <div className="sessions-list">
          {meetings.map(m => {
            const status = deriveStatus(m);
            const href = status === 'completed' ? `/meetings/${m.id}` : `/session?m=${m.id}`;
            const duration = formatDuration(m.started_at, m.ended_at);
            return (
              <a key={m.id} href={href} className="session-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>
                    {m.title || 'Untitled session'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 9px', borderRadius: 'var(--r-full)',
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      color: STATUS_COLOR[status],
                      background: STATUS_BG[status],
                      border: `1px solid ${STATUS_COLOR[status]}33`,
                    }}>
                      {STATUS_LABEL[status]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>{formatDate(m.started_at)}</span>
                  </div>
                </div>
                {m.objective && (
                  <div style={{ fontSize: 13, color: 'var(--tx-2)', fontStyle: 'italic', marginBottom: 8 }}>{m.objective}</div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 9px', borderRadius: 'var(--r-full)',
                    background: 'var(--others-bg)', color: 'var(--others)',
                    fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    {m.language_mode || 'english'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{m.segment_count} segments</span>
                  {duration && <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{duration}</span>}
                  <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 'auto' }}>
                    {status === 'completed' ? 'View review →' : 'Open →'}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
