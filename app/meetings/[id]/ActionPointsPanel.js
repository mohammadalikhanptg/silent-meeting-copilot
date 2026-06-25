'use client';
import { useState } from 'react';

function buildMarkdown(d) {
  const L = [];
  L.push(`# Action Points — ${d.title || 'Untitled session'}`);
  if (d.date) L.push(`_${d.date}_`);
  L.push('');
  L.push(`## Actions for ${d.speakerName || 'you'}`);
  if (d.speakerActions && d.speakerActions.length) {
    d.speakerActions.forEach(a => L.push(`- ${a.action}${a.due ? `  (due ${a.due})` : ''}`));
  } else L.push('- None recorded');
  L.push('');
  L.push('## Actions for others');
  if (d.othersActions && d.othersActions.length) {
    d.othersActions.forEach(a => L.push(`- **${a.who}:** ${a.action}${a.due ? `  (due ${a.due})` : ''}`));
  } else L.push('- None recorded');
  L.push('');
  return L.join('\n');
}

export default function ActionPointsPanel({ meetingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    if (data) { setOpen(o => !o); return data; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-points`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to generate action points');
      setData(d); setOpen(true); return d;
    } catch (err) { setError(err.message); return null; }
    finally { setLoading(false); }
  }

  async function download() {
    const d = data || await load();
    if (!d) return;
    const md = buildMarkdown(d);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `action-points-${d.date || 'session'}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={s.wrapper}>
      <div style={s.bar}>
        <span style={s.label}>Action Points</span>
        <div style={s.actions}>
          <button onClick={load} disabled={loading} style={{ ...s.btn, ...s.btnSecondary }}>
            {loading ? 'Generating…' : open ? 'Hide preview' : 'Preview action points'}
          </button>
          <button onClick={download} disabled={loading} style={{ ...s.btn, ...s.btnPrimary }}>
            Download Action Points
          </button>
          <a href={`/api/meetings/${meetingId}/transcript`} download style={{ ...s.btn, ...s.btnSecondary }}>
            Download full transcript
          </a>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {open && data && (
        <div style={s.previewPanel}>
          {data.emptyState ? (
            <div style={s.emptyMsg}>No transcript was recorded for this session, so there are no action points.</div>
          ) : (
            <>
              <div style={s.section}>
                <div style={s.sectionHead}>Actions for {data.speakerName || 'you'}</div>
                {data.speakerActions && data.speakerActions.length ? (
                  <ul style={s.list}>
                    {data.speakerActions.map((a, i) => (
                      <li key={i}>{a.action}{a.due ? <span style={s.due}> (due {a.due})</span> : null}</li>
                    ))}
                  </ul>
                ) : <div style={s.none}>None recorded</div>}
              </div>
              <div style={s.section}>
                <div style={s.sectionHead}>Actions for others</div>
                {data.othersActions && data.othersActions.length ? (
                  <ul style={s.list}>
                    {data.othersActions.map((a, i) => (
                      <li key={i}><strong>{a.who}:</strong> {a.action}{a.due ? <span style={s.due}> (due {a.due})</span> : null}</li>
                    ))}
                  </ul>
                ) : <div style={s.none}>None recorded</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { background: 'var(--me-bg)', border: '1px solid var(--me-border, var(--border))', borderRadius: 12, overflow: 'hidden' },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--me)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 500, textDecoration: 'none', border: 'none', display: 'inline-block', lineHeight: 1.6, fontFamily: 'inherit' },
  btnPrimary: { background: 'var(--accent)', color: '#fff' },
  btnSecondary: { background: 'var(--bg-raised)', color: 'var(--tx-2)', border: '1px solid var(--border)' },
  error: { color: 'var(--error)', fontSize: 12, padding: '8px 16px' },
  previewPanel: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  emptyMsg: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  section: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  sectionHead: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--me)', marginBottom: 6 },
  list: { margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--tx)', lineHeight: 1.7 },
  none: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  due: { color: 'var(--tx-3)', fontSize: 12 },
};
