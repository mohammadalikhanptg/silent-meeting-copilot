import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import NewSessionButton from './NewSessionButton';

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

const STATUS_LABEL = {
  completed: 'Completed',
  'in-progress': 'In progress',
  prepared: 'Prepared',
};
const STATUS_COLOR = {
  completed: '#22c55e',
  'in-progress': '#facc15',
  prepared: '#38bdf8',
};
const STATUS_BG = {
  completed: '#052e16',
  'in-progress': '#1c1a07',
  prepared: '#0c1f33',
};

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

  const btnStyle = {
    background: '#2AB49F',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  };

  return (
    <main style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Sessions</h1>
          <p style={styles.sub}>Signed in as {session.email}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/profile" style={styles.navLink}>Profile</a>
          {session.role === 'admin' && <a href="/admin" style={styles.navLink}>Admin</a>}
          <NewSessionButton style={btnStyle} />
        </div>
      </div>

      {meetings.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🎙</div>
          <div style={styles.emptyTitle}>No sessions yet</div>
          <div style={styles.emptySub}>
            Create your first session to start real-time coaching, transcription, and follow-up tracking.
          </div>
          <NewSessionButton style={{ ...btnStyle, marginTop: 16 }} />
        </div>
      ) : (
        <div style={styles.list}>
          {meetings.map(m => {
            const status = deriveStatus(m);
            const href = status === 'completed' ? `/meetings/${m.id}` : `/session?m=${m.id}`;
            const duration = formatDuration(m.started_at, m.ended_at);
            return (
              <a key={m.id} href={href} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.cardTitle}>{m.title || 'Untitled session'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      ...styles.statusBadge,
                      color: STATUS_COLOR[status],
                      background: STATUS_BG[status],
                      border: `1px solid ${STATUS_COLOR[status]}33`,
                    }}>
                      {STATUS_LABEL[status]}
                    </span>
                    <span style={styles.cardMeta}>{formatDate(m.started_at)}</span>
                  </div>
                </div>
                {m.objective && (
                  <div style={styles.cardObjective}>{m.objective}</div>
                )}
                <div style={styles.cardFooter}>
                  <span style={styles.pill}>{m.language_mode || 'english'}</span>
                  <span style={styles.cardStat}>{m.segment_count} segments</span>
                  {duration && <span style={styles.cardStat}>{duration}</span>}
                  <span style={{ ...styles.cardStat, marginLeft: 'auto', color: '#38bdf8' }}>
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
    marginBottom: 28,
    gap: 12,
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700 },
  sub: { margin: '4px 0 0', fontSize: 12, color: '#6b7280' },
  navLink: { fontSize: 13, color: '#a78bfa', textDecoration: 'none', alignSelf: 'center' },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    textAlign: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: '#e6e8eb' },
  emptySub: { fontSize: 14, color: '#6b7280', maxWidth: 360, lineHeight: 1.6 },
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
  },
  statusBadge: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 99,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
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
