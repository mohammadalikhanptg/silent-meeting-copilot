import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/auth';
import { getSql } from '../lib/db';
import AppShell from '../components/AppShell';
import { PRODUCT_NAME } from '../lib/brand';

export const dynamic = 'force-dynamic';

function fmtDuration(totalSeconds) {
  const mins = Math.round(Number(totalSeconds || 0) / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Build an 8-week axis (oldest -> newest) with counts matched from grouped rows.
function weeklySeries(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = new Date(r.wk).toISOString().slice(0, 10);
    map.set(key, Number(r.n) || 0);
  }
  const out = [];
  const now = new Date();
  // Start of current week (Monday, UTC) to align with date_trunc('week')
  const day = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    out.push({ key, label: d.toLocaleString('en-GB', { day: '2-digit', month: 'short' }), n: map.get(key) || 0 });
  }
  return out;
}

export default async function InsightsPage() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');

  const sql = getSql();
  const email = session.email;

  let totals = { total: 0, completed: 0, total_seconds: 0, month_seconds: 0 };
  let weekRows = [];
  let talk = [];
  let modes = [];
  let followups = { total: 0, addressed: 0 };
  try {
    const [t, w, tb, md, fu] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::int AS completed,
               COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL), 0)::bigint AS total_seconds,
               COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL AND started_at >= date_trunc('month', now())), 0)::bigint AS month_seconds
        FROM meetings WHERE user_email = ${email}`,
      sql`
        SELECT date_trunc('week', started_at) AS wk, COUNT(*)::int AS n
        FROM meetings
        WHERE user_email = ${email} AND started_at > now() - interval '8 weeks'
        GROUP BY wk ORDER BY wk`,
      sql`
        SELECT ts.speaker AS speaker, COUNT(*)::int AS n
        FROM transcript_segments ts JOIN meetings m ON m.id = ts.meeting_id
        WHERE m.user_email = ${email}
        GROUP BY ts.speaker`,
      sql`
        SELECT mode_type, COUNT(*)::int AS n
        FROM meetings WHERE user_email = ${email}
        GROUP BY mode_type ORDER BY n DESC`,
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE addressed_at IS NOT NULL)::int AS addressed
        FROM flagged_items fi JOIN meetings m ON m.id = fi.meeting_id
        WHERE m.user_email = ${email}`,
    ]);
    totals = t[0] || totals;
    weekRows = w;
    talk = tb;
    modes = md;
    followups = fu[0] || followups;
  } catch {
    // If the analytics queries fail (e.g. no data yet), fall through to empty state.
  }

  const hasData = (totals.total || 0) > 0;

  const meN = Number(talk.find(r => r.speaker === 'me')?.n || 0);
  const othersN = Number(talk.find(r => r.speaker === 'others')?.n || 0);
  const talkTotal = meN + othersN;
  const mePct = talkTotal ? Math.round((meN / talkTotal) * 100) : 0;
  const othersPct = talkTotal ? 100 - mePct : 0;

  const weeks = weeklySeries(weekRows);
  const weekMax = Math.max(1, ...weeks.map(w => w.n));

  const fuRate = followups.total ? Math.round((followups.addressed / followups.total) * 100) : 0;

  const modeLabels = { meeting: 'Meeting', interview: 'Interview', customer_service: 'Customer service', bot: 'Bot' };
  const modeMax = Math.max(1, ...modes.map(m => Number(m.n) || 0));

  const cardStyle = {
    background: 'var(--surf-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--r-lg)',
    padding: '16px 18px',
  };

  const stats = [
    { label: 'Sessions', value: String(totals.completed || 0) },
    { label: 'Total time', value: fmtDuration(totals.total_seconds) },
    { label: 'This month', value: fmtDuration(totals.month_seconds) },
    { label: 'Follow-ups done', value: followups.total ? `${followups.addressed}/${followups.total}` : '0' },
  ];

  return (
    <AppShell>
      <div className="shell-page">
        <div className="shell-page-header" style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {PRODUCT_NAME}
          </p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>Insights</h1>
          <p className="shell-page-sub">Built from your real sessions</p>
        </div>

        {!hasData ? (
          <div style={{ ...cardStyle, maxWidth: 640, color: 'var(--tx-3)', fontSize: 13, lineHeight: 1.6 }}>
            Your insights appear here after your first completed session: talk balance, weekly cadence,
            session types and follow-up completion, all from your own data.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
            {/* Stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {stats.map(s => (
                <div key={s.label} style={cardStyle}>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx-1)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Talk balance */}
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12 }}>Talk balance</div>
              {talkTotal ? (
                <>
                  <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--surf-2, var(--border-subtle))' }}>
                    <div style={{ width: `${mePct}%`, background: 'var(--me, var(--success))' }} />
                    <div style={{ width: `${othersPct}%`, background: 'var(--others, var(--accent-hi))' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--tx-3)' }}>
                    <span><span style={{ color: 'var(--me, var(--success))', fontWeight: 600 }}>You {mePct}%</span></span>
                    <span><span style={{ color: 'var(--others, var(--accent-hi))', fontWeight: 600 }}>Others {othersPct}%</span></span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>No transcript captured yet.</div>
              )}
            </div>

            {/* Weekly cadence */}
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 14 }}>Sessions per week</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
                {weeks.map(w => (
                  <div key={w.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-3)', fontVariantNumeric: 'tabular-nums' }}>{w.n || ''}</div>
                    <div
                      title={`${w.n} sessions`}
                      style={{
                        width: '100%',
                        height: `${Math.max(3, Math.round((w.n / weekMax) * 72))}px`,
                        background: w.n ? 'var(--accent-hi)' : 'var(--border-subtle)',
                        borderRadius: 'var(--r-sm, 4px)',
                        transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)',
                      }}
                    />
                    <div style={{ fontSize: 9.5, color: 'var(--tx-3)' }}>{w.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Session types + follow-ups */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12 }}>Session types</div>
                {modes.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {modes.map(m => (
                      <div key={m.mode_type} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{modeLabels[m.mode_type] || m.mode_type}</span>
                        <span style={{ height: 8, borderRadius: 999, background: 'var(--surf-2, var(--border-subtle))', overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${Math.round((Number(m.n) / modeMax) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--tx-2)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.n}</span>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>No sessions yet.</div>}
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 12 }}>Follow-ups</div>
                {followups.total ? (
                  <>
                    <div style={{ height: 10, borderRadius: 999, background: 'var(--surf-2, var(--border-subtle))', overflow: 'hidden' }}>
                      <div style={{ width: `${fuRate}%`, height: '100%', background: 'var(--success)' }} />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--tx-3)' }}>
                      {followups.addressed} of {followups.total} addressed ({fuRate}%)
                    </div>
                  </>
                ) : <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>No flagged follow-ups yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
