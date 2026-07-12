import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AppShell from '../components/AppShell';
import { PRODUCT_NAME } from '../lib/brand';
import { planFor, periodFor, ensureUsageSchema } from '../lib/entitlements';

export const dynamic = 'force-dynamic';

function monthLabel(period) {
  // period is 'YYYY-MM'; render as e.g. 'July 2026'
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

export default async function BillingPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const sql = getSql();
  const period = periodFor();

  let usage = null;
  let planName = 'trial';
  try {
    await ensureUsageSchema(sql);
    const [u] = await sql`
      SELECT seconds_used, sessions FROM account_usage
      WHERE user_email = ${session.email} AND period = ${period}`;
    const [user] = await sql`SELECT plan FROM auth_users WHERE email = ${session.email}`;
    usage = u || null;
    planName = user?.plan || 'trial';
  } catch {
    // Usage schema may not exist until the first session ends; show zeros.
  }

  const plan = planFor(planName);
  const minutesUsed = Math.round(Number(usage?.seconds_used || 0) / 60);
  const sessions = usage?.sessions || 0;
  const included = plan.includedMinutes;
  const remaining = Math.max(0, included - minutesUsed);
  const pct = included > 0 ? Math.min(100, Math.round((minutesUsed / included) * 100)) : 0;
  const barColor = pct >= 90 ? 'var(--error)' : pct >= 75 ? 'var(--warn)' : 'var(--success)';

  const stats = [
    { label: 'Plan', value: plan.label },
    { label: 'Minutes this month', value: minutesUsed.toLocaleString('en-GB') },
    { label: 'Sessions', value: String(sessions) },
    { label: 'Included / month', value: included.toLocaleString('en-GB') },
  ];

  return (
    <AppShell>
      <div className="shell-page">
        <div className="shell-page-header" style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {PRODUCT_NAME}
          </p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>Billing</h1>
          <p className="shell-page-sub">Usage for {monthLabel(period)}</p>
        </div>

        {/* Usage panel */}
        <div
          style={{
            background: 'var(--surf-0)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            padding: '20px 22px',
            maxWidth: 640,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)' }}>Minutes used this month</div>
            <div style={{ fontSize: 13, color: 'var(--tx-3)' }}>
              <span style={{ color: 'var(--tx-1)', fontWeight: 600 }}>{minutesUsed.toLocaleString('en-GB')}</span> of {included.toLocaleString('en-GB')} min
            </div>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: 10, borderRadius: 999, background: 'var(--surf-2, var(--border-subtle))', overflow: 'hidden' }}
          >
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx-3)' }}>
            {remaining.toLocaleString('en-GB')} min remaining in your {plan.label} allowance this month.
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, maxWidth: 640 }}>
          {stats.map(s => (
            <div
              key={s.label}
              style={{
                background: 'var(--surf-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx-1)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Not-yet note */}
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--tx-3)', maxWidth: 640, lineHeight: 1.6 }}>
          Usage shown here is measured but not yet enforced or charged. Plan allowances are provisional.
          Subscription changes, invoices and payment arrive with billing.
        </p>
      </div>
    </AppShell>
  );
}
