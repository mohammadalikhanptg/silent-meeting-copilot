import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AppShell from '../components/AppShell';
import { PRODUCT_NAME } from '../lib/brand';

export const dynamic = 'force-dynamic';

function fmtWhen(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function CommitmentsPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const sql = getSql();
  const email = session.email;

  let open = [];
  let done = [];
  let counts = { total: 0, addressed: 0, week: 0 };
  try {
    const [o, d, c] = await Promise.all([
      sql`
        SELECT fi.id, fi.speaker, fi.text, fi.ts, m.id AS meeting_id, m.title, m.started_at, m.ended_at
        FROM flagged_items fi JOIN meetings m ON m.id = fi.meeting_id
        WHERE m.user_email = ${email} AND fi.addressed_at IS NULL
        ORDER BY fi.ts DESC
        LIMIT 50`,
      sql`
        SELECT fi.id, fi.speaker, fi.text, fi.ts, fi.addressed_at, m.id AS meeting_id, m.title
        FROM flagged_items fi JOIN meetings m ON m.id = fi.meeting_id
        WHERE m.user_email = ${email} AND fi.addressed_at IS NOT NULL
        ORDER BY fi.addressed_at DESC
        LIMIT 10`,
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE fi.addressed_at IS NOT NULL)::int AS addressed,
               COUNT(*) FILTER (WHERE fi.ts > now() - interval '7 days')::int AS week
        FROM flagged_items fi JOIN meetings m ON m.id = fi.meeting_id
        WHERE m.user_email = ${email}`,
    ]);
    open = o;
    done = d;
    counts = c[0] || counts;
  } catch {
    // Tolerate missing data/schema; render empty state.
  }

  const rate = counts.total ? Math.round((counts.addressed / counts.total) * 100) : 0;
  const hasAny = (counts.total || 0) > 0;

  const cardStyle = {
    background: 'var(--surf-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--r-lg)',
    padding: '16px 18px',
  };

  const stats = [
    { label: 'Open', value: String(Math.max(0, (counts.total || 0) - (counts.addressed || 0))) },
    { label: 'Done', value: String(counts.addressed || 0) },
    { label: 'Completion', value: `${rate}%` },
    { label: 'Captured this week', value: String(counts.week || 0) },
  ];

  const speakerChip = (speaker) => {
    const you = speaker === 'me';
    return (
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
        padding: '2px 8px', borderRadius: 999, flexShrink: 0,
        color: you ? 'var(--me)' : 'var(--others)',
        background: you ? 'var(--me-bg)' : 'var(--others-bg)',
        border: `1px solid ${you ? 'var(--me-border)' : 'var(--others-border)'}`,
      }}>
        {you ? 'YOU' : 'THEM'}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="shell-page" style={{ maxWidth: 820 }}>
        <div className="shell-page-header" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {PRODUCT_NAME}
          </p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>Commitments</h1>
          <p className="shell-page-sub">Everything flagged in your sessions, tracked to done</p>
        </div>

        {!hasAny ? (
          <div style={{ ...cardStyle, maxWidth: 640, color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>No commitments yet</div>
            During a live session, flag anything you or the other side commits to and it lands here
            as a working ledger: open items to chase, completed items on the record. Owners, due
            dates and automatic capture arrive with the full Commitments release.
            <div style={{ marginTop: 14 }}>
              <Link href="/session" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-hi)', textDecoration: 'none' }}>
                Start a live session →
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {stats.map(s => (
                <div key={s.label} style={cardStyle}>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Open items */}
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12 }}>
                Open ({open.length})
              </div>
              {open.length ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {open.map((it, idx) => (
                    <div key={it.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '12px 2px',
                      borderBottom: idx < open.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      {speakerChip(it.speaker)}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--tx)', lineHeight: 1.55 }}>{it.text}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 4 }}>
                          <Link
                            href={it.ended_at ? `/meetings/${it.meeting_id}` : `/session?m=${it.meeting_id}`}
                            style={{ color: 'var(--accent-hi)', textDecoration: 'none' }}
                          >
                            {it.title || 'Untitled session'}
                          </Link>
                          {' · '}{fmtWhen(it.ts)}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--tx-3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ago(it.ts)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)' }}>Nothing open. Everything flagged has been addressed.</div>
              )}
            </div>

            {/* Recently completed */}
            {done.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12 }}>
                  Recently completed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {done.map((it, idx) => (
                    <div key={it.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '10px 2px',
                      borderBottom: idx < done.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      opacity: 0.75,
                    }}>
                      <span style={{ color: 'var(--success)', fontSize: 13, flexShrink: 0, lineHeight: 1.5 }}>✓</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5, textDecoration: 'line-through' }}>{it.text}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>
                          {(it.title || 'Untitled session')}{' · done '}{fmtWhen(it.addressed_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.6, margin: 0, maxWidth: 620 }}>
              This is the live v1 ledger built from your flagged items. The full Commitments release adds
              owners, due dates, automatic capture and a post-meeting chase list.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
