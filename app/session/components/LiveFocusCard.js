'use client';

function renderHighlighted(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1
    ? <mark key={i} style={{ background: 'var(--me-bg)', color: 'var(--me)', fontWeight: 700, padding: '0 5px', borderRadius: 'var(--r-xs)' }}>{p}</mark>
    : <span key={i}>{p}</span>));
}

function AlignmentMeter({ driftStreak, drifting, alignment, message }) {
  const isAlert = drifting && driftStreak >= 2;
  const alignmentPct = drifting ? (isAlert ? 18 : 48) : 92;
  const meterColor = isAlert ? 'var(--error)' : drifting ? 'var(--warn)' : 'var(--success)';
  const statusLabel = isAlert ? 'Drifting — stay on track' : drifting ? 'Drifting' : 'On objective';

  return (
    <div className={`lfc-meter${drifting ? (isAlert ? ' lfc-meter--alert' : ' lfc-meter--warn') : ' lfc-meter--ok'}`}>
      <div className="lfc-meter-header">
        <span className="lfc-meter-label">Objective alignment</span>
        <span className="lfc-meter-status" style={{ color: meterColor }}>{statusLabel}</span>
      </div>
      <div className="lfc-meter-track" role="progressbar" aria-valuenow={alignmentPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lfc-meter-fill" style={{ width: `${alignmentPct}%`, background: meterColor }} />
      </div>
      {alignment && <div className="lfc-alignment-text">{alignment}</div>}
      {drifting && message && (
        <div className={`lfc-drift-msg${isAlert ? ' lfc-drift-msg--alert' : ''}`}>{message}</div>
      )}
    </div>
  );
}

export default function LiveFocusCard({ coaching, driftStreak, coachLabels, coachReconnecting, isLive, status }) {
  const hasCoaching = !!coaching;
  const isVisible = isLive || status === 'stopped';
  if (!isVisible) return null;

  if (!hasCoaching) {
    return (
      <div className="smc-live-focus-card smc-live-focus-card--ready">
        <div className="lfc-eyebrow">Live Focus</div>
        <div className="lfc-ready-state">
          {coachReconnecting
            ? <span className="lfc-reconnecting">Coaching reconnecting…</span>
            : isLive
            ? <span className="lfc-waiting">Listening — coaching will appear after a few segments</span>
            : <span className="lfc-waiting">No coaching data for this session</span>
          }
        </div>
      </div>
    );
  }

  const isDrifting = !!coaching.selfCorrection?.drifting;
  const primarySuggestion = coaching.suggestions?.[0] ?? null;

  return (
    <div className={`smc-live-focus-card${isDrifting && driftStreak >= 2 ? ' smc-live-focus-card--alert' : isDrifting ? ' smc-live-focus-card--warn' : ''}`}>
      <div className="lfc-header">
        <span className="lfc-eyebrow">Live Focus</span>
        {coaching.updatedAt && <span className="lfc-ts">{coaching.updatedAt}</span>}
      </div>

      <div className="lfc-say-next">
        <div className="lfc-say-label">{coachLabels.sugg}</div>
        {primarySuggestion ? (
          <div className="lfc-suggestion">{renderHighlighted(primarySuggestion)}</div>
        ) : (
          <div className="lfc-no-suggestion">Suggestion developing…</div>
        )}
      </div>

      <AlignmentMeter
        driftStreak={driftStreak}
        drifting={isDrifting}
        alignment={coaching.alignment ?? null}
        message={coaching.selfCorrection?.message ?? null}
      />
    </div>
  );
}
