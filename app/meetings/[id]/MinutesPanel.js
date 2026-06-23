'use client';
import { useState } from 'react';

export default function MinutesPanel({ meetingId }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  async function loadPreview() {
    if (preview) { setOpen(true); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/minutes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate minutes');
      setPreview(data);
      setOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrapper}>
      <div style={s.bar}>
        <span style={s.label}>Meeting Minutes (Word)</span>
        <div style={s.actions}>
          <button
            onClick={loadPreview}
            disabled={loading}
            style={{ ...s.btn, ...s.btnSecondary }}
          >
            {loading ? 'Generating…' : open ? 'Hide preview' : 'Preview minutes'}
          </button>
          <a
            href={`/api/meetings/${meetingId}/minutes-docx`}
            download
            style={{ ...s.btn, ...s.btnPrimary }}
          >
            Download Word (.docx)
          </a>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {open && preview && (
        <div style={s.previewPanel}>
          {preview.emptyState ? (
            <div style={s.emptyMsg}>{preview.executiveSummary}</div>
          ) : (
            <>
              <div style={s.previewTitle}>
                Minutes: {preview.title}
                <span style={s.previewDate}> &middot; {preview.date}</span>
              </div>

              {preview.participants?.length > 0 && (
                <div style={s.row}>
                  <span style={s.rowLabel}>Participants:</span>
                  <span style={s.rowVal}>{preview.participants.join(', ')}</span>
                </div>
              )}

              <div style={s.section}>
                <div style={s.sectionHead}>Executive Summary</div>
                <div style={s.bodyText}>{preview.executiveSummary || '—'}</div>
              </div>

              {preview.keyPoints?.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionHead}>Key Discussion Points</div>
                  <ul style={s.list}>
                    {preview.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              {preview.decisions?.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionHead}>Decisions Made</div>
                  <ul style={s.list}>
                    {preview.decisions.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}

              {preview.actionItems?.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionHead}>Action Items</div>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Owner</th>
                        <th style={s.th}>Action</th>
                        <th style={s.th}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.actionItems.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                          <td style={s.td}>{a.owner}</td>
                          <td style={s.td}>{a.action}</td>
                          <td style={s.td}>{a.due || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(!preview.decisions || preview.decisions.length === 0) &&
               (!preview.actionItems || preview.actionItems.length === 0) && (
                <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 8 }}>
                  No decisions or action items recorded in this transcript.
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
  wrapper: {
    background: 'var(--others-bg)',
    border: '1px solid var(--others-border)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--others-border)',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--others)',
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  btn: {
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
    textDecoration: 'none',
    border: 'none',
    display: 'inline-block',
    lineHeight: 1.6,
    fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'var(--accent)',
    color: '#fff',
  },
  btnSecondary: {
    background: 'var(--bg-raised)',
    color: 'var(--tx-2)',
    border: '1px solid var(--border)',
  },
  error: {
    color: 'var(--error)',
    fontSize: 12,
    padding: '8px 16px',
  },
  previewPanel: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  emptyMsg: {
    fontSize: 13,
    color: 'var(--tx-3)',
    fontStyle: 'italic',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--tx)',
    letterSpacing: '-0.01em',
  },
  previewDate: {
    fontWeight: 400,
    fontSize: 13,
    color: 'var(--tx-3)',
  },
  row: {
    fontSize: 13,
    color: 'var(--tx-2)',
  },
  rowLabel: {
    fontWeight: 600,
    color: 'var(--tx)',
    marginRight: 6,
  },
  rowVal: {},
  section: {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
  },
  sectionHead: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--others)',
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 13,
    color: 'var(--tx)',
    lineHeight: 1.6,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: 'var(--tx)',
    lineHeight: 1.7,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    color: 'var(--tx-2)',
    fontWeight: 600,
    fontSize: 11,
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
  },
  td: {
    color: 'var(--tx)',
    padding: '5px 8px',
    verticalAlign: 'top',
  },
};
