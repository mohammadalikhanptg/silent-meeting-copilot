'use client';
import { useState } from 'react';

const SIGNALS = {
  green:  { color: '#22c55e', label: 'Green', verdict: 'Claims held up well against the evidence' },
  orange: { color: '#f59e0b', label: 'Orange', verdict: 'Mixed picture, further assessment needed' },
  red:    { color: '#ef4444', label: 'Red', verdict: 'Significant tension between claims and the evidence' },
  none:   { color: '#6b7280', label: 'No signal', verdict: 'Not enough data in this session to assess' },
};
const STATUS = {
  supported:            { label: 'Supported by evidence', color: '#22c55e' },
  partially_supported:  { label: 'Partially supported', color: '#84cc16' },
  not_addressed:        { label: 'Not addressed in interview', color: '#9aa0a6' },
  in_tension:           { label: 'In tension with reference', color: '#ef4444' },
  insufficient_evidence:{ label: 'Insufficient evidence', color: '#f59e0b' },
};

function statusLabel(s) { return (STATUS[s] || STATUS.insufficient_evidence).label; }

function buildMarkdown(d) {
  const sig = SIGNALS[d.signal] || SIGNALS.none;
  const L = [];
  L.push(`# Interview evidence pack — ${d.title || 'Interview'}`);
  L.push(`_${d.date || ''}${d.candidateName ? `  ·  Candidate: ${d.candidateName}` : ''}_`);
  L.push('');
  L.push(`## Assessment signal: ${sig.label}`);
  L.push(`${sig.verdict}.`);
  if (d.signalRationale) { L.push(''); L.push(d.signalRationale); }
  L.push('');
  if (d.disclaimer) { L.push(`> ${d.disclaimer}`); L.push(''); }
  L.push('## Claims reviewed');
  if (d.claims && d.claims.length) {
    d.claims.forEach(c => {
      L.push(`- **${c.claim}** — ${statusLabel(c.status)}`);
      if (c.transcriptQuote) L.push(`  - Candidate said: "${c.transcriptQuote}"`);
      if (c.referenceQuote) L.push(`  - Reference: "${c.referenceQuote}"`);
      if (c.note) L.push(`  - Note: ${c.note}`);
    });
  } else L.push('- No quotable claims were extracted from this session.');
  L.push('');
  L.push('## Competency coverage');
  if (d.competencies && d.competencies.length) {
    d.competencies.forEach(c => L.push(`- ${c.competency}: ${c.covered ? 'covered' : 'not covered'}${c.evidence ? ` — ${c.evidence}` : ''}`));
  } else L.push('- No role competencies were assessed.');
  L.push('');
  L.push('---');
  L.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by Silent Meeting Copilot. Decision-support only; not a hiring decision. Do not base decisions on protected characteristics.`);
  L.push('');
  return L.join('\n');
}

export default function InterviewAssessmentPanel({ meetingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    if (data) { setOpen(o => !o); return data; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/interview-assessment`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to run assessment');
      setData(d); setOpen(true); return d;
    } catch (err) { setError(err.message); return null; }
    finally { setLoading(false); }
  }

  async function download() {
    const d = data || await load();
    if (!d) return;
    const blob = new Blob([buildMarkdown(d)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `interview-evidence-${d.date || 'session'}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const sig = data ? (SIGNALS[data.signal] || SIGNALS.none) : null;

  return (
    <div style={s.wrapper}>
      <div style={s.bar}>
        <span style={s.label}>Interview assessment</span>
        <div style={s.actions}>
          <button onClick={load} disabled={loading} style={{ ...s.btn, ...s.btnSecondary }}>
            {loading ? 'Assessing…' : open ? 'Hide' : 'Run assessment'}
          </button>
          <button onClick={download} disabled={loading} style={{ ...s.btn, ...s.btnPrimary }}>
            Download evidence pack
          </button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {open && data && (
        <div style={s.body}>
          {data.emptyState ? (
            <div style={s.emptyMsg}>This interview has too little transcript to assess.</div>
          ) : (
            <>
              {/* Traffic light */}
              <div style={s.lightRow}>
                <div style={s.lights}>
                  {['red', 'orange', 'green'].map(k => (
                    <span key={k} style={{
                      ...s.light,
                      background: data.signal === k ? SIGNALS[k].color : 'transparent',
                      borderColor: SIGNALS[k].color,
                      boxShadow: data.signal === k ? `0 0 10px ${SIGNALS[k].color}` : 'none',
                      opacity: data.signal === k ? 1 : 0.35,
                    }} />
                  ))}
                </div>
                <div>
                  <div style={{ ...s.sigLabel, color: sig.color }}>{sig.label}</div>
                  <div style={s.sigVerdict}>{sig.verdict}</div>
                </div>
              </div>

              {data.signalRationale && <div style={s.rationale}>{data.signalRationale}</div>}

              <div style={s.disclaimer}>{data.disclaimer}</div>

              {/* Claims */}
              <div style={s.section}>
                <div style={s.sectionHead}>Claims reviewed</div>
                {data.claims && data.claims.length ? (
                  <div style={s.claimList}>
                    {data.claims.map((c, i) => {
                      const st = STATUS[c.status] || STATUS.insufficient_evidence;
                      return (
                        <div key={i} style={s.claim}>
                          <div style={s.claimTop}>
                            <span style={s.claimText}>{c.claim}</span>
                            <span style={{ ...s.badge, color: st.color, borderColor: st.color }}>{st.label}</span>
                          </div>
                          {c.transcriptQuote && <div style={s.quote}>Candidate: &ldquo;{c.transcriptQuote}&rdquo;</div>}
                          {c.referenceQuote && <div style={s.quoteRef}>Reference: &ldquo;{c.referenceQuote}&rdquo;</div>}
                          {c.note && <div style={s.note}>{c.note}</div>}
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={s.none}>No quotable claims were extracted.</div>}
              </div>

              {/* Competencies */}
              {data.competencies && data.competencies.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionHead}>Competency coverage</div>
                  <ul style={s.compList}>
                    {data.competencies.map((c, i) => (
                      <li key={i}>
                        <span style={{ color: c.covered ? '#22c55e' : '#9aa0a6' }}>{c.covered ? '✓' : '○'}</span>{' '}
                        {c.competency}{c.evidence ? <span style={s.compEv}> — {c.evidence}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--tx)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 500, border: 'none', fontFamily: 'inherit' },
  btnPrimary: { background: 'var(--accent)', color: '#fff' },
  btnSecondary: { background: 'var(--bg-panel, #171a21)', color: 'var(--tx-2)', border: '1px solid var(--border)' },
  error: { color: 'var(--error)', fontSize: 12, padding: '8px 16px' },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  emptyMsg: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  lightRow: { display: 'flex', alignItems: 'center', gap: 16 },
  lights: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: '#0d0f13', borderRadius: 10, border: '1px solid var(--border)' },
  light: { width: 18, height: 18, borderRadius: '50%', border: '2px solid', display: 'block' },
  sigLabel: { fontSize: 18, fontWeight: 700 },
  sigVerdict: { fontSize: 13, color: 'var(--tx-2)', marginTop: 2 },
  rationale: { fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, background: 'var(--bg-panel, #171a21)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' },
  disclaimer: { fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.5, fontStyle: 'italic', borderLeft: '3px solid var(--border)', paddingLeft: 10 },
  section: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  sectionHead: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-2)', marginBottom: 8 },
  claimList: { display: 'flex', flexDirection: 'column', gap: 10 },
  claim: { background: 'var(--bg-panel, #171a21)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 },
  claimTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  claimText: { fontSize: 13, color: 'var(--tx)', fontWeight: 500 },
  badge: { fontSize: 10, fontWeight: 600, border: '1px solid', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  quote: { fontSize: 12, color: 'var(--tx-2)', marginTop: 6, fontStyle: 'italic' },
  quoteRef: { fontSize: 12, color: 'var(--tx-3)', marginTop: 2, fontStyle: 'italic' },
  note: { fontSize: 12, color: 'var(--tx-3)', marginTop: 4 },
  none: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  compList: { margin: 0, paddingLeft: 4, listStyle: 'none', fontSize: 13, color: 'var(--tx)', lineHeight: 1.8 },
  compEv: { color: 'var(--tx-3)', fontSize: 12 },
};
