import { redirect, notFound } from 'next/navigation';
import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';
import MinutesPanel from './MinutesPanel';
import ActionPointsPanel from './ActionPointsPanel';
import ThemeToggle from '../../components/ThemeToggle';

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
    SELECT speaker, raw, cleaned, corrected_text, clarified_by_me, lang, ts
    FROM transcript_segments
    WHERE meeting_id = ${id}
    ORDER BY ts
  `;

  const flaggedItems = await sql`
    SELECT id, speaker, text, ts, status, assist_text, reference_json, addressed_at
    FROM flagged_items
    WHERE meeting_id = ${id}
    ORDER BY ts
  `;

  const refDocs = await sql`
    SELECT id, filename, added_at, length(content_text) AS size_bytes
    FROM session_reference_docs
    WHERE meeting_id = ${id}
    ORDER BY added_at
  `;

  // Coaching uses corrected OTHERS text where available
  const me = segments.filter(s => s.speaker === 'me').map(s => s.cleaned);
  const others = segments
    .filter(s => s.speaker === 'others')
    .map(s => s.corrected_text || s.cleaned);
  const coaching = await fetchCoaching(me, others, meeting.objective);

  const clarifiedCount = segments.filter(s => s.clarified_by_me).length;

  return (
    <main style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1 }}>
          <a href="/meetings" style={styles.back}>&larr; All sessions</a>
          <h1 style={styles.title}>{meeting.title || 'Untitled session'}</h1>
          <div style={styles.meta}>
            {formatDate(meeting.started_at)}
            {meeting.ended_at && ` — ${formatDate(meeting.ended_at)}`}
            &nbsp;&middot;&nbsp;
            <span style={{ textTransform: 'uppercase', fontSize: 10, color: 'var(--others)' }}>
              {meeting.language_mode || 'english'}
            </span>
            {meeting.mode_type && meeting.mode_type !== 'meeting' && (
              <>
                &nbsp;&middot;&nbsp;
                <span style={{ textTransform: 'capitalize', fontSize: 10, color: 'var(--me)' }}>
                  {meeting.mode_type.replace('_', ' ')}
                </span>
              </>
            )}
            {clarifiedCount > 0 && (
              <>
                &nbsp;&middot;&nbsp;
                <span style={{ fontSize: 10, color: 'var(--me)' }}>
                  {clarifiedCount} turn{clarifiedCount !== 1 ? 's' : ''} clarified
                </span>
              </>
            )}
          </div>
          {meeting.objective && (
            <div style={styles.objective}>Objective: {meeting.objective}</div>
          )}
          {meeting.context_notes && (
            <div style={{ ...styles.objective, color: 'var(--tx-3)', marginTop: 2 }}>
              Context: {meeting.context_notes}
            </div>
          )}
        </div>
        <ThemeToggle />
      </div>

      {/* Final coaching summary */}
      {coaching && (
        <div className="smc-coach-panel">
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

            {/* Repairs note */}
            {clarifiedCount > 0 && (
              <div style={styles.coachCell}>
                <div style={styles.coachLabel}>Transcript repairs</div>
                <div style={{ fontSize: 12, color: '#34d399', lineHeight: 1.5 }}>
                  {clarifiedCount} OTHERS turn{clarifiedCount !== 1 ? 's' : ''} were auto-corrected from your restatements.
                  Coaching reflects the corrected meanings.
                </div>
              </div>
            )}

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

      {/* Reference documents */}
      {refDocs.length > 0 && (
        <div style={{ background: '#0d1421', border: '1px solid #1e3a5f', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Reference Documents ({refDocs.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {refDocs.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9aa0a6' }}>
                <span>📄</span>
                <span style={{ flex: 1 }}>{doc.filename}</span>
                <span style={{ fontSize: 10, color: '#4b5563' }}>{Math.ceil(doc.size_bytes / 1024)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Minutes export */}
      <MinutesPanel meetingId={id} />
      <ActionPointsPanel meetingId={id} />

      {/* Flagged items — follow-up tracker review */}
      {flaggedItems.length > 0 && (
        <div style={styles.followUpSection}>
          <div style={styles.followUpTitle}>Follow-up Tracker ({flaggedItems.length} flagged)</div>
          <div style={styles.followUpGrid}>
            {/* Left: Talking Points */}
            <div style={styles.followUpCol}>
              <div style={styles.followUpColHead}>Talking Points</div>
              {flaggedItems.map((item, idx) => (
                <div key={item.id} style={{ ...styles.tpItem, opacity: item.addressed_at ? 0.5 : 1 }}>
                  <span style={styles.tpNum}>{idx + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={styles.tpQuote}>&ldquo;{item.text}&rdquo;</div>
                    <div style={styles.tpMeta}>
                      {item.speaker === 'others' ? 'OTHERS' : 'ME'} &middot; {new Date(item.ts).toLocaleTimeString()}
                      {item.addressed_at && <span style={{ color: '#4ade80', marginLeft: 8 }}>✓ Addressed</span>}
                    </div>
                    {item.assist_text && (
                      <div style={styles.tpAssist}>{item.assist_text}</div>
                    )}
                    {!item.assist_text && item.status !== 'enriched' && (
                      <div style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>
                        {item.status === 'processing' ? 'Processing…' : 'Not yet enriched'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Right: References */}
            <div style={styles.followUpCol}>
              <div style={{ ...styles.followUpColHead, color: '#60a5fa' }}>References</div>
              {flaggedItems.map((item, idx) => {
                const refs = item.reference_json || [];
                return (
                  <div key={item.id} style={styles.refItem}>
                    <span style={{ ...styles.tpNum, borderColor: '#1e3a5f', color: '#60a5fa', background: '#0c1f33' }}>{idx + 1}</span>
                    <div style={{ flex: 1 }}>
                      {refs.length > 0 ? refs.map((r, ri) => (
                        <div key={ri} style={{ marginBottom: 6 }}>
                          <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>{r.title}</a>
                          {r.snippet && <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{r.snippet}</div>}
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: '#374151' }}>
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(item.text.slice(0, 60))}`}
                            target="_blank" rel="noreferrer"
                            style={{ color: '#60a5fa' }}
                          >
                            Search Google
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
              <div
                key={i}
                style={{
                  ...styles.segRow,
                  borderColor: seg.speaker === 'me' ? '#166534' : '#0c4a6e',
                }}
              >
                <span style={{
                  ...styles.speakerTag,
                  color: seg.speaker === 'me' ? '#22c55e' : '#38bdf8',
                }}>
                  {seg.speaker === 'me' ? 'ME' : 'OTHERS'}
                </span>
                <span style={styles.segTs}>{new Date(seg.ts).toLocaleTimeString()}</span>
                <div style={{ flex: 1 }}>
                  {seg.clarified_by_me && seg.corrected_text ? (
                    <>
                      <span style={styles.clarifiedBadge}>clarified</span>
                      <span style={{ ...styles.segText, color: '#86efac' }}>
                        {seg.corrected_text}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#6b7280',
                          textDecoration: 'line-through',
                          marginLeft: 8,
                          cursor: 'help',
                        }}
                        title="Original transcription"
                      >
                        {seg.cleaned}
                      </span>
                    </>
                  ) : (
                    <span style={styles.segText}>{seg.cleaned}</span>
                  )}
                </div>
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
    background: 'var(--bg)',
    color: 'var(--tx)',
    fontFamily: 'var(--font-sans)',
    padding: '32px 24px',
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  back: { fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'block', marginBottom: 6 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' },
  meta: { fontSize: 12, color: 'var(--tx-3)', marginTop: 4, fontFeatureSettings: '"tnum"' },
  objective: { fontSize: 13, color: 'var(--tx-2)', fontStyle: 'italic', marginTop: 6 },
  // coachPanel outer is className="smc-coach-panel"
  coachTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--coach)',
    padding: '10px 16px',
    borderBottom: '1px solid var(--coach-border)',
  },
  coachGrid: { display: 'flex', flexWrap: 'wrap' },
  coachCell: {
    flex: '1 1 220px',
    padding: '12px 16px',
    borderRight: '1px solid rgba(255,255,255,0.05)',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  coachLabel: {
    fontSize: 10,
    color: 'var(--tx-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  balanceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  balanceText: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 56 },
  balanceBar: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' },
  balanceFill: {
    height: '100%',
    background: 'linear-gradient(to right, var(--me), var(--others))',
    borderRadius: 4,
  },
  coachList: { margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--tx)' },
  transcriptSection: {},
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 },
  empty: { color: 'var(--tx-3)', fontSize: 14, fontStyle: 'italic' },
  transcriptList: { display: 'flex', flexDirection: 'column', gap: 8 },
  segRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    padding: '6px 10px',
    borderLeft: '3px solid',
    background: 'var(--bg-panel)',
    borderRadius: '0 6px 6px 0',
  },
  speakerTag: { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', minWidth: 46, flexShrink: 0 },
  segTs: { fontSize: 10, color: 'var(--tx-3)', flexShrink: 0, fontFeatureSettings: '"tnum"' },
  segText: { fontSize: 13, lineHeight: 1.5, color: 'var(--tx)' },
  followUpSection: { background: 'var(--followup-bg)', border: '1px solid var(--followup-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  followUpTitle: { fontSize: 13, fontWeight: 600, color: 'var(--followup)', padding: '10px 16px', borderBottom: '1px solid var(--followup-border)' },
  followUpGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 },
  followUpCol: { padding: 14, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  followUpColHead: { fontSize: 11, fontWeight: 600, color: 'var(--followup)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  tpItem: { display: 'flex', gap: 8, padding: '8px 10px', background: 'var(--me-bg)', borderRadius: 6, border: '1px solid var(--me-border)' },
  refItem: { display: 'flex', gap: 8, padding: '8px 10px', minHeight: 40 },
  tpNum: { fontSize: 10, fontWeight: 700, color: 'var(--followup)', background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 5px', height: 18, flexShrink: 0, display: 'flex', alignItems: 'center' },
  tpQuote: { fontSize: 13, color: 'var(--tx)', fontStyle: 'italic', marginBottom: 2 },
  tpMeta: { fontSize: 10, color: 'var(--tx-3)', marginBottom: 4 },
  tpAssist: { fontSize: 12, color: 'var(--me)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  clarifiedBadge: {
    fontSize: 9,
    fontWeight: 700,
    color: '#34d399',
    background: '#052e16',
    border: '1px solid #166534',
    borderRadius: 4,
    padding: '1px 5px',
    marginRight: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
};
