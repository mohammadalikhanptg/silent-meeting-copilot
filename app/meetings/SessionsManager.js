'use client';
import { useState, useCallback } from 'react';
import NewSessionButton from './NewSessionButton';

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(started, ended) {
  if (!ended) return null;
  const ms = new Date(ended) - new Date(started);
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function deriveStatus(m) {
  if (m.ended_at) return 'completed';
  if (m.segment_count > 0) return 'in-progress';
  return 'prepared';
}

const STATUS_LABEL = { completed: 'Completed', 'in-progress': 'In progress', prepared: 'Prepared' };
const STATUS_COLOR = { completed: '#22c55e', 'in-progress': '#facc15', prepared: '#38bdf8' };
const STATUS_BG   = { completed: '#052e16', 'in-progress': '#1c1a07', prepared: '#0c1f33' };

export default function SessionsManager({ initialMeetings, userEmail, userRole }) {
  const [meetings, setMeetings]       = useState(initialMeetings);
  const [selected, setSelected]       = useState(new Set());
  const [confirming, setConfirming]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const allIds = meetings.map(m => m.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleRow = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }, [allSelected, allIds]);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/meetings/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      const deletedIds = new Set(
        (data.results || []).filter(r => r.ok).map(r => r.id),
      );
      setMeetings(prev => prev.filter(m => !deletedIds.has(m.id)));
      setSelected(new Set());
      setConfirming(false);
    } catch (err) {
      setDeleteError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (meetings.length === 0) {
    return (
      <div className="sessions-empty">
        <div className="sessions-empty-icon">🎙</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)' }}>No sessions yet</div>
        <div style={{ fontSize: 14, color: 'var(--tx-3)', maxWidth: 360, lineHeight: 1.6 }}>
          Create your first session to start real-time coaching, transcription, and follow-up tracking.
        </div>
        <NewSessionButton style={{ marginTop: 8 }} />
      </div>
    );
  }

  return (
    <>
      {/* Selection action bar */}
      {someSelected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', marginBottom: 10,
          background: 'var(--accent-dim)',
          border: '1px solid rgba(138,147,255,0.28)',
          borderRadius: 'var(--r-md)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--accent-hi)', fontWeight: 600 }}>
            {selected.size} selected
          </span>
          <button
            onClick={() => { setConfirming(true); setDeleteError(null); }}
            style={{
              marginLeft: 'auto',
              background: 'rgba(244,63,94,0.14)',
              border: '1px solid rgba(244,63,94,0.30)',
              borderRadius: 'var(--r-sm)',
              color: '#f87171',
              fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600,
              padding: '6px 14px', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.24)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.14)'; }}
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              background: 'none', border: 'none',
              color: 'var(--tx-3)', fontSize: 13,
              fontFamily: 'inherit', cursor: 'pointer', padding: '6px 8px',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirming && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div className="glass-raised" style={{
            maxWidth: 440, width: '100%', padding: '28px 28px 24px',
            position: 'relative',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginBottom: 10 }}>
              Delete {selected.size} session{selected.size !== 1 ? 's' : ''}?
            </div>
            <div style={{
              fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.65,
              marginBottom: 6,
              background: 'rgba(244,63,94,0.10)',
              border: '1px solid rgba(244,63,94,0.24)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
            }}>
              <strong style={{ color: '#f87171' }}>This action is permanent and cannot be undone.</strong>
              {' '}All transcripts, coaching outputs, and session audio for the selected session{selected.size !== 1 ? 's' : ''} will be erased from storage.
            </div>
            {deleteError && (
              <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 8, marginTop: 6 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConfirming(false); setDeleteError(null); }}
                disabled={deleting}
                style={{
                  background: 'var(--surf-1)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', color: 'var(--tx-2)',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                  padding: '8px 18px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  background: deleting ? 'rgba(244,63,94,0.30)' : 'rgba(244,63,94,0.85)',
                  border: 'none', borderRadius: 'var(--r-sm)',
                  color: '#fff', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 700,
                  padding: '8px 20px', cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : `Delete ${selected.size} session${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select-all row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        marginBottom: 4,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </span>
        </label>
      </div>

      {/* Session list */}
      <div className="sessions-list">
        {meetings.map(m => {
          const status = deriveStatus(m);
          const href   = status === 'completed' ? `/meetings/${m.id}` : `/session?m=${m.id}`;
          const duration = formatDuration(m.started_at, m.ended_at);
          const isSelected = selected.has(m.id);

          return (
            <div
              key={m.id}
              className="session-card"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                outline: isSelected ? '2px solid var(--accent)' : undefined,
                outlineOffset: isSelected ? '-2px' : undefined,
              }}
            >
              {/* Checkbox */}
              <label
                style={{ display: 'flex', alignItems: 'center', paddingTop: 2, cursor: 'pointer', flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRow(m.id)}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </label>

              {/* Card body — navigate on click */}
              <a href={href} style={{ flex: 1, textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>
                    {m.title || 'Untitled session'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 9px', borderRadius: 'var(--r-full)',
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      color: STATUS_COLOR[status],
                      background: STATUS_BG[status],
                      border: `1px solid ${STATUS_COLOR[status]}33`,
                    }}>
                      {STATUS_LABEL[status]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>{formatDate(m.started_at)}</span>
                  </div>
                </div>
                {m.objective && (
                  <div style={{ fontSize: 13, color: 'var(--tx-2)', fontStyle: 'italic', marginBottom: 8 }}>{m.objective}</div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 9px', borderRadius: 'var(--r-full)',
                    background: 'var(--others-bg)', color: 'var(--others)',
                    fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    {m.language_mode || 'english'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{m.segment_count} segments</span>
                  {duration && <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{duration}</span>}
                  <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 'auto' }}>
                    {status === 'completed' ? 'View review →' : 'Open →'}
                  </span>
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}
