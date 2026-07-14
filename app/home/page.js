import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AppShell from '../components/AppShell';
import { PRODUCT_NAME } from '../lib/brand';

export const dynamic = 'force-dynamic';

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function HomePage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const sql = getSql();
  const [meetingRows, statsRows] = await Promise.all([
    sql`
      SELECT id, title, started_at, ended_at, language_mode
      FROM meetings
      WHERE user_email = ${session.email}
      ORDER BY started_at DESC
      LIMIT 5
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::int AS completed,
        COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '7 days')::int AS this_week
      FROM meetings
      WHERE user_email = ${session.email}
    `,
  ]);

  const stats = statsRows[0] || { total: 0, completed: 0, this_week: 0 };

  const displayName = session.email.split('@')[0];

  return (
    <AppShell>
      <div className="shell-page">
        {/* Header */}
        <div className="shell-page-header" style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {PRODUCT_NAME}
          </p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>
            Welcome back
          </h1>
          <p className="shell-page-sub">{session.email}</p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Total sessions', value: stats.total, color: 'var(--accent-hi)' },
            { label: 'Completed', value: stats.completed, color: 'var(--success)' },
            { label: 'This week', value: stats.this_week, color: 'var(--others)' },
          ].map(s => (
            <div
              key={s.label}
              style={{
                background: 'var(--surf-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: '16px 20px',
                flex: '1 1 120px',
                minWidth: 100,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="home-grid" style={{ marginBottom: 32 }}>
          <Link href="/session" className="home-card">
            <div className="home-card-icon" style={{ background: 'var(--accent-dim)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--accent-hi)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="3" fill="var(--accent-hi)" strokeWidth="0"/>
                <circle cx="9" cy="9" r="6.5"/>
              </svg>
            </div>
            <div className="home-card-title">Start live session</div>
            <div className="home-card-sub">Real-time transcription and coaching for your next meeting.</div>
            <div className="home-card-arrow">Go live →</div>
          </Link>

          <Link href="/meetings" className="home-card">
            <div className="home-card-icon" style={{ background: 'var(--accent-dim)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--accent-hi)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="14" height="3" rx="1"/>
                <rect x="2" y="8" width="14" height="3" rx="1"/>
                <rect x="2" y="13" width="8" height="3" rx="1"/>
              </svg>
            </div>
            <div className="home-card-title">Session library</div>
            <div className="home-card-sub">Review transcripts, outputs, and coaching summaries.</div>
            <div className="home-card-arrow">View library →</div>
          </Link>

          <Link href="/profile" className="home-card">
            <div className="home-card-icon" style={{ background: 'rgba(251,191,36,0.12)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fbbf24" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="2.5"/>
                <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.41 1.41M13.36 13.36l1.41 1.41M3.22 14.78l1.41-1.41M13.36 4.64l1.41-1.41"/>
              </svg>
            </div>
            <div className="home-card-title">Profile & settings</div>
            <div className="home-card-sub">Configure your profile, coaching style, and preferences.</div>
            <div className="home-card-arrow">Open settings →</div>
          </Link>
        </div>

        {/* Recent sessions */}
        {meetingRows.length > 0 && (
          <div>
            <p className="home-recent-title">Recent sessions</p>
            <div className="home-recent-list">
              {meetingRows.map(m => {
                const href = m.ended_at ? `/meetings/${m.id}` : `/session?m=${m.id}`;
                return (
                  <Link key={m.id} href={href} className="home-recent-item">
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: m.ended_at ? 'var(--success)' : 'var(--warn)',
                    }} />
                    <span className="home-recent-name">{m.title || 'Untitled session'}</span>
                    <span className="home-recent-meta">{formatDate(m.started_at)}</span>
                  </Link>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <Link href="/meetings" style={{ fontSize: 12, color: 'var(--accent-hi)', textDecoration: 'none' }}>
                View all sessions →
              </Link>
            </div>
          </div>
        )}

        {meetingRows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎙</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>No sessions yet</div>
            <div style={{ fontSize: 13, maxWidth: 320, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Start your first live session to get real-time transcription, coaching, and follow-up tracking.
            </div>
            <Link
              href="/session"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 'var(--r-md)',
                background: 'var(--accent-dim)',
                color: 'var(--accent-hi)',
                border: '1px solid var(--accent-dim)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Start live session
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
