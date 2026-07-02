'use client';

import { useState, useEffect } from 'react';

export default function RecordingPanel({ meetingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}/audio`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [meetingId]);

  if (loading) return null;
  if (!data || (!data.me?.length && !data.others?.length)) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Session Recording</div>
      <div style={styles.notice}>
        Audio was retained for this session. Downloads are time-limited links (1 hour). Refresh the page for new links.
      </div>
      <div style={styles.grid}>
        <TrackSection label="Your microphone (ME)" files={data.me} color="#22c55e" />
        <TrackSection label="Other participants (OTHERS)" files={data.others} color="#38bdf8" />
      </div>
    </div>
  );
}

function TrackSection({ label, files, color }) {
  if (!files?.length) {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>No audio retained for this track.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label} &middot; {files.length} file{files.length !== 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {files.map((f, i) => {
          const name = f.key.split('/').pop();
          const kb = f.size ? Math.ceil(f.size / 1024) : '?';
          return (
            <a
              key={i}
              href={f.url}
              download={name}
              style={styles.link}
            >
              <span style={{ fontSize: 14 }}>⬇</span>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{name}</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{kb} KB</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 20px',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx-2)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 10,
  },
  notice: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 14,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--tx)',
    textDecoration: 'none',
    fontSize: 13,
  },
};
