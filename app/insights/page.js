import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import AppShell from '../components/AppShell';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  return (
    <AppShell>
      <div className="shell-placeholder">
        <div className="shell-placeholder-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-hi)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18l5-5 4 3.5 4-8 5 5"/>
            <path d="M18 8V5h-3"/>
          </svg>
        </div>
        <span className="shell-placeholder-pill">Coming in Phase 2</span>
        <h1 className="shell-placeholder-title">Insights</h1>
        <p className="shell-placeholder-sub">
          Analytics across all your sessions — talk-time distribution, meeting frequency,
          coaching trend lines, and topic clustering. Built from your real data, not samples.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, maxWidth: 560, width: '100%', marginTop: 8 }}>
          {[
            { title: 'Talk balance', desc: 'Me vs others over time' },
            { title: 'Meeting cadence', desc: 'Frequency and duration trends' },
            { title: 'Topic patterns', desc: 'Recurring themes and keywords' },
            { title: 'Coaching score', desc: 'Objective alignment progress' },
          ].map(f => (
            <div
              key={f.title}
              style={{
                background: 'var(--surf-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: '14px 16px',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
