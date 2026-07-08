'use client';
import { useState } from 'react';

export default function ComplianceModal({ modeType, onCancel, onAccept }) {
  const [retainAudio, setRetainAudio] = useState(false);
  const isInterview = modeType === 'interview';
  const isCx = modeType === 'customer_service';

  const audioConsentLabel = isInterview
    ? "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The candidate's voice is captured; ensure you have consent."
    : isCx
    ? "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The customer's voice is captured; ensure you have consent."
    : "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. Other participants' voices are captured; ensure you have consent.";

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '28px 32px', maxWidth: 480, width: '90vw', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--tx)' }}>Before you start</div>
        <div style={{ fontSize: 14, color: 'var(--tx-2)', lineHeight: 1.6, marginBottom: 20 }}>
          This meeting may be transcribed and analysed by AI to provide live assistance, quality and assessment.
          Make sure you have any consent required, and that recording or analysing this conversation complies with the laws that apply to you and the other participants. You are responsible for lawful use.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={retainAudio}
            onChange={(e) => setRetainAudio(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--teal)' }}
          />
          <span>{audioConsentLabel}</span>
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--tx)', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={() => onAccept(retainAudio)} style={{ padding: '8px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>I understand — start</button>
        </div>
      </div>
    </div>
  );
}
