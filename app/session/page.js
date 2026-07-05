'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

import AppShell from '../components/AppShell';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
const CHUNK_MS = 2500;
const MAX_RECONNECTS = 5;
const COACH_INTERVAL_MS = 25000;
const COACH_MIN_SEGMENTS = 3;
const FLAG_POLL_INTERVAL_MS = 30000;
const TOKEN_REFRESH_MS = 12 * 60 * 1000;
const HEARTBEAT_MS = 25000;
const ASSIST_DEDUP_KEY = (card) => `${card.type}:${card.label}:${card.value}`;

const ALLOWED_EXTENSIONS = ['.md', '.txt'];
const MAX_FILE_BYTES = 256 * 1024; // 256 KB

const MODE_LANG = { english: 'en', 'hindi-urdu': 'hi', auto: null };
// Paragraph grouping: merge consecutive same-stream segments into one timestamped
// paragraph; break on a clear pause or a long-run guardrail. Tunable.
const PARA_PAUSE_MS = 4000;
const PARA_MAX_MS = 60000;
const MODE_LABEL = { english: 'English (fast)', 'hindi-urdu': 'Hindi / Urdu', auto: 'Auto-detect' };

// Cockpit panels that can be re-ordered vertically in opt-in "Arrange" mode.
// Order is the default top-to-bottom layout; persisted per-device in localStorage.
const COCKPIT_PANELS = ['transcripts', 'coaching', 'assist', 'followup'];

// Render a suggestion string, turning **phrase** markers into a green highlight so the
// single most important phrase can be grabbed at a glance while talking.
function renderHighlighted(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1
    ? <mark key={i} style={{ background: 'rgba(34,197,94,0.22)', color: '#bbf7d0', fontWeight: 700, padding: '0 5px', borderRadius: 4 }}>{p}</mark>
    : <span key={i}>{p}</span>));
}
const PANEL_LABELS = {
  transcripts: 'Transcripts',
  coaching: 'Coaching',
  assist: 'Live Assist',
  followup: 'Follow-up Tracker',
};
const LAYOUT_STORAGE_KEY = 'smc.cockpitPanelOrder.v1';

// Reconcile a stored order against the current panel set: keep known keys in
// their saved order, append any panels added since the order was saved, drop
// anything no longer recognised. Falls back to the default on bad input.
function normalizeOrder(saved) {
  if (!Array.isArray(saved)) return [...COCKPIT_PANELS];
  const known = saved.filter(k => COCKPIT_PANELS.includes(k));
  const missing = COCKPIT_PANELS.filter(k => !known.includes(k));
  const next = [...known, ...missing];
  return next.length === COCKPIT_PANELS.length ? next : [...COCKPIT_PANELS];
}

function generateShortCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz';
  const letters = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${letters}-${digits}`;
}

function encodeChunk(speaker, audioBuffer) {
  const out = new Uint8Array(1 + audioBuffer.byteLength);
  out[0] = speaker === 'others' ? 1 : 0;
  out.set(new Uint8Array(audioBuffer), 1);
  return out.buffer;
}

// Compliance + per-session audio retention consent modal.
// `onAccept(retainAudio: bool)` — caller receives the audio-retention opt-in choice.
function ComplianceModal({ modeType, onCancel, onAccept }) {
  const [retainAudio, setRetainAudio] = useState(false);
  const isInterview = modeType === 'interview';
  const isCx = modeType === 'customer_service';

  const audioConsentLabel = isInterview
    ? 'Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The candidate\'s voice is captured; ensure you have consent.'
    : isCx
    ? 'Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The customer\'s voice is captured; ensure you have consent.'
    : 'Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. Other participants\' voices are captured; ensure you have consent.';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 32px', maxWidth: 480, width: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Before you start</div>
        <div style={{ fontSize: 14, color: 'var(--tx-2)', lineHeight: 1.6, marginBottom: 20 }}>
          This meeting may be transcribed and analysed by AI to provide live assistance, quality and assessment.
          Make sure you have any consent required, and that recording or analysing this conversation complies with the laws that apply to you and the other participants. You are responsible for lawful use.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={retainAudio}
            onChange={(e) => setRetainAudio(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: '#2AB49F' }}
          />
          <span>{audioConsentLabel}</span>
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--tx)', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={() => onAccept(retainAudio)} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#2AB49F', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>I understand — start</button>
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  const [sessionCode, setSessionCode] = useState('');
  const [meetingId, setMeetingId] = useState(null); // set from ?m= param or on create
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('english');
  const [engine, setEngine] = useState('nova3'); // 'nova3' (default) | 'sarvam' (Hindi streaming beta)
  const [modeType, setModeType] = useState('meeting');
  const [objective, setObjective] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [refDocs, setRefDocs] = useState([]); // [{id, filename, size_bytes, content_text}]
  const [status, setStatus] = useState('idle');
  const [meLines, setMeLines] = useState([]);
  const [othersLines, setOthersLines] = useState([]);
  const [meName, setMeName] = useState('Me');
  const [coaching, setCoaching] = useState(null);
  const [driftStreak, setDriftStreak] = useState(0);
  const [assistCards, setAssistCards] = useState([]);
  const [copiedAssist, setCopiedAssist] = useState(null);
  const [flaggedItems, setFlaggedItems] = useState([]);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const languageTouched = useRef(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [helperConnected, setHelperConnected] = useState(null);
  const [paused, setPaused] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [retainAudioOpt, setRetainAudioOpt] = useState(false); // per-session audio retention opt-in (default OFF)
  const retainAudioRef = useRef(false);
  const [prepCollapsed, setPrepCollapsed] = useState(false);

  // Meeting bot state (A1/A3/A4)
  const [botMeetingNumber, setBotMeetingNumber] = useState('');
  const [botPasscode, setBotPasscode] = useState('');
  const [botName, setBotName] = useState('');
  const [botRequestId, setBotRequestId] = useState(null);
  const [botStatus, setBotStatus] = useState(null);
  const [botNotice, setBotNotice] = useState('');
  const botPollTimer = useRef(null);

  // Cockpit layout: vertical panel order + opt-in drag-to-reorder ("Arrange") mode.
  const [panelOrder, setPanelOrder] = useState(COCKPIT_PANELS);
  const [editLayout, setEditLayout] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const dragKeyRef = useRef(null);

  const wsRef = useRef(null);
  const monitorWsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const intentionalStop = useRef(false);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef(null);
  const liveStatus = useRef('idle');
  const meetingIdRef = useRef(null);
  const meLinesRef = useRef([]);
  const othersLinesRef = useRef([]);
  const objectiveRef = useRef('');
  const modeTypeRef = useRef('meeting');
  const contextNotesRef = useRef('');
  const refDocsRef = useRef([]);
  const profileRef = useRef(null);
  const seenAssistKeys = useRef(new Set());
  const coachSummaryRef = useRef('');
  const coachSummaryCursorRef = useRef({ me: 0, others: 0 });
  const flaggedItemsRef = useRef([]);
  const segmentTimer = useRef(null);
  const suppressMicRef = useRef(false); // true when a desktop helper is the authoritative ME source
  const tokenRef = useRef(null);
  const heartbeatTimer = useRef(null);
  const tokenRefreshTimer = useRef(null);
  const coachWatchdogTimer = useRef(null);
  const lastCoachOutputTs = useRef(0);
  const complianceAckRef = useRef(false);
  const [coachReconnecting, setCoachReconnecting] = useState(false);
  // Sarvam streaming engine: AudioWorklet 16kHz PCM capture graph (ME channel)
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const pcmSinkRef = useRef(null);

  useEffect(() => { meLinesRef.current = meLines; }, [meLines]);
  useEffect(() => { othersLinesRef.current = othersLines; }, [othersLines]);
  useEffect(() => { objectiveRef.current = objective; }, [objective]);
  useEffect(() => { modeTypeRef.current = modeType; }, [modeType]);
  useEffect(() => { contextNotesRef.current = contextNotes; }, [contextNotes]);
  useEffect(() => { refDocsRef.current = refDocs; }, [refDocs]);
  useEffect(() => { flaggedItemsRef.current = flaggedItems; }, [flaggedItems]);
  useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);
  useEffect(() => { retainAudioRef.current = retainAudioOpt; }, [retainAudioOpt]);

  const meScrollRef = useRef(null);
  const otScrollRef = useRef(null);
  useEffect(() => { meScrollRef.current?.scrollTo(0, meScrollRef.current.scrollHeight); }, [meLines]);
  useEffect(() => { otScrollRef.current?.scrollTo(0, otScrollRef.current.scrollHeight); }, [othersLines]);

  // On mount: set session code from URL or generate; also read ?m= for preloaded meeting
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('s');
    const urlMeetingId = params.get('m');
    const code = urlCode || generateShortCode();
    setSessionCode(code);
    if (!urlCode) {
      const u = new URL(window.location.href);
      u.searchParams.set('s', code);
      history.replaceState({}, '', u);
    }
    if (urlMeetingId) {
      setMeetingId(urlMeetingId);
      // Load existing meeting data
      loadMeeting(urlMeetingId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMeeting(id) {
    try {
      // Load meeting metadata
      const res = await fetch(`/api/meetings/${id}/prep`);
      if (res.ok) {
        const data = await res.json();
        if (data.meeting) {
          if (data.meeting.title) setTitle(data.meeting.title);
          if (data.meeting.objective) setObjective(data.meeting.objective);
          if (data.meeting.context_notes) setContextNotes(data.meeting.context_notes);
          if (data.meeting.language_mode) { setMode(data.meeting.language_mode); languageTouched.current = true; }
          if (data.meeting.mode_type) setModeType(data.meeting.mode_type);
        }
      }
      // Load reference docs
      const docsRes = await fetch(`/api/meetings/${id}/ref-docs`);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        if (docsData.docs) {
          // Docs from DB don't have content_text in the list response (just metadata)
          setRefDocs(docsData.docs.map(d => ({ ...d, content_text: '' })));
        }
      }
    } catch (_) {}
  }

  // On mount: fetch operator profile
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          profileRef.current = d.profile;
          const _dn = (d.profile.display_name || '').trim().split(/\s+/)[0];
          if (_dn) setMeName(_dn);
          if (!languageTouched.current && d.profile.default_language_mode) {
            setMode(d.profile.default_language_mode);
          }
          // Pre-fill bot name from profile default or computed first-name default
          const defaultBot = d.profile.default_bot_name ||
            (_dn ? `${_dn}'s meeting notes` : 'Meeting notes');
          setBotName(defaultBot);
        }
      })
      .catch(() => {});
  }, []);

  // On mount: restore saved cockpit panel order (per-device)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || 'null');
      setPanelOrder(normalizeOrder(saved));
    } catch (_) {}
  }, []);

  // Keep URL in sync
  useEffect(() => {
    if (!sessionCode) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('s') !== sessionCode) {
      u.searchParams.set('s', sessionCode);
      history.replaceState({}, '', u);
    }
  }, [sessionCode]);

  // Coaching polling — every 25s while live
  useEffect(() => {
    if (status !== 'live') return;

    const pollCoach = async () => {
      const me = meLinesRef.current.map(l => l.cleaned);
      const others = othersLinesRef.current.map(l => l.cleaned);
      if (me.length + others.length < COACH_MIN_SEGMENTS) return;
      const coachCtrl = new AbortController();
      const coachTo = setTimeout(() => coachCtrl.abort(), 45000);
      try {
        const res = await fetch(`${ENGINE_URL}/coach`, {
          method: 'POST',
          signal: coachCtrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current || ''}` },
          body: JSON.stringify({
            me,
            others,
            objective: objectiveRef.current,
            modeType: modeTypeRef.current,
            profile: profileRef.current,
            context: contextNotesRef.current,
            priorSummary: coachSummaryRef.current,
            summarizedThrough: coachSummaryCursorRef.current,
            refDocs: refDocsRef.current.filter(d => d.content_text).map(d => ({
              filename: d.filename,
              content_text: d.content_text,
            })),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          if (data.corrections && data.corrections.length > 0) {
            setOthersLines(prev => {
              const updated = [...prev];
              for (const c of data.corrections) {
                if (c.othersIndex >= 0 && c.othersIndex < updated.length) {
                  const existing = updated[c.othersIndex];
                  if (!existing.clarifiedByMe) {
                    updated[c.othersIndex] = { ...existing, corrected: c.corrected, clarifiedByMe: true };
                    const segId = existing.segmentId;
                    if (segId && meetingIdRef.current) {
                      fetch(`/api/meetings/${meetingIdRef.current}/segments/${segId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ corrected_text: c.corrected, clarified_by_me: true }),
                      }).catch(() => {});
                    }
                  }
                }
              }
              return updated;
            });
          }
          if (data.assists && data.assists.length > 0) {
            const fresh = data.assists.filter(card => {
              const key = ASSIST_DEDUP_KEY(card);
              if (seenAssistKeys.current.has(key)) return false;
              seenAssistKeys.current.add(key);
              return true;
            });
            if (fresh.length > 0) setAssistCards(prev => [...prev, ...fresh]);
          }
          setCoaching({ ...data, updatedAt: new Date().toLocaleTimeString() });
          setDriftStreak(prev => (data?.selfCorrection?.drifting ? prev + 1 : 0));
          lastCoachOutputTs.current = Date.now();
          setCoachReconnecting(false);
          if (typeof data.rollingSummary === 'string') coachSummaryRef.current = data.rollingSummary;
          if (data.summarizedThrough && typeof data.summarizedThrough === 'object') coachSummaryCursorRef.current = data.summarizedThrough;
        }
      } catch (_) {} finally { clearTimeout(coachTo); }
    };

    pollCoach();
    const timer = setInterval(pollCoach, COACH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flagged items polling — every 30s while live or stopped
  useEffect(() => {
    if (status !== 'live' && status !== 'stopped') return;
    if (!meetingIdRef.current) return;

    const poll = async () => {
      const current = flaggedItemsRef.current;
      const hasPending = current.some(f => f.status === 'pending' || f.status === 'processing');
      if (!hasPending && current.length > 0) return;

      try {
        const res = await fetch(`/api/flagged-items?meetingId=${meetingIdRef.current}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setFlaggedItems(prev => {
            const byId = {};
            for (const item of data.items) byId[item.id] = item;
            return prev.map(f => {
              const fresh = byId[f.id];
              if (!fresh) return f;
              return {
                ...f,
                status: fresh.status,
                assist_text: fresh.assist_text,
                references: fresh.reference_json || [],
                addressed: !!fresh.addressed_at,
              };
            });
          });
        }
      } catch (_) {}
    };

    poll();
    const timer = setInterval(poll, FLAG_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = useCallback((s) => {
    liveStatus.current = s;
    setStatus(s);
  }, []);

  // Save preparation without going live
  const savePrep = useCallback(async () => {
    setSaveStatus('saving');
    try {
      let mId = meetingIdRef.current;
      if (!mId) {
        // Create meeting row
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || null,
            objective: objective || null,
            language_mode: mode,
            context_notes: contextNotes || null,
            mode_type: modeType,
          }),
        });
        if (!res.ok) throw new Error('Create failed');
        const data = await res.json();
        mId = data.id;
        setMeetingId(mId);
        // Update URL
        const u = new URL(window.location.href);
        u.searchParams.set('m', mId);
        history.replaceState({}, '', u);
      } else {
        // Update existing meeting
        await fetch(`/api/meetings/${mId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || null,
            objective: objective || null,
            context_notes: contextNotes || null,
            mode_type: modeType,
          }),
        });
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (_) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  }, [title, objective, mode, contextNotes]);

  // Upload a reference document (called after file is read as text)
  const uploadRefDoc = useCallback(async (filename, content) => {
    setUploadError('');

    // Client-side validation
    const lower = filename.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext))) {
      setUploadError(`"${filename}" is not allowed. Only .md and .txt files are accepted.`);
      return;
    }
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_FILE_BYTES) {
      setUploadError(`"${filename}" is too large (${Math.ceil(bytes / 1024)} KB). Maximum is 256 KB.`);
      return;
    }

    // Ensure we have a meeting ID
    let mId = meetingIdRef.current;
    if (!mId) {
      try {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || null,
            objective: objective || null,
            language_mode: mode,
            context_notes: contextNotes || null,
            mode_type: modeType,
          }),
        });
        if (!res.ok) throw new Error('Create failed');
        const data = await res.json();
        mId = data.id;
        setMeetingId(mId);
        const u = new URL(window.location.href);
        u.searchParams.set('m', mId);
        history.replaceState({}, '', u);
      } catch (_) {
        setUploadError('Could not create session. Please try again.');
        return;
      }
    }

    try {
      const res = await fetch(`/api/meetings/${mId}/ref-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      // Add to local state with content for coaching context
      setRefDocs(prev => [...prev, { ...data.doc, content_text: content }]);
    } catch (_) {
      setUploadError('Upload failed. Please try again.');
    }
  }, [title, objective, mode, contextNotes]);

  const removeRefDoc = useCallback(async (docId) => {
    const mId = meetingIdRef.current;
    if (!mId) return;
    try {
      await fetch(`/api/meetings/${mId}/ref-docs/${docId}`, { method: 'DELETE' });
      setRefDocs(prev => prev.filter(d => d.id !== docId));
    } catch (_) {}
  }, []);

  // Handle file drop or input
  const handleFiles = useCallback((files) => {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadRefDoc(file.name, e.target.result);
      };
      reader.readAsText(file, 'utf-8');
    }
  }, [uploadRefDoc]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleFileInput = useCallback((e) => {
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [handleFiles]);

  // ── Bot request helpers (A3/A4) ──────────────────────────────────────────
  const BOT_TERMINAL = ['failed', 'passcode_required', 'left'];

  const startBotPoll = useCallback((id, sc) => {
    if (botPollTimer.current) clearInterval(botPollTimer.current);
    botPollTimer.current = setInterval(async () => {
      try {
        const qs = sc ? `?session_code=${encodeURIComponent(sc)}` : '';
        const res = await fetch(`/api/session/bot-request${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.botRequest) return;
        const st = data.botRequest.status;
        setBotStatus(st);
        if (BOT_TERMINAL.includes(st)) {
          clearInterval(botPollTimer.current);
          const msgs = {
            failed: 'Bot failed to join the meeting. Coaching continues via the desktop helper.',
            passcode_required: 'Bot cannot join — meeting requires a passcode that was not provided. Coaching continues via the desktop helper.',
            left: 'Bot has left the meeting. Coaching continues via the desktop helper.',
          };
          setBotNotice(msgs[st] || 'Bot session ended. Coaching continues via the desktop helper.');
        }
      } catch (_) {}
    }, 5000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitBotRequest = useCallback(async () => {
    if (!/^\d{9,12}$/.test(botMeetingNumber)) return;
    try {
      const res = await fetch('/api/session/bot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingNumber: botMeetingNumber,
          passcode: botPasscode || undefined,
          botName: botName || 'Meeting notes',
          sessionCode: sessionCode || undefined,
          meetingId: meetingIdRef.current || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setBotRequestId(data.id);
      setBotStatus(data.status);
      setBotNotice('');
      startBotPoll(data.id, sessionCode);
    } catch (_) {}
  }, [botMeetingNumber, botPasscode, botName, sessionCode, startBotPoll]);

  const removeBotRequest = useCallback(async () => {
    if (!botRequestId) return;
    try {
      await fetch('/api/session/bot-request/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: botRequestId }),
      });
    } catch (_) {}
    if (botPollTimer.current) clearInterval(botPollTimer.current);
    setBotRequestId(null);
    setBotStatus(null);
    setBotNotice('');
  }, [botRequestId]);

  // captureSource: helper wins if connected; bot informational when in_meeting; designed for future bot-audio increment
  const captureSource = helperConnected ? 'helper' : botStatus === 'in_meeting' ? 'bot' : 'none';

  // Flag a transcript line for follow-up
  const flagItem = useCallback(async (text, speaker, ts, segmentId) => {
    if (!meetingIdRef.current) return;

    const optimisticItem = {
      id: null,
      text,
      speaker,
      ts,
      status: 'pending',
      assist_text: null,
      references: [],
      addressed: false,
    };
    setFlaggedItems(prev => [...prev, optimisticItem]);
    if (speaker === 'me') setMeLines(prev => prev.map(l => l.ts === ts && l.cleaned === text ? { ...l, flagged: true } : l));
    else setOthersLines(prev => prev.map(l => l.ts === ts && (l.cleaned === text || l.corrected === text) ? { ...l, flagged: true } : l));

    try {
      const res = await fetch('/api/flagged-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meetingIdRef.current,
          source_segment: segmentId || null,
          speaker,
          text,
          ts,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.id) return;

      const itemId = data.id;
      setFlaggedItems(prev =>
        prev.map(f => f === optimisticItem ? { ...f, id: itemId, status: 'processing' } : f)
      );

      if (speaker === 'me') {
        setMeLines(prev => prev.map(l => l.ts === ts && l.cleaned === text ? { ...l, flagged: true } : l));
      } else {
        setOthersLines(prev => prev.map(l => l.ts === ts && (l.cleaned === text || l.corrected === text) ? { ...l, flagged: true } : l));
      }

      fetch(`/api/flagged-items/${itemId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: profileRef.current,
          context: contextNotesRef.current,
        }),
      }).catch(() => {});
    } catch (_) {}
  }, []);

  const markAddressed = useCallback(async (itemId, addressed) => {
    setFlaggedItems(prev =>
      prev.map(f => f.id === itemId ? { ...f, addressed } : f)
    );
    fetch(`/api/flagged-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressed }),
    }).catch(() => {});
  }, []);

  const removeFlag = useCallback(async (item) => {
    if (item?.id) fetch(`/api/flagged-items/${item.id}`, { method: 'DELETE' }).catch(() => {});
    setFlaggedItems(prev => prev.filter(f => f !== item && (!item.id || f.id !== item.id)));
    const t = item.text;
    if (item.speaker === 'me') setMeLines(prev => prev.map(l => l.ts === item.ts && l.cleaned === t ? { ...l, flagged: false } : l));
    else setOthersLines(prev => prev.map(l => l.ts === item.ts && (l.cleaned === t || l.corrected === t) ? { ...l, flagged: false } : l));
  }, []);

  const unflagLine = useCallback((line, speaker) => {
    const t = speaker === 'me' ? line.cleaned : (line.corrected || line.cleaned);
    const item = flaggedItemsRef.current.find(f => f.ts === line.ts && (f.text === t || f.text === line.cleaned));
    if (item) { removeFlag(item); return; }
    if (speaker === 'me') setMeLines(prev => prev.map(l => l === line ? { ...l, flagged: false } : l));
    else setOthersLines(prev => prev.map(l => l === line ? { ...l, flagged: false } : l));
  }, [removeFlag]);

  // Far-end is a single voice in the batch path: strip any stray "[Speaker N]"
  // labels (e.g. from previously stored segments) so no speaker numbers show.
  const stripSpk = (txt) => (typeof txt === 'string' ? txt.replace(/\[Speaker \d+\]\s*/g, '') : txt);

  const getEngineToken = useCallback(async () => {
    const res = await fetch('/api/session/start', { method: 'POST' });
    if (!res.ok) throw new Error('Could not get an engine session token — please sign in again.');
    const data = await res.json();
    if (!data.token) throw new Error('No session token returned.');
    tokenRef.current = data.token;
    return data.token;
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() })); } catch (_) {}
      }
    }, HEARTBEAT_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null; }
  }, []);

  const startSession = useCallback(async (opts = {}) => {
    const resume = opts?.resume === true;
    if (!sessionCode) return;

    intentionalStop.current = false;
    if (monitorWsRef.current) { try { monitorWsRef.current.close(); } catch (_) {} monitorWsRef.current = null; }
    reconnectCount.current = 0;
    setPaused(false);
    updateStatus('connecting');
    setError('');
    if (!resume) {
      setMeLines([]);
      setOthersLines([]);
      setCoaching(null);
      setDriftStreak(0);
      coachSummaryRef.current = '';
      coachSummaryCursorRef.current = { me: 0, others: 0 };
      setAssistCards([]);
      setFlaggedItems([]);
      seenAssistKeys.current = new Set();
    }

    // Use existing meeting ID or create one
    try {
      let mId = meetingIdRef.current;
      if (!mId) {
        const meetingRes = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || `Session ${sessionCode}`,
            objective: objective || null,
            language_mode: mode,
            context_notes: contextNotes || null,
            session_code: sessionCode || null,
            mode_type: modeType,
          }),
        });
        if (meetingRes.ok) {
          const meetingData = await meetingRes.json();
          mId = meetingData.id;
          setMeetingId(mId);
          const u = new URL(window.location.href);
          u.searchParams.set('m', mId);
          history.replaceState({}, '', u);
        }
      } else {
        // Update existing prepared meeting with current form values + session code
        await fetch(`/api/meetings/${mId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || `Session ${sessionCode}`,
            objective: objective || null,
            context_notes: contextNotes || null,
            session_code: sessionCode || null,
            mode_type: modeType,
          }),
        }).catch(() => {});
      }
    } catch (_) {
      meetingIdRef.current = null;
    }

    function openWs(code, sessionMode) {
      return new Promise((resolve, reject) => {
        if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
          try { wsRef.current.close(); } catch (_) {}
        }

        const qs = new URLSearchParams({ mode: sessionMode, role: 'browser', engine });
        const langHint = MODE_LANG[sessionMode];
        if (langHint) qs.set('lang', langHint);
        const wsUrl = ENGINE_URL.replace(/^http/, 'ws') + `/app/ws?${qs}`;
        // H2: carry the engine token in the WebSocket subprotocol, never the URL.
        const ws = new WebSocket(wsUrl, ['smc.v1', `smc.token.${tokenRef.current || ''}`]);
        wsRef.current = ws;
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('WebSocket timeout')); }
        }, 10000);

        ws.onopen = () => {
          if (!settled) { settled = true; clearTimeout(timeout); }
          reconnectCount.current = 0;
          setWsConnected(true);
          setError('');
          try { ws.send(JSON.stringify({ type: 'control', action: resume ? 'resume' : 'start', mode: sessionMode, engine, lang: MODE_LANG[sessionMode] || null, meetingId: meetingIdRef.current || null, retainAudio: retainAudioRef.current || false })); } catch (_) {}
          startHeartbeat();

          // D: wire up the TOKEN_REFRESH_MS interval that was defined but never used.
          // Without this, the 15-minute token expires mid-session, coach polls silently fail.
          if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
          tokenRefreshTimer.current = setInterval(async () => {
            try {
              await getEngineToken();
            } catch (_) {}
          }, TOKEN_REFRESH_MS);

          // D: client-side coach watchdog — if no coach output for >90s while live,
          // surface a visible reconnecting notice and attempt an immediate token refresh.
          const COACH_WATCHDOG_MS = 90000;
          if (coachWatchdogTimer.current) clearInterval(coachWatchdogTimer.current);
          lastCoachOutputTs.current = Date.now(); // reset on (re)connect
          coachWatchdogTimer.current = setInterval(async () => {
            if (liveStatus.current !== 'live') return;
            const gap = Date.now() - lastCoachOutputTs.current;
            if (gap > COACH_WATCHDOG_MS) {
              setCoachReconnecting(true);
              try { await getEngineToken(); } catch (_) {}
            }
          }, 30000);

          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === 'transcript' && msg.raw) {
                if (msg.speaker === 'others') {
                  const text = stripSpk(msg.cleaned || msg.raw);
                  const nowMs = Date.now();
                  setOthersLines(prev => {
                    const last = prev[prev.length - 1];
                    if (last && !last.flagged && !last.clarifiedByMe && nowMs - (last.tsMs || 0) <= PARA_PAUSE_MS && nowMs - (last.startMs || nowMs) <= PARA_MAX_MS) {
                      const merged = { ...last, raw: `${last.raw} ${msg.raw || ''}`.trim(), cleaned: `${last.cleaned} ${text}`.trim(), tsMs: nowMs, segmentId: null };
                      return [...prev.slice(0, -1), merged];
                    }
                    return [...prev.slice(-200), { raw: msg.raw, cleaned: text, ts: new Date().toLocaleTimeString(), tsMs: nowMs, startMs: nowMs, segmentId: null, corrected: null, clarifiedByMe: false, flagged: false }];
                  });

                  if (meetingIdRef.current) {
                    const mId = meetingIdRef.current;
                    fetch(`/api/meetings/${mId}/segments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        speaker: 'others',
                        raw: msg.raw,
                        cleaned: text,
                        lang: MODE_LANG[sessionMode] || null,
                      }),
                    })
                      .then(r => r.json())
                      .then(d => {
                        if (d.segmentId) {
                          setOthersLines(prev => {
                            if (!prev.length) return prev;
                            const copy = [...prev];
                            copy[copy.length - 1] = { ...copy[copy.length - 1], segmentId: d.segmentId };
                            return copy;
                          });
                        }
                      })
                      .catch(() => {});
                  }
                } else {
                  const text = stripSpk(msg.cleaned || msg.raw);
                  const nowMs = Date.now();
                  setMeLines(prev => {
                    const last = prev[prev.length - 1];
                    if (last && !last.flagged && nowMs - (last.tsMs || 0) <= PARA_PAUSE_MS && nowMs - (last.startMs || nowMs) <= PARA_MAX_MS) {
                      const merged = { ...last, raw: `${last.raw} ${msg.raw || ''}`.trim(), cleaned: `${last.cleaned} ${text}`.trim(), tsMs: nowMs };
                      return [...prev.slice(0, -1), merged];
                    }
                    return [...prev.slice(-200), { raw: msg.raw, cleaned: text, ts: new Date().toLocaleTimeString(), tsMs: nowMs, startMs: nowMs, flagged: false }];
                  });
                  if (meetingIdRef.current) {
                    const mId = meetingIdRef.current;
                    fetch(`/api/meetings/${mId}/segments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        speaker: 'me',
                        raw: msg.raw,
                        cleaned: text,
                        lang: MODE_LANG[sessionMode] || null,
                      }),
                    }).catch(() => {});
                  }
                }
              } else if (msg.type === 'engine_error') {
                setError(msg.message || 'Transcription engine error.');
                if (msg.fatal) updateStatus('error');
              } else if (msg.type === 'helper_status') {
                suppressMicRef.current = !!msg.connected;
                setHelperConnected(!!msg.connected);
              } else if (msg.type === 'session_state') {
                if (typeof msg.helperConnected === 'boolean') {
                  suppressMicRef.current = msg.helperConnected;
                  setHelperConnected(msg.helperConnected);
                }
                if (msg.status === 'paused') {
                  setPaused(true);
                  liveStatus.current = 'paused';
                  setStatus('paused');
                  stopHeartbeat();
                } else if (msg.status === 'active') {
                  setPaused(false);
                }
              }
            } catch (_) {}
          };

          ws.onclose = () => {
            setWsConnected(false);
            if (intentionalStop.current || liveStatus.current !== 'live') return;
            if (reconnectCount.current >= MAX_RECONNECTS) {
              setError('Connection lost. Max reconnect attempts reached.');
              liveStatus.current = 'error';
              setStatus('error');
              return;
            }
            const n = reconnectCount.current++;
            const delay = Math.min(1000 * Math.pow(2, n), 30000);
            setError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s… (${reconnectCount.current}/${MAX_RECONNECTS})`);
            reconnectTimer.current = setTimeout(() => {
              if (!intentionalStop.current) getEngineToken().then(() => openWs(code, sessionMode)).catch(() => {});
            }, delay);
          };

          ws.onerror = () => setError('WebSocket error – will reconnect.');
          resolve();
        };

        ws.onerror = () => {
          if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('WebSocket connection failed')); }
        };
      });
    }

    try {
      await getEngineToken();
      await openWs(sessionCode, mode);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      streamRef.current = stream;

      // Sarvam streaming engine: feed raw 16kHz PCM via AudioWorklet instead of
      // the WebM/Opus MediaRecorder segment loop. The worklet posts Int16 frames
      // (~100ms) which we wrap with the speaker byte and send as binary frames.
      if (engine === 'sarvam') {
        try {
          updateStatus('live');
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          audioCtxRef.current = audioCtx;
          await audioCtx.audioWorklet.addModule('/pcm16k-worklet.js');
          const srcNode = audioCtx.createMediaStreamSource(stream);
          const worklet = new AudioWorkletNode(audioCtx, 'pcm16k');
          workletNodeRef.current = worklet;
          worklet.port.onmessage = (e) => {
            const buf = e.data; // ArrayBuffer of Int16LE PCM
            if (!buf || suppressMicRef.current) return;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              try { wsRef.current.send(encodeChunk('me', buf)); } catch (_) {}
            }
          };
          // Pull the graph with a muted sink so the worklet keeps receiving audio.
          const sink = audioCtx.createGain();
          sink.gain.value = 0;
          pcmSinkRef.current = sink;
          srcNode.connect(worklet);
          worklet.connect(sink);
          sink.connect(audioCtx.destination);
          return;
        } catch (err) {
          setError('Sarvam capture failed: ' + String(err));
          updateStatus('error');
          try { audioCtxRef.current?.close(); } catch (_) {}
          audioCtxRef.current = null; workletNodeRef.current = null; pcmSinkRef.current = null;
          streamRef.current?.getTracks().forEach(t => t.stop());
          wsRef.current = null; streamRef.current = null;
          return;
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';

      // Send each segment as a COMPLETE, self-contained file. In continuous
      // timeslice mode MediaRecorder only writes the container header into the
      // first chunk, so later chunks cannot be decoded standalone by the engine.
      // Cycling stop/start makes every segment its own valid file.
      updateStatus('live');
      const startSegment = () => {
        if (intentionalStop.current || liveStatus.current !== 'live') return;
        if (suppressMicRef.current) {
          // A desktop helper owns the mic; skip and re-check shortly.
          segmentTimer.current = setTimeout(startSegment, 1000);
          return;
        }
        let parts = [];
        const rec = new MediaRecorder(stream, { mimeType });
        recorderRef.current = rec;
        rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
        rec.onstop = async () => {
          const blob = new Blob(parts, { type: mimeType });
          parts = [];
          if (blob.size > 1200 && wsRef.current?.readyState === WebSocket.OPEN && !suppressMicRef.current) {
            try { wsRef.current.send(encodeChunk('me', await blob.arrayBuffer())); } catch (_) {}
          }
          startSegment();
        };
        rec.start();
        segmentTimer.current = setTimeout(() => { try { rec.stop(); } catch (_) {} }, CHUNK_MS);
      };
      startSegment();
    } catch (err) {
      setError(String(err));
      updateStatus('error');
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      wsRef.current = null; recorderRef.current = null; streamRef.current = null;
    }
  }, [sessionCode, mode, engine, objective, contextNotes, title, updateStatus, getEngineToken, startHeartbeat, stopHeartbeat]);

  // Pre-start readiness monitor: keep a lightweight browser connection open
  // during preparation so helper presence + readiness reflect reality BEFORE
  // Start is pressed. It never sends control:start, so no capture begins.
  useEffect(() => {
    if (!sessionCode || status === 'live' || status === 'connecting' || status === 'paused' || paused) return undefined;
    let cancelled = false;
    let ws = null;
    (async () => {
      try { await getEngineToken(); } catch (_) { return; }
      if (cancelled) return;
      const qs = new URLSearchParams({ mode, role: 'browser', engine });
      const langHint = MODE_LANG[mode];
      if (langHint) qs.set('lang', langHint);
      // H2: carry the engine token in the WebSocket subprotocol, never the URL.
      try { ws = new WebSocket(ENGINE_URL.replace(/^http/, 'ws') + `/app/ws?${qs}`, ['smc.v1', `smc.token.${tokenRef.current || ''}`]); } catch (_) { return; }
      monitorWsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'helper_status') setHelperConnected(!!msg.connected);
          else if (msg.type === 'session_state' && typeof msg.helperConnected === 'boolean') setHelperConnected(msg.helperConnected);
        } catch (_) {}
      };
      ws.onclose = () => { if (monitorWsRef.current === ws) monitorWsRef.current = null; };
    })();
    return () => {
      cancelled = true;
      if (ws) { try { ws.close(); } catch (_) {} }
      if (monitorWsRef.current) { try { monitorWsRef.current.close(); } catch (_) {} monitorWsRef.current = null; }
    };
  }, [sessionCode, status, paused, mode, engine, getEngineToken]);

  const stopSession = useCallback(() => {
    intentionalStop.current = true;
    if (segmentTimer.current) { clearTimeout(segmentTimer.current); segmentTimer.current = null; }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (tokenRefreshTimer.current) { clearInterval(tokenRefreshTimer.current); tokenRefreshTimer.current = null; }
    if (coachWatchdogTimer.current) { clearInterval(coachWatchdogTimer.current); coachWatchdogTimer.current = null; }
    setCoachReconnecting(false);
    stopHeartbeat();
    recorderRef.current?.stop();
    try { workletNodeRef.current?.disconnect(); } catch (_) {}
    try { pcmSinkRef.current?.disconnect(); } catch (_) {}
    try { audioCtxRef.current?.close(); } catch (_) {}
    audioCtxRef.current = null; workletNodeRef.current = null; pcmSinkRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      try { wsRef.current.send(JSON.stringify({ type: 'control', action: 'stop' })); } catch (_) {}
      try { wsRef.current.close(); } catch (_) {}
    }
    wsRef.current = null; recorderRef.current = null; streamRef.current = null;
    updateStatus('stopped');
    setWsConnected(false);
    if (meetingIdRef.current) {
      fetch(`/api/meetings/${meetingIdRef.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ended_at: new Date().toISOString() }),
      }).catch(() => {});
    }
  }, [updateStatus, stopHeartbeat]);

  const handleStartClick = useCallback(() => {
    if (!complianceAckRef.current) { setShowComplianceModal(true); return; }
    startSession();
  }, [startSession]);

  const acceptComplianceAndStart = useCallback((retainAudio) => {
    complianceAckRef.current = true;
    retainAudioRef.current = retainAudio === true;
    setRetainAudioOpt(retainAudio === true);
    setShowComplianceModal(false);
    startSession();
  }, [startSession]);

  const resumeSession = useCallback(() => {
    startSession({ resume: true });
  }, [startSession]);

  const copyAssistCard = useCallback((card) => {
    const key = ASSIST_DEDUP_KEY(card);
    const textToCopy = card.value || card.query || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedAssist(key); setTimeout(() => setCopiedAssist(null), 2000);
    }).catch(() => {});
  }, []);

  // ---- Cockpit panel reorder (Arrange mode) ----
  const persistOrder = useCallback((order) => {
    setPanelOrder(order);
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(order)); } catch (_) {}
  }, []);

  const resetLayout = useCallback(() => {
    persistOrder([...COCKPIT_PANELS]);
  }, [persistOrder]);

  const reorderPanels = useCallback((fromKey, toKey, after) => {
    if (!fromKey || fromKey === toKey) return;
    setPanelOrder(prev => {
      const next = prev.filter(k => k !== fromKey);
      let idx = next.indexOf(toKey);
      if (idx < 0) return prev;
      if (after) idx += 1;
      next.splice(idx, 0, fromKey);
      try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const onPanelDragStart = useCallback((key, e) => {
    dragKeyRef.current = key;
    setDragKey(key);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); } catch (_) {}
  }, []);

  const onPanelDragOver = useCallback((key, e) => {
    if (!dragKeyRef.current) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    setDragOverKey(prev => (prev === key ? prev : key));
  }, []);

  const onPanelDrop = useCallback((key, e) => {
    e.preventDefault();
    const from = dragKeyRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    reorderPanels(from, key, after);
    dragKeyRef.current = null;
    setDragKey(null);
    setDragOverKey(null);
  }, [reorderPanels]);

  const onPanelDragEnd = useCallback(() => {
    dragKeyRef.current = null;
    setDragKey(null);
    setDragOverKey(null);
  }, []);

  const isLive = status === 'live';
  useEffect(() => { if (isLive) setPrepCollapsed(true); }, [isLive]);
  const isConnecting = status === 'connecting';
  const isPaused = status === 'paused' || paused;
  const showDeafWarning = isLive && helperConnected === false;
  const coachLabels = (
    modeType === 'interview' ? { open: 'Claims to verify', sugg: 'Suggested questions' }
    : modeType === 'customer_service' ? { open: 'Open customer issues', sugg: 'Suggested next steps' }
    : { open: 'Open items from others', sugg: 'Suggested responses' }
  );
  const canStart = !isLive && !isConnecting && !isPaused;
  const correctionCount = coaching?.corrections?.length ?? 0;
  const activeFlaggedItems = flaggedItems.filter(f => !f.addressed);
  const addressedCount = flaggedItems.filter(f => f.addressed).length;
  const showFollowUp = (isLive || status === 'stopped') && flaggedItems.length > 0;
  const showPrepPanel = !isLive && !isConnecting;

  // Which cockpit panels are visible in the current state, and the order helpers
  // that drive the CSS-`order` based vertical layout + drag-to-reorder.
  const panelVisibility = {
    transcripts: isLive || status === 'stopped' || status === 'error',
    coaching: isLive || status === 'stopped',
    assist: isLive || status === 'stopped',
    followup: showFollowUp,
  };
  const visiblePanels = panelOrder.filter(k => panelVisibility[k]);
  const orderIsCustom = panelOrder.some((k, i) => k !== COCKPIT_PANELS[i]);
  const orderIndexOf = (key) => {
    const i = panelOrder.indexOf(key);
    return i < 0 ? COCKPIT_PANELS.indexOf(key) : i;
  };
  const panelBlockStyle = (key) => {
    const s = { order: orderIndexOf(key), position: 'relative' };
    if (key === 'transcripts') { s.flex = 1; s.minHeight = 0; s.display = 'flex'; s.flexDirection = 'column'; }
    return s;
  };
  const panelBlockClass = (key) => {
    let c = 'smc-panel-block';
    if (editLayout) c += ' editing';
    if (dragKey === key) c += ' dragging';
    if (dragOverKey === key && dragKey && dragKey !== key) c += ' droptarget';
    return c;
  };

  // Leave Arrange mode automatically when the cockpit is gone or only one panel
  // remains (nothing to reorder).
  useEffect(() => {
    if (editLayout && visiblePanels.length < 2) setEditLayout(false);
  }, [editLayout, visiblePanels.length]);

  return (
    <AppShell>
    <>
      <div style={styles.root}>

        {/* Top bar */}
        <div className="smc-toprow" style={styles.topbar}>
          <div>
            <div style={{
              fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em',
              background: 'linear-gradient(135deg, var(--accent-hi) 0%, var(--others) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Silent Meeting Copilot</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <a href="/meetings" style={styles.navLink}>&larr; Sessions</a>
              <a href="/profile" style={styles.navLink}>Profile</a>
            </div>
          </div>

          <div style={styles.codeBox}>
            <span style={{ ...styles.dot, background: helperConnected ? '#22c55e' : '#6b7280' }} />
            <span style={styles.codeLabel}>
              {helperConnected ? 'Desktop helper connected' : 'Desktop helper not connected'}
            </span>
          </div>

          {botStatus && (
            <div style={{ ...styles.codeBox, background: botStatus === 'in_meeting' ? 'rgba(20,83,45,0.4)' : BOT_TERMINAL.includes(botStatus) ? 'rgba(69,10,10,0.4)' : 'rgba(30,58,95,0.4)', border: '1px solid', borderColor: botStatus === 'in_meeting' ? '#166534' : BOT_TERMINAL.includes(botStatus) ? '#7f1d1d' : '#1e3a8a' }}>
              <span style={{ ...styles.dot, background: botStatus === 'in_meeting' ? '#22c55e' : BOT_TERMINAL.includes(botStatus) ? '#ef4444' : '#facc15' }} />
              <span style={styles.codeLabel}>
                Bot: {botStatus === 'queued' ? 'queued' : botStatus === 'joining' ? 'joining…' : botStatus === 'waiting_room' ? 'in waiting room' : botStatus === 'in_meeting' ? 'in meeting' : botStatus === 'passcode_required' ? 'passcode required' : botStatus === 'failed' ? 'failed' : 'left'}
              </span>
            </div>
          )}

          <div className="smc-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={styles.selectorLabel}>Meeting language</span>
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                style={styles.select}
                disabled={isLive || isConnecting}
              >
                <option value="english">English (fast)</option>
                <option value="hindi-urdu">Hindi / Urdu (multilingual)</option>
                <option value="auto">Auto-detect</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={styles.selectorLabel}>Engine</span>
              <select
                value={engine}
                onChange={e => setEngine(e.target.value)}
                style={styles.select}
                disabled={isLive || isConnecting}
              >
                <option value="nova3">Standard (Nova-3)</option>
                <option value="sarvam">Hindi streaming (Sarvam beta)</option>
              </select>
            </div>

            <span style={{ ...styles.dot, background: isLive ? '#22c55e' : isConnecting ? '#facc15' : isPaused ? '#f59e0b' : (helperConnected ? '#22c55e' : '#6b7280') }} />
            <span style={styles.statusText}>
              {isLive ? `Live — ${MODE_LABEL[mode] || mode}`
                : isConnecting ? 'Connecting…'
                : isPaused ? 'Paused'
                : status === 'stopped' ? 'Stopped'
                : helperConnected ? 'Ready'
                : 'Waiting for desktop helper…'}
            </span>

            {canStart && (
              <button onClick={handleStartClick} style={{ ...styles.btn, background: '#2AB49F', minWidth: 120 }} disabled={!sessionCode}>
                Start Session
              </button>
            )}
            {isPaused && (
              <button onClick={resumeSession} style={{ ...styles.btn, background: '#f59e0b', minWidth: 120 }}>Resume</button>
            )}
            {(isLive || isConnecting) && (
              <button onClick={stopSession} style={{ ...styles.btn, background: '#ef4444', minWidth: 80 }}>Stop</button>
            )}
          </div>
        </div>

        {/* Preparation panel — visible when not live */}
        {showPrepPanel && (
          <div className="smc-prep-panel">
            <div style={styles.prepHeader}>
              <span style={styles.prepTitle}>Session preparation</span>
              {meetingId && <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>ID: {meetingId.slice(0, 8)}…</span>}
              <button
                onClick={() => setPrepCollapsed(c => !c)}
                style={styles.prepToggle}
                title={prepCollapsed ? 'Expand preparation' : 'Collapse preparation'}
              >
                {prepCollapsed ? 'Edit details ▾' : 'Collapse ▴'}
              </button>
            </div>
            <div style={prepCollapsed ? { display: 'none' } : styles.prepBody}>
              {/* Session type */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel} htmlFor="mode-type">Session type</label>
                <select
                  id="mode-type"
                  value={modeType}
                  onChange={e => setModeType(e.target.value)}
                  style={styles.textInput}
                  disabled={isLive || isConnecting}
                >
                  <option value="meeting">Meeting (default)</option>
                  <option value="interview">Interview (recruitment)</option>
                  <option value="customer_service">Customer service</option>
                </select>
                <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                  Meeting works today. Interview and customer service add vertical-specific assistance in upcoming releases.
                </div>
              </div>

              {/* Title */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel} htmlFor="session-title">Session title (optional)</label>
                <input
                  id="session-title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Q2 Planning — Client X"
                  style={styles.textInput}
                  maxLength={300}
                />
              </div>

              {/* Objective */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel} htmlFor="objective">
                  Meeting objective (optional — enables coaching alignment)
                </label>
                <textarea
                  id="objective"
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="e.g. Agree on project timeline and assign owners"
                  style={{ ...styles.textInput, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                  maxLength={8000}
                />
              </div>

              {/* Context notes — prominently labelled */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel} htmlFor="context-notes">
                  Meeting context and coaching instructions
                </label>
                <textarea
                  id="context-notes"
                  value={contextNotes}
                  onChange={e => setContextNotes(e.target.value)}
                  placeholder="Describe what this meeting is about and how you want to be coached. E.g. 'Quarterly review with client X. They are evaluating EV fleet options. We offer fleet advisory. Coach me to ask about budget and timeline.'"
                  style={{ ...styles.textInput, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                  maxLength={20000}
                />
                <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                  {contextNotes.length}/20000 chars — this feeds the coaching AI for this session
                </div>
              </div>

              {/* Reference document upload */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel}>
                  Reference documents (.md or .txt only, max 256 KB each)
                </label>
                <div
                  className={`smc-drop-zone${isDragOver ? ' drag-over' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => document.getElementById('file-input').click()}
                  style={{ cursor: 'pointer' }}
                >
                  <input
                    id="file-input"
                    type="file"
                    accept=".md,.txt"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileInput}
                  />
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Drop .md or .txt files here, or <span style={{ color: '#38bdf8', textDecoration: 'underline' }}>click to browse</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    Upload briefs, notes, or agendas. Content feeds the coaching AI as reference only.
                  </div>
                </div>
                {uploadError && (
                  <div style={styles.uploadError}>{uploadError}</div>
                )}
                {refDocs.length > 0 && (
                  <div style={styles.docList}>
                    {refDocs.map(doc => (
                      <div key={doc.id} style={styles.docItem}>
                        <span style={styles.docIcon}>📄</span>
                        <span style={styles.docName}>{doc.filename}</span>
                        {doc.size_bytes && (
                          <span style={styles.docSize}>{Math.ceil(doc.size_bytes / 1024)} KB</span>
                        )}
                        <button
                          onClick={() => removeRefDoc(doc.id)}
                          style={styles.docRemove}
                          title="Remove document"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Meeting bot block (A1) */}
              <div style={styles.fieldRow}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={styles.selectorLabel}>Meeting bot (optional)</label>
                  {botRequestId && botStatus && (
                    <span style={{
                      ...styles.botChip,
                      background: botStatus === 'in_meeting' ? '#14532d' : BOT_TERMINAL.includes(botStatus) ? '#450a0a' : '#1c3d5a',
                      color: botStatus === 'in_meeting' ? '#86efac' : BOT_TERMINAL.includes(botStatus) ? '#fca5a5' : '#93c5fd',
                    }}>
                      {botStatus === 'queued' ? 'Bot queued' : botStatus === 'joining' ? 'Bot joining…' : botStatus === 'waiting_room' ? 'Bot in waiting room' : botStatus === 'in_meeting' ? 'Bot in meeting' : botStatus === 'passcode_required' ? 'Passcode required' : botStatus === 'failed' ? 'Bot failed' : 'Bot left'}
                    </span>
                  )}
                </div>
                {botNotice && (
                  <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 6, padding: '6px 10px', background: '#1c1007', borderRadius: 4, border: '1px solid #92400e' }}>
                    {botNotice}
                  </div>
                )}
                {!botRequestId ? (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={botMeetingNumber}
                      onChange={e => setBotMeetingNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="Zoom meeting number (9–12 digits)"
                      style={styles.textInput}
                      maxLength={12}
                      disabled={isLive || isConnecting}
                    />
                    <input
                      type="password"
                      value={botPasscode}
                      onChange={e => setBotPasscode(e.target.value)}
                      placeholder="Passcode (optional)"
                      style={{ ...styles.textInput, marginTop: 6 }}
                      disabled={isLive || isConnecting}
                      autoComplete="off"
                    />
                    <input
                      type="text"
                      value={botName}
                      onChange={e => setBotName(e.target.value)}
                      placeholder="Bot display name"
                      style={{ ...styles.textInput, marginTop: 6 }}
                      maxLength={100}
                      disabled={isLive || isConnecting}
                    />
                    <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4 }}>
                      Without a passcode the bot joins and waits in the waiting room for the host to admit it. No SMC logo or branding appears in the bot name.
                    </div>
                    <button
                      onClick={submitBotRequest}
                      disabled={!/^\d{9,12}$/.test(botMeetingNumber) || !botName.trim()}
                      style={{ ...styles.btn, background: '#1e3a5f', marginTop: 8, opacity: !/^\d{9,12}$/.test(botMeetingNumber) || !botName.trim() ? 0.5 : 1 }}
                    >
                      Join meeting as bot
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>Bot: {botName}</span>
                    <button
                      onClick={removeBotRequest}
                      style={{ ...styles.btn, background: '#450a0a', fontSize: 12, padding: '4px 10px' }}
                    >
                      Remove bot
                    </button>
                  </div>
                )}
              </div>

              {/* Save button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <button
                  onClick={savePrep}
                  disabled={saveStatus === 'saving'}
                  style={{
                    ...styles.btn,
                    background: saveStatus === 'saved' ? '#166534' : saveStatus === 'error' ? '#7f1d1d' : '#1e3a5f',
                    minWidth: 140,
                  }}
                >
                  {saveStatus === 'saving' ? 'Saving…'
                    : saveStatus === 'saved' ? '✓ Saved'
                    : saveStatus === 'error' ? 'Save failed'
                    : 'Save preparation'}
                </button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Save without going live — reopen anytime
                </span>
              </div>
            </div>
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}
        {showDeafWarning && (
          <div style={styles.warnBox}>
            <strong>No desktop helper connected.</strong> The other side&apos;s audio is not being captured. Open the SMC Helper on this computer and it will join automatically.
          </div>
        )}
        {isPaused && (
          <div style={{ ...styles.warnBox, borderColor: '#92400e', background: '#1c1007', color: '#fcd34d' }}>
            This session is paused. Press <strong>Resume</strong> to continue capturing. It also auto-pauses if the cockpit is closed, and stops at a 3-hour limit.
          </div>
        )}
        {showComplianceModal && (
          <ComplianceModal
            modeType={modeType}
            onCancel={() => setShowComplianceModal(false)}
            onAccept={acceptComplianceAndStart}
          />
        )}

        {/* Cockpit panels — vertical drag-to-reorder via opt-in Arrange mode */}
        {panelVisibility.transcripts && (
          <div className="smc-cockpit" style={styles.cockpit}>
          {visiblePanels.length >= 2 && (
            <div style={styles.arrangeBar}>
              <button
                onClick={() => setEditLayout(v => !v)}
                style={editLayout ? styles.arrangeBtnActive : styles.arrangeBtn}
              >
                {editLayout ? '✓ Done arranging' : '⠿ Arrange panels'}
              </button>
              {editLayout && (
                <span style={styles.arrangeHint}>Drag panels up or down to reorder. Saved on this device.</span>
              )}
              {editLayout && orderIsCustom && (
                <button onClick={resetLayout} style={styles.arrangeReset}>Reset order</button>
              )}
            </div>
          )}
          <div
            className={panelBlockClass('transcripts')}
            style={panelBlockStyle('transcripts')}
            draggable={editLayout}
            onDragStart={editLayout ? (e) => onPanelDragStart('transcripts', e) : undefined}
            onDragOver={editLayout ? (e) => onPanelDragOver('transcripts', e) : undefined}
            onDrop={editLayout ? (e) => onPanelDrop('transcripts', e) : undefined}
            onDragEnd={editLayout ? onPanelDragEnd : undefined}
          >
            {editLayout && (
              <div style={styles.dragBadge}><span style={styles.dragGrip}>⠿</span> {PANEL_LABELS.transcripts}</div>
            )}
          <div className="smc-grid" style={styles.grid}>
            {/* ME panel */}
            <div className="smc-transcript-panel me-panel">
              <div style={{ ...styles.panelHead, color: 'var(--me)' }}>{meName} — microphone</div>
              <div ref={meScrollRef} style={styles.transcript}>
                {meLines.length === 0 && <span style={styles.muted}>Your speech will appear here…</span>}
                {meLines.map((l, i) => (
                  <div key={i} style={l.flagged ? { ...styles.line, ...styles.lineFlagged } : styles.line}>
                    <span style={styles.ts}>{l.ts}</span>
                    <span style={{ flex: 1 }}>{stripSpk(l.cleaned)}</span>
                    {l.raw !== l.cleaned && (
                      <span style={styles.hint} title={l.raw}> [raw differs]</span>
                    )}
                    {isLive && meetingIdRef.current && (
                      <button
                        className={`smc-flag-btn${l.flagged ? ' flagged' : ''}`}
                        onClick={() => l.flagged ? unflagLine(l, 'me') : flagItem(l.cleaned, 'me', l.ts, null)}
                        style={{
                          ...styles.flagBtn,
                          color: l.flagged ? 'var(--warn)' : 'var(--tx-2)',
                          cursor: 'pointer',
                        }}
                        title={l.flagged ? 'Flagged — click to remove' : 'Flag this for follow-up'}
                      >
                        {l.flagged ? '⚑' : '⚐'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* OTHERS panel */}
            <div className="smc-transcript-panel others-panel">
              <div style={{ ...styles.panelHead, color: 'var(--others)' }}>
                OTHERS — far-end (system audio)
                {correctionCount > 0 && (
                  <span style={styles.correctionCountBadge}>{correctionCount} clarified</span>
                )}
              </div>
              <div ref={otScrollRef} style={styles.transcript}>
                {othersLines.length === 0 && (
                  <span style={styles.muted}>
                    Others&apos; speech appears here via the desktop helper.<br />
                    Open the SMC Helper on this computer — it connects automatically.
                  </span>
                )}
                {othersLines.map((l, i) => (
                  <div key={i} style={l.flagged ? { ...styles.line, ...styles.lineFlagged } : styles.line}>
                    <span style={styles.ts}>{l.ts}</span>
                    {l.clarifiedByMe ? (
                      <span style={{ flex: 1 }}>
                        <span style={styles.clarifiedBadge}>clarified</span>
                        <span style={{ color: '#86efac' }}>{l.corrected}</span>
                        <span style={styles.strikethrough} title={`Original: ${l.cleaned}`}>{' '}{l.cleaned}</span>
                      </span>
                    ) : (
                      <span style={{ flex: 1 }}>{stripSpk(l.cleaned)}</span>
                    )}
                    {isLive && meetingIdRef.current && (
                      <button
                        className={`smc-flag-btn${l.flagged ? ' flagged' : ''}`}
                        onClick={() => l.flagged ? unflagLine(l, 'others') : flagItem(l.corrected || l.cleaned, 'others', l.ts, l.segmentId)}
                        style={{
                          ...styles.flagBtn,
                          color: l.flagged ? 'var(--warn)' : 'var(--tx-2)',
                          cursor: 'pointer',
                        }}
                        title={l.flagged ? 'Flagged — click to remove' : 'Flag this for follow-up'}
                      >
                        {l.flagged ? '⚑' : '⚐'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>

        {/* Coaching panel */}
        {panelVisibility.coaching && (
          <div
            className={panelBlockClass('coaching')}
            style={panelBlockStyle('coaching')}
            draggable={editLayout}
            onDragStart={editLayout ? (e) => onPanelDragStart('coaching', e) : undefined}
            onDragOver={editLayout ? (e) => onPanelDragOver('coaching', e) : undefined}
            onDrop={editLayout ? (e) => onPanelDrop('coaching', e) : undefined}
            onDragEnd={editLayout ? onPanelDragEnd : undefined}
          >
            {editLayout && (
              <div style={styles.dragBadge}><span style={styles.dragGrip}>⠿</span> {PANEL_LABELS.coaching}</div>
            )}
          <div className="smc-coach-panel">
            <div style={styles.coachHeader}>
              <span style={styles.coachTitle}>Coaching</span>
              {coaching?.updatedAt && <span style={styles.coachTs}>Updated {coaching.updatedAt}</span>}
              {isLive && !coaching && <span style={styles.coachTs}>First update in ~{COACH_MIN_SEGMENTS} segments…</span>}
            </div>
            {coaching ? (
              <div style={styles.coachStack}>
                {/* Suggested responses — most important; objective alignment embedded below */}
                <div style={styles.coachBlock}>
                  <div style={styles.coachSectionLabel}>{coachLabels.sugg}</div>
                  {coaching.suggestions?.length > 0 ? (
                    <ul style={styles.suggList}>
                      {coaching.suggestions.map((sug, i) => (
                        <li key={i} style={styles.suggItem}>{renderHighlighted(sug)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={styles.coachNone}>Suggestions will appear as the conversation develops.</div>
                  )}
                  {coaching.alignment && (
                    <div style={styles.alignEmbed}>
                      <div style={styles.alignLabel}>Objective alignment</div>
                      <div style={styles.alignText}>{coaching.alignment}</div>
                    </div>
                  )}
                </div>

                {/* Stay on track — watches ME's own speech; escalates if ignored */}
                {coaching.selfCorrection?.drifting && coaching.selfCorrection?.message ? (
                  <div style={driftStreak >= 2 ? styles.trackBlockAlert : styles.trackBlock}>
                    <div style={styles.trackLabel}>{driftStreak >= 2 ? 'Stay on track — you are drifting' : 'Stay on track'}</div>
                    <div style={driftStreak >= 2 ? styles.trackMsgAlert : styles.trackMsg}>{coaching.selfCorrection.message}</div>
                  </div>
                ) : (
                  <div style={styles.trackBlockOk}>
                    <div style={styles.trackLabel}>Stay on track</div>
                    <div style={styles.trackOkText}>On objective. Keep going.</div>
                  </div>
                )}

                {/* Open items from others */}
                <div style={styles.coachBlock}>
                  <div style={styles.coachSectionLabel}>{coachLabels.open}</div>
                  {coaching.openItems?.length > 0 ? (
                    <ul style={styles.coachList}>
                      {coaching.openItems.map((item, i) => <li key={i} style={styles.coachItem}>{item}</li>)}
                    </ul>
                  ) : (
                    <div style={styles.coachNone}>None detected</div>
                  )}
                </div>

                {/* Talk balance — slim, optional */}
                <div style={styles.coachBlockSlim}>
                  <div style={styles.balanceRow}>
                    <span style={{ ...styles.balanceLabel, color: '#22c55e' }}>You {coaching.talkBalance?.mePercent ?? 50}%</span>
                    <div style={styles.balanceBar}>
                      <div style={{ ...styles.balanceFill, width: `${coaching.talkBalance?.mePercent ?? 50}%` }} />
                    </div>
                    <span style={{ ...styles.balanceLabel, color: '#38bdf8' }}>Others {coaching.talkBalance?.othersPercent ?? 50}%</span>
                  </div>
                  {correctionCount > 0 && (
                    <div style={styles.repairNote}>{correctionCount} OTHERS turn{correctionCount !== 1 ? 's' : ''} auto-corrected from your restatements.</div>
                  )}
                </div>
              </div>

            ) : (
              <div style={{ padding: '12px 16px', color: '#9aa0a6', fontSize: 13 }}>
                {coachReconnecting
                  ? <span style={{ color: '#facc15' }}>Coaching reconnecting… (token refreshing)</span>
                  : isLive ? 'Coaching will appear after a few transcript segments.' : 'No coaching data for this session.'}
              </div>
            )}
          </div>
          </div>
        )}

        {/* Assist panel */}
        {panelVisibility.assist && (
          <div
            className={panelBlockClass('assist')}
            style={panelBlockStyle('assist')}
            draggable={editLayout}
            onDragStart={editLayout ? (e) => onPanelDragStart('assist', e) : undefined}
            onDragOver={editLayout ? (e) => onPanelDragOver('assist', e) : undefined}
            onDrop={editLayout ? (e) => onPanelDrop('assist', e) : undefined}
            onDragEnd={editLayout ? onPanelDragEnd : undefined}
          >
            {editLayout && (
              <div style={styles.dragBadge}><span style={styles.dragGrip}>⠿</span> {PANEL_LABELS.assist}</div>
            )}
          <div className="smc-assist-panel">
            <div style={styles.assistHeader}>
              <span style={styles.assistTitle}>Live Assist</span>
              <span style={styles.assistCount}>
                {assistCards.length > 0 ? `${assistCards.length} card${assistCards.length !== 1 ? 's' : ''}` : 'Waiting for references…'}
              </span>
              {assistCards.length > 0 && (
                <button style={styles.clearBtn} onClick={() => { setAssistCards([]); seenAssistKeys.current = new Set(); }}>
                  Clear all
                </button>
              )}
              <a href="/profile" style={styles.profileLink}>Edit profile</a>
            </div>
            {assistCards.length === 0 && (
              <div style={{ padding: '12px 16px', color: '#9aa0a6', fontSize: 13 }}>
                Cards appear when you reference your profile or signal a web search ("let me google…").
              </div>
            )}
            {assistCards.length > 0 && (
              <div style={styles.assistGrid}>
                {assistCards.map((card, i) => {
                  const key = ASSIST_DEDUP_KEY(card);
                  const isCopied = copiedAssist === key;
                  return (
                    <div key={i} style={{
                      ...styles.assistCard,
                      borderColor: card.type === 'lookup' ? '#854d0e' : '#1e3a5f',
                      background: card.type === 'lookup' ? '#1c1007' : '#0c1f33',
                    }}>
                      <div style={styles.assistCardTop}>
                        <span style={{
                          ...styles.assistTypeBadge,
                          background: card.type === 'lookup' ? '#78350f' : '#1e3a5f',
                          color: card.type === 'lookup' ? '#fde68a' : '#93c5fd',
                        }}>
                          {card.type === 'lookup' ? 'search' : 'my info'}
                        </span>
                        <span style={styles.assistLabel}>{card.label}</span>
                      </div>
                      {card.missing ? (
                        <div style={styles.assistMissing}>
                          Not in your profile yet — <a href="/profile" style={{ color: '#a78bfa', textDecoration: 'underline' }}>add it</a>
                        </div>
                      ) : (
                        <>
                          <div style={styles.assistValue}>{card.value}</div>
                          {card.value && (
                            <button style={{ ...styles.copyBtn, background: isCopied ? '#166534' : '#1a2740' }} onClick={() => copyAssistCard(card)}>
                              {isCopied ? '✓ Copied' : 'Copy'}
                            </button>
                          )}
                        </>
                      )}
                      {card.type === 'lookup' && card.results && card.results.length > 0 && (
                        <div style={styles.searchResults}>
                          {card.results.map((r, ri) => (
                            <div key={ri} style={styles.searchResult}>
                              <a href={r.url} target="_blank" rel="noreferrer" style={styles.searchResultTitle}>{r.title}</a>
                              {r.snippet && <div style={styles.searchResultSnippet}>{r.snippet}</div>}
                              <button style={{ ...styles.copyBtn, marginTop: 4, fontSize: 10 }} onClick={() => navigator.clipboard.writeText(r.url).catch(() => {})}>
                                Copy link
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        )}

        {/* Follow-up Tracker */}
        {panelVisibility.followup && (
          <div
            className={panelBlockClass('followup')}
            style={panelBlockStyle('followup')}
            draggable={editLayout}
            onDragStart={editLayout ? (e) => onPanelDragStart('followup', e) : undefined}
            onDragOver={editLayout ? (e) => onPanelDragOver('followup', e) : undefined}
            onDrop={editLayout ? (e) => onPanelDrop('followup', e) : undefined}
            onDragEnd={editLayout ? onPanelDragEnd : undefined}
          >
            {editLayout && (
              <div style={styles.dragBadge}><span style={styles.dragGrip}>⠿</span> {PANEL_LABELS.followup}</div>
            )}
          <div className="smc-followup-outer">
            <div style={styles.followUpHeader}>
              <span style={styles.followUpTitle}>Follow-up Tracker</span>
              <span style={styles.followUpCount}>
                {activeFlaggedItems.length} active
                {addressedCount > 0 && ` · ${addressedCount} addressed`}
              </span>
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                Flag transcript lines with ⚐ to add them here. Results appear within 1–5 min.
              </span>
            </div>
            <div className="smc-followup" style={styles.followUpGrid}>
              <div style={{ ...styles.followUpPanel, borderColor: '#1e4d2b' }}>
                <div style={{ ...styles.followUpPanelHead, color: '#4ade80' }}>Talking Points</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {flaggedItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        ...styles.tpItem,
                        opacity: item.addressed ? 0.45 : 1,
                        borderColor: item.addressed ? '#1f2937' : '#1e4d2b',
                      }}
                    >
                      <div style={styles.tpNumber}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.tpQuote}>&ldquo;{stripSpk(item.text)}&rdquo;</div>
                        <div style={styles.tpMeta}>
                          {item.speaker === 'others' ? 'OTHERS' : meName} &middot; {item.ts}
                        </div>
                        {item.status === 'pending' || item.status === 'processing' ? (
                          <div style={styles.tpWorking}>
                            <span style={styles.workingDot} />
                            {item.status === 'processing' ? 'Generating talking point…' : 'Queued…'}
                          </div>
                        ) : item.assist_text ? (
                          <div style={styles.tpAssist}>{item.assist_text}</div>
                        ) : null}
                        <button
                          onClick={() => item.id && markAddressed(item.id, !item.addressed)}
                          style={{ ...styles.addressBtn, opacity: item.id ? 1 : 0.4 }}
                          disabled={!item.id}
                        >
                          {item.addressed ? '↩ Un-address' : '✓ Mark addressed'}
                        </button>
                      </div>
                      <button onClick={() => removeFlag(item)} title="Remove this flag" style={styles.removeFlagBtn}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...styles.followUpPanel, borderColor: '#1e3a5f' }}>
                <div style={{ ...styles.followUpPanelHead, color: '#60a5fa' }}>Research</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {flaggedItems.map((item, idx) => {
                    const q = encodeURIComponent((item.text || '').trim().slice(0, 120));
                    const links = [
                      { label: 'Web', url: `https://www.google.com/search?q=${q}` },
                      { label: 'News', url: `https://news.google.com/search?q=${q}` },
                      { label: 'LinkedIn', url: `https://www.linkedin.com/search/results/all/?keywords=${q}` },
                    ];
                    const working = item.status === 'pending' || item.status === 'processing';
                    const hasRefs = item.references && item.references.length > 0;
                    return (
                      <div key={item.id || idx} style={{ ...styles.refItem, opacity: item.addressed ? 0.45 : 1 }}>
                        <div style={styles.tpNumber}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          {hasRefs && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                              {item.references.map((r, ri) => (
                                <div key={ri} style={styles.refResult}>
                                  <a href={r.url} target="_blank" rel="noreferrer" style={styles.refTitle}>{r.title}</a>
                                  {r.snippet && <div style={styles.refSnippet}>{r.snippet}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                          {working ? (
                            <div style={styles.tpWorking}>
                              <span style={styles.workingDot} />
                              Researching…
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {links.map((l) => (
                                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" style={styles.researchLink}>{l.label} ↗</a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          </div>
        )}
          </div>
        )}

        <div style={styles.foot}>
          Engine: {ENGINE_URL}&nbsp;&middot;&nbsp;WS:&nbsp;
          <span style={{ color: wsConnected ? '#22c55e' : '#9aa0a6' }}>{wsConnected ? 'connected' : 'disconnected'}</span>
          {isLive && <>&nbsp;&middot;&nbsp;<span style={{ color: '#2AB49F' }}>{MODE_LABEL[mode]}</span></>}
          {meetingId && <>&nbsp;&middot;&nbsp;<span style={{ color: '#9aa0a6' }}>recording</span></>}
        </div>
      </div>
    </>
    </AppShell>
  );
}

const styles = {
  root: {
    minHeight: '100vh', background: 'transparent', color: 'var(--tx)',
    fontFamily: 'var(--font-sans)',
    display: 'flex', flexDirection: 'column', padding: 16, gap: 14,
    maxWidth: 1200, margin: '0 auto',
  },
  topbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontSize: 17, fontWeight: 700 },
  navLink: { fontSize: 11, color: 'var(--tx-3)', textDecoration: 'none', transition: 'color 0.12s' },
  codeBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px',
  },
  codeLabel: { fontSize: 11, color: 'var(--tx-3)', whiteSpace: 'nowrap' },
  code: { fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--teal)', fontFamily: 'monospace', fontFeatureSettings: '"tnum"' },
  smallBtn: { border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', background: 'var(--bg-raised)' },
  selectorLabel: { fontSize: 10, color: 'var(--tx-3)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  select: { background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--tx)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit' },
  dot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  statusText: { fontSize: 13, color: 'var(--tx-2)', whiteSpace: 'nowrap' },
  btn: { border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', minHeight: 38 },
  textInput: { background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--tx)', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' },
  warnBox: { background: '#1c1007', border: '1px solid #92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fcd34d' },
  errorBox: { background: 'var(--error-bg)', border: '1px solid rgba(244,63,94,0.30)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5' },
  // Preparation panel (outer div uses className="smc-prep-panel")
  prepHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 16px', borderBottom: '1px solid var(--others-border)',
  },
  prepTitle: { fontSize: 13, fontWeight: 600, color: 'var(--others)' },
  prepToggle: { marginLeft: 'auto', background: 'var(--surf-1)', border: '1px solid var(--border)', color: 'var(--tx-2)', borderRadius: 8, padding: '4px 11px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  prepBody: { display: 'flex', flexDirection: 'column', gap: 14, padding: 16 },
  fieldRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  botChip: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, letterSpacing: '0.02em' },
  uploadError: { background: 'var(--error-bg)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#fca5a5', marginTop: 4 },
  docList: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  docItem: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' },
  docIcon: { fontSize: 14, flexShrink: 0 },
  docName: { fontSize: 12, color: 'var(--tx)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docSize: { fontSize: 10, color: 'var(--tx-3)', flexShrink: 0 },
  docRemove: { background: 'none', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 },
  // Cockpit panel reorder (Arrange mode)
  cockpit: { display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 },
  arrangeBar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  arrangeBtn: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-raised)', color: 'var(--tx-2)', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  arrangeBtnActive: { border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent-hi)', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  arrangeHint: { fontSize: 11, color: 'var(--tx-3)' },
  arrangeReset: { border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--tx-3)', padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  dragBadge: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent-hi)', background: 'var(--accent-dim)', border: '1px dashed var(--accent)', borderRadius: 8, cursor: 'grab', userSelect: 'none' },
  dragGrip: { fontSize: 14, lineHeight: 1 },
  // Transcript grid (panels use className="smc-transcript-panel me-panel/others-panel")
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1 },
  panel: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', minHeight: 300 },
  panelHead: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  correctionCountBadge: {
    fontSize: 9, fontWeight: 700, color: '#34d399', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  transcript: { flex: 1, overflowY: 'auto', fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 },
  muted: { color: 'var(--tx-2)', fontStyle: 'italic' },
  line: { display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'baseline' },
  lineFlagged: { background: 'rgba(245,158,11,0.18)', borderLeft: '3px solid var(--warn)', borderRadius: 6, paddingLeft: 8, paddingTop: 2, paddingBottom: 2, marginLeft: -8 },
  ts: { fontSize: 10, color: 'var(--tx-3)', flexShrink: 0, fontFeatureSettings: '"tnum"' },
  hint: { fontSize: 10, color: 'var(--tx-3)', cursor: 'help' },
  flagBtn: { background: 'none', border: 'none', fontSize: 17, padding: '0 4px', flexShrink: 0, lineHeight: 1 },
  removeFlagBtn: { background: 'none', border: 'none', color: 'var(--tx-3)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 2px', flexShrink: 0, alignSelf: 'flex-start' },
  clarifiedBadge: {
    fontSize: 9, fontWeight: 700, color: '#34d399', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 5px', marginRight: 5,
    textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle', display: 'inline-block',
  },
  strikethrough: { fontSize: 11, color: 'var(--tx-3)', textDecoration: 'line-through', cursor: 'help', marginLeft: 4 },
  // Coaching panel (outer div uses className="smc-coach-panel")
  coachHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--coach-border)', flexWrap: 'wrap' },
  coachTitle: { fontSize: 15, fontWeight: 700, color: 'var(--coach)' },
  coachTs: { fontSize: 11, color: 'var(--tx-3)' },
  coachBody: { display: 'flex', flexWrap: 'wrap', gap: 0 },
  coachSection: { flex: '1 1 300px', padding: '14px 18px', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  coachSectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
  balanceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  balanceLabel: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 60 },
  balanceBar: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' },
  balanceFill: { height: '100%', background: 'linear-gradient(to right, var(--me), var(--others))', borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' },
  coachList: { margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.7, color: 'var(--tx)' },
  coachItem: { marginBottom: 8 },
  coachNone: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  coachAlignment: { fontSize: 14.5, color: 'var(--warn)', lineHeight: 1.6 },
  coachStack: { display: 'block' },
  coachBlock: { padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  coachBlockSlim: { padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  suggList: { margin: 0, paddingLeft: 22, fontSize: 17, lineHeight: 1.75, color: 'var(--tx)' },
  suggItem: { marginBottom: 12, fontWeight: 500 },
  alignEmbed: { marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.14)' },
  alignLabel: { fontSize: 11, fontWeight: 700, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  alignText: { fontSize: 14.5, color: 'var(--warn)', lineHeight: 1.6 },
  trackBlock: { padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(245,158,11,0.07)' },
  trackBlockAlert: { padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(239,68,68,0.16)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.55)' },
  trackBlockOk: { padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  trackLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, color: 'var(--tx-2)' },
  trackMsg: { fontSize: 16, color: '#fbbf24', lineHeight: 1.6, fontWeight: 600 },
  trackMsgAlert: { fontSize: 21, color: '#fecaca', lineHeight: 1.55, fontWeight: 800 },
  trackOkText: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  repairNote: { marginTop: 8, fontSize: 12, color: '#34d399' },
  // Assist panel (outer div uses className="smc-assist-panel")
  assistHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--assist-border)', flexWrap: 'wrap' },
  assistTitle: { fontSize: 13, fontWeight: 600, color: 'var(--assist)' },
  assistCount: { fontSize: 11, color: 'var(--tx-3)' },
  clearBtn: { border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg-raised)', color: 'var(--tx-2)', padding: '3px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  profileLink: { fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto' },
  assistGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, padding: 14 },
  assistCard: { border: '1px solid', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  assistCardTop: { display: 'flex', alignItems: 'center', gap: 8 },
  assistTypeBadge: { fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 },
  assistLabel: { fontSize: 12, fontWeight: 600, color: 'var(--tx)' },
  assistValue: { fontSize: 13, color: 'var(--tx-2)', wordBreak: 'break-all', background: 'var(--bg-panel)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace' },
  assistMissing: { fontSize: 12, color: 'var(--tx-2)', fontStyle: 'italic' },
  copyBtn: { border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', alignSelf: 'flex-start', background: 'var(--bg-raised)' },
  searchResults: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 },
  searchResult: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' },
  searchResultTitle: { fontSize: 12, color: 'var(--others)', textDecoration: 'none', display: 'block', marginBottom: 2 },
  searchResultSnippet: { fontSize: 11, color: 'var(--tx-2)', lineHeight: 1.4 },
  // Follow-up tracker (outer div uses className="smc-followup-outer")
  followUpHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderBottom: '1px solid var(--followup-border)', flexWrap: 'wrap',
  },
  followUpTitle: { fontSize: 13, fontWeight: 600, color: 'var(--followup)' },
  followUpCount: { fontSize: 11, color: 'var(--tx-3)' },
  followUpGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 },
  followUpPanel: { border: '1px solid var(--border)', borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-panel)' },
  followUpPanelHead: { fontSize: 12, fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' },
  tpItem: { display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid', borderRadius: 8, background: 'var(--me-bg)' },
  refItem: { display: 'flex', gap: 10, padding: '10px 12px', minHeight: 60 },
  tpNumber: {
    fontSize: 11, fontWeight: 700, color: 'var(--followup)', background: 'rgba(74,222,128,0.10)',
    border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 6px', height: 20,
    flexShrink: 0, display: 'flex', alignItems: 'center',
  },
  tpQuote: { fontSize: 13, color: 'var(--tx)', lineHeight: 1.5, fontStyle: 'italic', marginBottom: 4 },
  tpMeta: { fontSize: 10, color: 'var(--tx-3)', marginBottom: 6 },
  tpWorking: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx-2)', fontStyle: 'italic' },
  workingDot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' },
  tpAssist: { fontSize: 13, color: 'var(--me)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 },
  addressBtn: {
    border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg-raised)',
    color: 'var(--tx-3)', padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
  },
  refResult: { background: 'var(--others-bg)', border: '1px solid var(--others-border)', borderRadius: 6, padding: '8px 10px' },
  refTitle: { fontSize: 12, color: 'var(--others)', textDecoration: 'none', display: 'block', marginBottom: 2, wordBreak: 'break-word' },
  refSnippet: { fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.4 },
  researchLink: { fontSize: 11, color: 'var(--others)', textDecoration: 'none', border: '1px solid var(--others-border)', borderRadius: 6, padding: '2px 8px', background: 'var(--others-bg)' },
  foot: { fontSize: 11, color: 'var(--tx-3)', textAlign: 'center' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modalCard: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14 },
  modalTitle: { fontSize: 15, fontWeight: 700, color: 'var(--tx)' },
  modalBody: { fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.6 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
};
