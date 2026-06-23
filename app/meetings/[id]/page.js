import { redirect, notFound } from 'next/navigation';
import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';

export const dynamic = 'force-dynamic';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';

async function fetchCoaching(me, others, objective) {
  if (me.length + others.length < 3) return null;
  try {
    const res = await fetch(`${ENGINE_URL}/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ me, others, objective: objective || '' }),
    });
    const data = await res.json();
    return data.ok ? data : null;
  } catch (_) {
    return null;
  }
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function MeetingDetailPage({ params }) {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const { id } = await params;
  const sql = getSql();

  const [meeting] = await sql`
    SELECT * FROM meetings WHERE id = ${id} AND user_email = ${session.email}
  `;
  if (!meeting) notFound();

  const segments = await sql`
    SELECT speaker, raw, cleaned, lang, ts
    FROM transcript_segments
    WHERE meeting_id = ${id}
    ORDER BY ts
  `;

  const me = segments.filter(s => s.speaker === 'me').map(s => s.cleaned);
  const others = segments.filter(s => s.speaker === 'others').map(s => s.cleaned);
  const coaching = await fetchCoaching(me, others, meeting.objective);

  return (
    <main style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <a href="/meetings" style={styles.back}>&larr; All meetings</a>
          <h1 style={styles.title}>{meeting.title || 'Untitled session'}</h1>
          <div style={styles.meta}>
            {formatDate(meeting.started_at)}
            {meeting.ended_at && ` — ${formatDate(meeting.ended_at)}`}
            &nbsp;&middot;&nbsp;
            <span style={{ textTransform: 'uppercase', fontSize: 10, color: '#38bdf8' }}>
              {meeting.language_mode || 'english'}
            </span>
          </div>
          {meeting.objective && (
            <div style={styles.objective}>Objective: {meeting.objective}</div>
          )}
        </div>
      </div>

      {/* Final coaching summary */}
      {coaching && (
        <div style={styles.coachPanel}>
          <div style={styles.coachTitle}>Meeting Summary — Coaching</div>
          <div style={styles.coachGrid}>
            {/* Talk balance */}
            <div style={styles.coachCell}>
              <div style={styles.coachLabel}>Talk balance</div>
              <div style={styles.balanceRow}>
                <span style={{ ...styles.balanceText, color: '#22c55e' }}>
                  You {coaching.talkBalance?.mePercent ?? 50}%
                </span>
                <div style={styles.balanceBar}>
                  <div
                    style={{
                      ...styles.balanceFill,
                      width: `${coaching.talkBalance?.mePercent ?? 50}%`,
                    }}
                  />
                </div>
                <span style={{ ...styles.balanceText, color: '#38bdf8' }}>
                  Others {coaching.talkBalance?.othersPercent ?? 50}%
                </span>
              </div>
            </div>

            {/* Open items */}
            {coaching.openItems?.length > 0 && (
              <div style={styles.coachCell}>
                <div style={styles.coachLabel}>Open items from others</div>
                <ul style={styles.coachList}>
                  {coaching.openItems.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {coaching.suggestions?.length > 0 && (
              <div style={styles.coachCell}>
                <div style={styles.coachLabel}>Coaching suggestions</div>
                <ul style={{ ...styles.coachList, color: '#fde68a' }}>
                  {coaching.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {/* Alignment */}
            {coaching.alignment && (
              <div style={styles.coachCell}>
                <div style={styles.coachLabel}>Objective alignment</div>
                <div style={{ fontSize: 13, color: '#fbbf24' }}>{coaching.alignment}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div style={styles.transcriptSection}>
        <h2 style={styles.sectionTitle}>Transcript ({segments.length} segments)</h2>
        {segments.length === 0 ? (
          <div style={styles.empty}>No transcript recorded for this session.</div>
        ) : (
          <div style={styles.transcriptList}>
            {segments.map((seg, i) => (
              <div key={i} style={{ ...styles.segRow, borderColor: seg.speaker === 'me' ? '#166534' : '#0c4a6e' }}>
                <span style={{ ...styles.speakerTag, color: seg.speaker === 'me' ? '#22c55e' : '#38bdf8' }}>
                  {seg.speaker === 'me' ? 'ME' : 'OTHERS'}
                </span>
                <span style={styles.segTs}>{new Date(seg.ts).toLocaleTimeString()}</span>
                <span style={styles.segText}>{seg.cleaned}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  back: { fontSize: 12, color: '#6b7280', textDecoration: 'none', display: 'block', marginBottom: 6 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  objective: { fontSize: 13, color: '#9aa0a6', fontStyle: 'italic', marginTop: 6 },
  coachPanel: {
    background: '#13111c',
    border: '1px solid #3b2f6e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  coachTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a78bfa',
    padding: '10px 16px',
    borderBottom: '1px solid #3b2f6e',
  },
  coachGrid: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  coachCell: {
    flex: '1 1 220px',
    padding: '12px 16px',
    borderRight: '1px solid #1f1a30',
    borderBottom: '1px solid #1f1a30',
  },
  coachLabel: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  balanceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  balanceText: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 56 },
  balanceBar: { flex: 1, height: 8, background: '#2a2f37', borderRadius: 4, overflow: 'hidden' },
  balanceFill: {
    height: '100%',
    background: 'linear-gradient(to right, #22c55e, #38bdf8)',
    borderRadius: 4,
  },
  coachList: { margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: '#d1d5db' },
  transcriptSection: {},
  sectionTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#9aa0a6' },
  empty: { color: '#6b7280', fontSize: 14, fontStyle: 'italic' },
  transcriptList: { display: 'flex', flexDirection: 'column', gap: 8 },
  segRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    padding: '6px 10px',
    borderLeft: '3px solid',
    background: '#171a21',
    borderRadius: '0 6px 6px 0',
  },
  speakerTag: { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', minWidth: 46, flexShrink: 0 },
  segTs: { fontSize: 10, color: '#6b7280', flexShrink: 0 },
  segText: { fontSize: 13, lineHeight: 1.5, flex: 1 },
};
