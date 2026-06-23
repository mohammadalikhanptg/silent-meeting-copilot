import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';

export const dynamic = 'force-dynamic';

function formatDuration(started, ended) {
  if (!ended) return 'In progress';
  const ms = new Date(ended) - new Date(started);
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function MeetingsPage() {
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
    <main style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Past Meetings</h1>
          <p style={styles.sub}>Signed in as {session.email}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/" style={styles.link}>&larr; Home</a>
          <a href="/session" style={styles.btn}>New Session</a>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div style={styles.empty}>
          No meetings recorded yet. Start a session to begin recording.
        </div>
      ) : (
        <div style={styles.list}>
          {meetings.map(m => (
            <a key={m.id} href={`/meetings/${m.id}`} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardTitle}>{m.title || 'Untitled session'}</span>
                <span style={styles.cardMeta}>{formatDate(m.started_at)}</span>
              </div>
              {m.objective && (
                <div style={styles.cardObjective}>{m.objective}</div>
              )}
              <div style={styles.cardFooter}>
                <span style={styles.pill}>{m.language_mode || 'english'}</span>
                <span style={styles.cardStat}>{m.segment_count} segments</span>
                <span style={styles.cardStat}>{formatDuration(m.started_at, m.ended_at)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0f1115',
    color: '#e6e8eb',
    fontFamily: '"Segoe UI",system-ui,-apple-system,sans-serif',
    padding: '32px 24px',
    maxWidth: 860,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 12,
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  sub: { margin: '4px 0 0', fontSize: 12, color: '#6b7280' },
  link: { fontSize: 13, color: '#9aa0a6', textDecoration: 'none', alignSelf: 'center' },
  btn: {
    background: '#2AB49F',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 48,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    display: 'block',
    background: '#171a21',
    border: '1px solid #2a2f37',
    borderRadius: 10,
    padding: '14px 16px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.15s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: '#e6e8eb' },
  cardMeta: { fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' },
  cardObjective: {
    fontSize: 13,
    color: '#9aa0a6',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cardFooter: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  pill: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 99,
    background: '#1e293b',
    color: '#38bdf8',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  cardStat: { fontSize: 11, color: '#6b7280' },
};
