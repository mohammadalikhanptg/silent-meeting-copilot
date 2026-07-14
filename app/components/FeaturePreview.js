import AppShell from './AppShell';

export default function FeaturePreview({ eyebrow, title, tagline, status, points, footnote }) {
  return (
    <AppShell>
      <div className="shell-page" style={{ maxWidth: 760 }}>
        <div className="shell-page-header" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            {eyebrow}
          </p>
          <h1 className="shell-page-title" style={{ fontSize: 30 }}>{title}</h1>
          <p className="shell-page-sub" style={{ fontSize: 14.5, maxWidth: 560 }}>{tagline}</p>
        </div>

        <div style={{ marginBottom: 26 }}>
          <span className="shell-placeholder-pill">{status}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {points.map((p, i) => (
            <div
              key={i}
              style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                background: 'var(--surf-0)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: '16px 18px',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: 'var(--accent-dim)', color: 'var(--accent-hi)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 3 }}>{p.title}</div>
                <div style={{ fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.6 }}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>

        {footnote && (
          <p style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 22, lineHeight: 1.6, maxWidth: 560 }}>
            {footnote}
          </p>
        )}
      </div>
    </AppShell>
  );
}
