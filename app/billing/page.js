import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import AppShell from '../components/AppShell';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  return (
    <AppShell>
      <div className="shell-placeholder">
        <div className="shell-placeholder-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-hi)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <path d="M2 10h20"/>
            <path d="M7 15h2M14 15h3"/>
          </svg>
        </div>
        <span className="shell-placeholder-pill">Coming in Phase 2</span>
        <h1 className="shell-placeholder-title">Billing</h1>
        <p className="shell-placeholder-sub">
          Subscription management, usage metering, and entitlements. Upgrade, downgrade,
          and monitor your session usage — all in one place.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, maxWidth: 480, width: '100%', marginTop: 8 }}>
          {[
            { title: 'Current plan', desc: 'Subscription tier and limits' },
            { title: 'Usage', desc: 'Sessions and minutes consumed' },
            { title: 'Invoices', desc: 'Download billing history' },
            { title: 'Upgrade', desc: 'Compare plans and tiers' },
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
