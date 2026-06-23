'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
const CHUNK_MS = 2500;
const MAX_RECONNECTS = 5;
const COACH_INTERVAL_MS = 25000;
const COACH_MIN_SEGMENTS = 3;
const FLAG_POLL_INTERVAL_MS = 30000;
const ASSIST_DEDUP_KEY = (card) => `${card.type}:${card.label}:${card.value}`;

const MODE_LANG = { english: 'en', 'hindi-urdu': 'hi', auto: null };
const MODE_LABEL = { english: 'English (fast)', 'hindi-urdu': 'Hindi / Urdu', auto: 'Auto-detect' };

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

export default function SessionPage() {
  const [sessionCode, setSessionCode] = useState('');
  const [mode, setMode] = useState('english');
  const [objective, setObjective] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [status, setStatus] = useState('idle');
  const [meLines, setMeLines] = useState([]);
  const [othersLines, setOthersLines] = useState([]);
  const [coaching, setCoaching] = useState(null);
  const [assistCards, setAssistCards] = useState([]);
  const [copiedAssist, setCopiedAssist] = useState(null);
  const [flaggedItems, setFlaggedItems] = useState([]); // [{id,text,speaker,ts,status,assist_text,references,addressed}]
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deepgramAvailable, setDeepgramAvailable] = useState(null);

  const wsRef = useRef(null);
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
  const contextNotesRef = useRef('');
  const profileRef = useRef(null);
  const seenAssistKeys = useRef(new Set());
  const flaggedItemsRef = useRef([]);

  useEffect(() => { meLinesRef.current = meLines; }, [meLines]);
  useEffect(() => { othersLinesRef.current = othersLines; }, [othersLines]);
  useEffect(() => { objectiveRef.current = objective; }, [objective]);
  useEffect(() => { contextNotesRef.current = contextNotes; }, [contextNotes]);
  useEffect(() => { flaggedItemsRef.current = flaggedItems; }, [flaggedItems]);

  const meScrollRef = useRef(null);
  const otScrollRef = useRef(null);
  useEffect(() => { meScrollRef.current?.scrollTo(0, meScrollRef.current.scrollHeight); }, [meLines]);
  useEffect(() => { otScrollRef.current?.scrollTo(0, otScrollRef.current.scrollHeight); }, [othersLines]);

  // On mount: set session code from URL or generate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('s');
    const code = urlCode || generateShortCode();
    setSessionCode(code);
    if (!urlCode) {
      const u = new URL(window.location.href);
      u.searchParams.set('s', code);
      history.replaceState({}, '', u);
    }
  }, []);

  // On mount: check Deepgram availability
  useEffect(() => {
    fetch(`${ENGINE_URL}/health`)
      .then(r => r.json())
      .then(d => setDeepgramAvailable(!!d.deepgramAvailable))
      .catch(() => setDeepgramAvailable(false));
  }, []);

  // On mount: fetch operator profile
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => { if (d.profile) profileRef.current = d.profile; })
      .catch(() => {});
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
      try {
        const res = await fetch(`${ENGINE_URL}/coach`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            me,
            others,
            objective: objectiveRef.current,
            profile: profileRef.current,
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
        }
      } catch (_) {}
    };

    pollCoach();
    const timer = setInterval(pollCoach, COACH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flagged items polling — every 30s while live or stopped, only when there are items pending
  useEffect(() => {
    if (status !== 'live' && status !== 'stopped') return;
    if (!meetingIdRef.current) return;

    const poll = async () => {
      const current = flaggedItemsRef.current;
      const hasPending = current.some(f => f.status === 'pending' || f.status === 'processing');
      if (!hasPending && current.length > 0) return; // all enriched, no need to poll

      try {
        const res = await fetch(`/api/flagged-items?meetingId=${meetingIdRef.current}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setFlaggedItems(prev => {
            // Merge DB state into local state preserving local UI ordering
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
      // Update optimistic item with real ID
      setFlaggedItems(prev =>
        prev.map(f => f === optimisticItem ? { ...f, id: itemId, status: 'processing' } : f)
      );

      // Mark line as flagged in transcript
      if (speaker === 'me') {
        setMeLines(prev => prev.map(l => l.ts === ts && l.cleaned === text ? { ...l, flagged: true } : l));
      } else {
        setOthersLines(prev => prev.map(l => l.ts === ts && (l.cleaned === text || l.corrected === text) ? { ...l, flagged: true } : l));
      }

      // Fire-and-forget enrichment (runs on secondary pipeline — does NOT block transcript)
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

  // Mark a flagged item as addressed (or un-address it)
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

  const startSession = useCallback(async () => {
    if (!sessionCode) return;

    if (mode === 'hindi-urdu' && deepgramAvailable === false) {
      setError(
        'Hindi / Urdu mode is not available — the multilingual engine key has not been configured. ' +
        'Select English (fast) to continue.'
      );
      return;
    }

    intentionalStop.current = false;
    reconnectCount.current = 0;
    updateStatus('connecting');
    setError('');
    setMeLines([]);
    setOthersLines([]);
    setCoaching(null);
    setAssistCards([]);
    setFlaggedItems([]);
    seenAssistKeys.current = new Set();

    try {
      const meetingRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Session ${sessionCode}`,
          objective: objective || null,
          language_mode: mode,
          context_notes: contextNotes || null,
        }),
      });
      if (meetingRes.ok) {
        const meetingData = await meetingRes.json();
        meetingIdRef.current = meetingData.id;
      }
    } catch (_) {
      meetingIdRef.current = null;
    }

    function openWs(code, sessionMode) {
      return new Promise((resolve, reject) => {
        if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
          try { wsRef.current.close(); } catch (_) {}
        }

        const qs = new URLSearchParams({ mode: sessionMode });
        const langHint = MODE_LANG[sessionMode];
        if (langHint) qs.set('lang', langHint);
        const wsUrl = ENGINE_URL.replace(/^http/, 'ws') + `/session/${code}/ws?${qs}`;
        const ws = new WebSocket(wsUrl);
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

          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === 'transcript' && msg.raw) {
                if (msg.speaker === 'others') {
                  const line = {
                    raw: msg.raw,
                    cleaned: msg.cleaned || msg.raw,
                    ts: new Date().toLocaleTimeString(),
                    segmentId: null,
                    corrected: null,
                    clarifiedByMe: false,
                    flagged: false,
                  };
                  setOthersLines(p => [...p.slice(-200), line]);

                  if (meetingIdRef.current) {
                    const mId = meetingIdRef.current;
                    fetch(`/api/meetings/${mId}/segments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        speaker: 'others',
                        raw: msg.raw,
                        cleaned: line.cleaned,
                        lang: MODE_LANG[sessionMode] || null,
                      }),
                    })
                      .then(r => r.json())
                      .then(d => {
                        if (d.segmentId) {
                          setOthersLines(prev =>
                            prev.map(l => l === line ? { ...l, segmentId: d.segmentId } : l)
                          );
                        }
                      })
                      .catch(() => {});
                  }
                } else {
                  const line = {
                    raw: msg.raw,
                    cleaned: msg.cleaned || msg.raw,
                    ts: new Date().toLocaleTimeString(),
                    flagged: false,
                  };
                  setMeLines(p => [...p.slice(-200), line]);
                  if (meetingIdRef.current) {
                    const mId = meetingIdRef.current;
                    fetch(`/api/meetings/${mId}/segments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        speaker: 'me',
                        raw: msg.raw,
                        cleaned: msg.cleaned || msg.raw,
                        lang: MODE_LANG[sessionMode] || null,
                      }),
                    }).catch(() => {});
                  }
                }
              } else if (msg.type === 'error' && msg.code === 'deepgram_unavailable') {
                setError(
                  'Hindi / Urdu mode is not enabled on this server. Stop, switch to English, and try again.'
                );
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
              if (!intentionalStop.current) openWs(code, sessionMode).catch(() => {});
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
      await openWs(sessionCode, mode);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = async (evt) => {
        if (!evt.data || evt.data.size < 100) return;
        const buf = await evt.data.arrayBuffer();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(encodeChunk('me', buf));
        }
      };
      recorder.start(CHUNK_MS);
      updateStatus('live');
    } catch (err) {
      setError(String(err));
      updateStatus('error');
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      wsRef.current = null; recorderRef.current = null; streamRef.current = null;
    }
  }, [sessionCode, mode, objective, contextNotes, deepgramAvailable, updateStatus]);

  const stopSession = useCallback(() => {
    intentionalStop.current = true;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
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
  }, [updateStatus]);

  const copyLink = useCallback(() => {
    if (!sessionCode) return;
    const u = new URL(window.location.href);
    u.searchParams.set('s', sessionCode);
    navigator.clipboard.writeText(u.toString()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [sessionCode]);

  const copyAssistCard = useCallback((card) => {
    const key = ASSIST_DEDUP_KEY(card);
    const textToCopy = card.value || card.query || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedAssist(key); setTimeout(() => setCopiedAssist(null), 2000);
    }).catch(() => {});
  }, []);

  const isLive = status === 'live';
  const isConnecting = status === 'connecting';
  const deepgramBlocked = mode === 'hindi-urdu' && deepgramAvailable === false;
  const canStart = !isLive && !isConnecting && !deepgramBlocked;
  const correctionCount = coaching?.corrections?.length ?? 0;
  const activeFlaggedItems = flaggedItems.filter(f => !f.addressed);
  const addressedCount = flaggedItems.filter(f => f.addressed).length;
  const showFollowUp = (isLive || status === 'stopped') && flaggedItems.length > 0;

  return (
    <>
      <style>{`
        @media (max-width: 760px) {
          .smc-grid { grid-template-columns: 1fr !important; }
          .smc-toprow { flex-direction: column; align-items: flex-start !important; }
          .smc-controls { flex-wrap: wrap; }
          .smc-followup { grid-template-columns: 1fr !important; }
        }
        * { box-sizing: border-box; }
        .smc-flag-btn { opacity: 0.25; transition: opacity 0.15s; }
        .smc-flag-btn:hover { opacity: 1 !important; }
        .smc-flag-btn.flagged { opacity: 1 !important; }
      `}</style>
      <div style={styles.root}>

        {/* Top bar */}
        <div className="smc-toprow" style={styles.topbar}>
          <div>
            <div style={styles.brand}>Silent Meeting Copilot</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <a href="/" style={styles.navLink}>&larr; Home</a>
              <a href="/meetings" style={styles.navLink}>Past meetings</a>
            </div>
          </div>

          <div style={styles.codeBox}>
            <span style={styles.codeLabel}>Session&nbsp;code</span>
            <code style={styles.code}>{sessionCode || '…'}</code>
            <button
              onClick={copyLink}
              style={{ ...styles.smallBtn, background: copied ? '#166534' : '#2a2f37' }}
              title="Copy shareable session link"
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>

          <div className="smc-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={styles.selectorLabel}>Meeting language</span>
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                style={{ ...styles.select, borderColor: deepgramBlocked ? '#92400e' : '#2a2f37' }}
                disabled={isLive || isConnecting}
              >
                <option value="english">English (fast)</option>
                <option value="hindi-urdu">Hindi / Urdu (multilingual)</option>
                <option value="auto">Auto-detect</option>
              </select>
            </div>

            <span style={{ ...styles.dot, background: isLive ? '#22c55e' : isConnecting ? '#facc15' : '#6b7280' }} />
            <span style={styles.statusText}>
              {isLive ? `Live — ${MODE_LABEL[mode] || mode}`
                : isConnecting ? 'Connecting…'
                : status === 'stopped' ? 'Stopped'
                : 'Ready'}
            </span>

            {canStart && (
              <button onClick={startSession} style={{ ...styles.btn, background: '#2AB49F', minWidth: 120 }} disabled={!sessionCode}>
                Start Session
              </button>
            )}
            {deepgramBlocked && !isLive && !isConnecting && (
              <button style={{ ...styles.btn, background: '#4b5563', minWidth: 120, cursor: 'not-allowed' }} disabled>
                Start Session
              </button>
            )}
            {(isLive || isConnecting) && (
              <button onClick={stopSession} style={{ ...styles.btn, background: '#ef4444', minWidth: 80 }}>Stop</button>
            )}
          </div>
        </div>

        {/* Pre-session inputs: objective + context notes */}
        {!isLive && !isConnecting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={styles.objectiveRow}>
              <label style={styles.selectorLabel} htmlFor="objective">
                Meeting objective (optional — enables coaching alignment notes)
              </label>
              <input
                id="objective"
                type="text"
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="e.g. Agree on project timeline and assign owners"
                style={styles.objectiveInput}
                maxLength={200}
              />
            </div>
            <div style={styles.objectiveRow}>
              <label style={styles.selectorLabel} htmlFor="context-notes">
                Meeting context / agenda (optional — used when enriching flagged talking points)
              </label>
              <textarea
                id="context-notes"
                value={contextNotes}
                onChange={e => setContextNotes(e.target.value)}
                placeholder="e.g. Quarterly review with client X. They are evaluating switching fleet to EV. We offer EV fleet advisory."
                style={{ ...styles.objectiveInput, minHeight: 68, resize: 'vertical', fontFamily: 'inherit' }}
                maxLength={1000}
              />
            </div>
          </div>
        )}

        {deepgramBlocked && (
          <div style={styles.warnBox}>
            <strong>Hindi / Urdu mode is not currently enabled.</strong> Switch to{' '}
            <strong>English (fast)</strong> to continue.
          </div>
        )}
        {mode === 'hindi-urdu' && deepgramAvailable === null && (
          <div style={{ ...styles.warnBox, borderColor: '#1e3a5f', background: '#0c1f33', color: '#93c5fd' }}>
            Checking whether multilingual mode is available…
          </div>
        )}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Transcript panels */}
        <div className="smc-grid" style={styles.grid}>
          {/* ME panel */}
          <div style={{ ...styles.panel, borderColor: '#22c55e' }}>
            <div style={{ ...styles.panelHead, color: '#22c55e' }}>ME — microphone</div>
            <div ref={meScrollRef} style={styles.transcript}>
              {meLines.length === 0 && <span style={styles.muted}>Your speech will appear here…</span>}
              {meLines.map((l, i) => (
                <div key={i} style={styles.line}>
                  <span style={styles.ts}>{l.ts}</span>
                  <span style={{ flex: 1 }}>{l.cleaned}</span>
                  {l.raw !== l.cleaned && (
                    <span style={styles.hint} title={l.raw}> [raw differs]</span>
                  )}
                  {isLive && meetingIdRef.current && (
                    <button
                      className={`smc-flag-btn${l.flagged ? ' flagged' : ''}`}
                      onClick={() => !l.flagged && flagItem(l.cleaned, 'me', l.ts, null)}
                      style={{
                        ...styles.flagBtn,
                        color: l.flagged ? '#f59e0b' : '#9aa0a6',
                        cursor: l.flagged ? 'default' : 'pointer',
                      }}
                      title={l.flagged ? 'Flagged for follow-up' : 'Flag this for follow-up'}
                    >
                      {l.flagged ? '⚑' : '⚐'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* OTHERS panel */}
          <div style={{ ...styles.panel, borderColor: '#38bdf8' }}>
            <div style={{ ...styles.panelHead, color: '#38bdf8' }}>
              OTHERS — system audio
              {correctionCount > 0 && (
                <span style={styles.correctionCountBadge}>{correctionCount} clarified</span>
              )}
            </div>
            <div ref={otScrollRef} style={styles.transcript}>
              {othersLines.length === 0 && (
                <span style={styles.muted}>
                  Others&apos; speech appears here via the desktop helper.<br />
                  Share code <strong style={{ color: '#2AB49F' }}>{sessionCode || '…'}</strong> or use Copy link above.
                </span>
              )}
              {othersLines.map((l, i) => (
                <div key={i} style={styles.line}>
                  <span style={styles.ts}>{l.ts}</span>
                  {l.clarifiedByMe ? (
                    <span style={{ flex: 1 }}>
                      <span style={styles.clarifiedBadge}>clarified</span>
                      <span style={{ color: '#86efac' }}>{l.corrected}</span>
                      <span style={styles.strikethrough} title={`Original: ${l.cleaned}`}>{' '}{l.cleaned}</span>
                    </span>
                  ) : (
                    <span style={{ flex: 1 }}>{l.cleaned}</span>
                  )}
                  {isLive && meetingIdRef.current && (
                    <button
                      className={`smc-flag-btn${l.flagged ? ' flagged' : ''}`}
                      onClick={() => !l.flagged && flagItem(l.corrected || l.cleaned, 'others', l.ts, l.segmentId)}
                      style={{
                        ...styles.flagBtn,
                        color: l.flagged ? '#f59e0b' : '#9aa0a6',
                        cursor: l.flagged ? 'default' : 'pointer',
                      }}
                      title={l.flagged ? 'Flagged for follow-up' : 'Flag this for follow-up'}
                    >
                      {l.flagged ? '⚑' : '⚐'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coaching panel */}
        {(isLive || status === 'stopped') && (
          <div style={styles.coachPanel}>
            <div style={styles.coachHeader}>
              <span style={styles.coachTitle}>Coaching</span>
              {coaching?.updatedAt && <span style={styles.coachTs}>Updated {coaching.updatedAt}</span>}
              {isLive && !coaching && <span style={styles.coachTs}>First update in ~{COACH_MIN_SEGMENTS} segments…</span>}
            </div>
            {coaching ? (
              <div style={styles.coachBody}>
                <div style={styles.coachSection}>
                  <div style={styles.coachSectionLabel}>Talk balance</div>
                  <div style={styles.balanceRow}>
                    <span style={{ ...styles.balanceLabel, color: '#22c55e' }}>You {coaching.talkBalance?.mePercent ?? 50}%</span>
                    <div style={styles.balanceBar}>
                      <div style={{ ...styles.balanceFill, width: `${coaching.talkBalance?.mePercent ?? 50}%` }} />
                    </div>
                    <span style={{ ...styles.balanceLabel, color: '#38bdf8' }}>Others {coaching.talkBalance?.othersPercent ?? 50}%</span>
                  </div>
                </div>
                {correctionCount > 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>Transcript repairs</div>
                    <div style={{ fontSize: 12, color: '#34d399', lineHeight: 1.5 }}>
                      {correctionCount} OTHERS turn{correctionCount !== 1 ? 's' : ''} auto-corrected from your restatements.
                    </div>
                  </div>
                )}
                {coaching.openItems?.length > 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>Open items from others</div>
                    <ul style={styles.coachList}>
                      {coaching.openItems.map((item, i) => <li key={i} style={styles.coachItem}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {coaching.openItems?.length === 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>Open items from others</div>
                    <div style={styles.coachNone}>None detected</div>
                  </div>
                )}
                {coaching.suggestions?.length > 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>Suggested responses</div>
                    <ul style={styles.coachList}>
                      {coaching.suggestions.map((s, i) => (
                        <li key={i} style={{ ...styles.coachItem, color: '#fde68a' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {coaching.alignment && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>Objective alignment</div>
                    <div style={styles.coachAlignment}>{coaching.alignment}</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px 16px', color: '#9aa0a6', fontSize: 13 }}>
                {isLive ? 'Coaching will appear after a few transcript segments.' : 'No coaching data for this session.'}
              </div>
            )}
          </div>
        )}

        {/* Assist panel */}
        {(isLive || status === 'stopped') && (
          <div style={styles.assistPanel}>
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
        )}

        {/* Follow-up Tracker — two panels: Talking Points + References */}
        {showFollowUp && (
          <div style={styles.followUpSection}>
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
              {/* Left: Talking Points */}
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
                        <div style={styles.tpQuote}>
                          &ldquo;{item.text}&rdquo;
                        </div>
                        <div style={styles.tpMeta}>
                          {item.speaker === 'others' ? 'OTHERS' : 'ME'} &middot; {item.ts}
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
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: References */}
              <div style={{ ...styles.followUpPanel, borderColor: '#1e3a5f' }}>
                <div style={{ ...styles.followUpPanelHead, color: '#60a5fa' }}>References</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {flaggedItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        ...styles.refItem,
                        opacity: item.addressed ? 0.45 : 1,
                      }}
                    >
                      <div style={styles.tpNumber}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        {item.status === 'pending' || item.status === 'processing' ? (
                          <div style={styles.tpWorking}>
                            <span style={styles.workingDot} />
                            Looking up references…
                          </div>
                        ) : item.references && item.references.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {item.references.map((r, ri) => (
                              <div key={ri} style={styles.refResult}>
                                <a href={r.url} target="_blank" rel="noreferrer" style={styles.refTitle}>{r.title}</a>
                                {r.snippet && <div style={styles.refSnippet}>{r.snippet}</div>}
                              </div>
                            ))}
                          </div>
                        ) : item.status === 'enriched' || item.status === 'addressed' ? (
                          <div style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>
                            No references found. Try:{' '}
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(item.text.slice(0, 60))}`}
                              target="_blank" rel="noreferrer"
                              style={{ color: '#60a5fa' }}
                            >
                              Search Google
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={styles.foot}>
          Engine: {ENGINE_URL}&nbsp;&middot;&nbsp;WS:&nbsp;
          <span style={{ color: wsConnected ? '#22c55e' : '#9aa0a6' }}>{wsConnected ? 'connected' : 'disconnected'}</span>
          {isLive && <>&nbsp;&middot;&nbsp;<span style={{ color: '#2AB49F' }}>{MODE_LABEL[mode]}</span></>}
          {meetingIdRef.current && <>&nbsp;&middot;&nbsp;<span style={{ color: '#9aa0a6' }}>recording</span></>}
        </div>
      </div>
    </>
  );
}

const styles = {
  root: {
    minHeight: '100vh', background: '#0f1115', color: '#e6e8eb',
    fontFamily: '"Segoe UI",system-ui,-apple-system,sans-serif',
    display: 'flex', flexDirection: 'column', padding: 16, gap: 14,
    maxWidth: 1200, margin: '0 auto',
  },
  topbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontSize: 18, fontWeight: 600 },
  navLink: { fontSize: 11, color: '#9aa0a6', textDecoration: 'none' },
  codeBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#1a1d24', border: '1px solid #2a2f37', borderRadius: 8, padding: '6px 12px',
  },
  codeLabel: { fontSize: 11, color: '#9aa0a6', whiteSpace: 'nowrap' },
  code: { fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', color: '#2AB49F', fontFamily: 'monospace' },
  smallBtn: { border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  selectorLabel: { fontSize: 10, color: '#9aa0a6', letterSpacing: '0.04em', textTransform: 'uppercase' },
  select: { background: '#1a1d24', border: '1px solid #2a2f37', color: '#e6e8eb', borderRadius: 6, padding: '6px 10px', fontSize: 12 },
  dot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  statusText: { fontSize: 13, color: '#9aa0a6', whiteSpace: 'nowrap' },
  btn: { border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' },
  objectiveRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  objectiveInput: { background: '#1a1d24', border: '1px solid #2a2f37', color: '#e6e8eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none' },
  warnBox: { background: '#1c1007', border: '1px solid #92400e', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fcd34d' },
  errorBox: { background: '#2d1010', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fca5a5' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1 },
  panel: { background: '#171a21', border: '1px solid', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', minHeight: 300 },
  panelHead: { fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  correctionCountBadge: {
    fontSize: 9, fontWeight: 700, color: '#34d399', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  transcript: { flex: 1, overflowY: 'auto', fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 },
  muted: { color: '#9aa0a6', fontStyle: 'italic' },
  line: { display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'baseline' },
  ts: { fontSize: 10, color: '#9aa0a6', flexShrink: 0 },
  hint: { fontSize: 10, color: '#9aa0a6', cursor: 'help' },
  flagBtn: { background: 'none', border: 'none', fontSize: 14, padding: '0 2px', flexShrink: 0, lineHeight: 1 },
  clarifiedBadge: {
    fontSize: 9, fontWeight: 700, color: '#34d399', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 5px', marginRight: 5,
    textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle', display: 'inline-block',
  },
  strikethrough: { fontSize: 11, color: '#6b7280', textDecoration: 'line-through', cursor: 'help', marginLeft: 4 },
  // Coaching panel
  coachPanel: { background: '#13111c', border: '1px solid #3b2f6e', borderRadius: 12 },
  coachHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #3b2f6e' },
  coachTitle: { fontSize: 13, fontWeight: 600, color: '#a78bfa' },
  coachTs: { fontSize: 11, color: '#6b7280' },
  coachBody: { display: 'flex', flexWrap: 'wrap', gap: 0 },
  coachSection: { flex: '1 1 220px', padding: '12px 16px', borderRight: '1px solid #1f1a30', borderBottom: '1px solid #1f1a30' },
  coachSectionLabel: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  balanceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  balanceLabel: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 60 },
  balanceBar: { flex: 1, height: 8, background: '#2a2f37', borderRadius: 4, overflow: 'hidden' },
  balanceFill: { height: '100%', background: 'linear-gradient(to right, #22c55e, #38bdf8)', borderRadius: 4, transition: 'width 0.6s ease' },
  coachList: { margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: '#d1d5db' },
  coachItem: { marginBottom: 4 },
  coachNone: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  coachAlignment: { fontSize: 13, color: '#fbbf24', lineHeight: 1.5 },
  // Assist panel
  assistPanel: { background: '#0d1117', border: '1px solid #854d0e', borderRadius: 12 },
  assistHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #292116', flexWrap: 'wrap' },
  assistTitle: { fontSize: 13, fontWeight: 600, color: '#fbbf24' },
  assistCount: { fontSize: 11, color: '#6b7280' },
  clearBtn: { border: '1px solid #374151', borderRadius: 5, background: '#1f2937', color: '#9aa0a6', padding: '3px 9px', fontSize: 11, cursor: 'pointer' },
  profileLink: { fontSize: 11, color: '#a78bfa', textDecoration: 'none', marginLeft: 'auto' },
  assistGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, padding: 14 },
  assistCard: { border: '1px solid', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  assistCardTop: { display: 'flex', alignItems: 'center', gap: 8 },
  assistTypeBadge: { fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 },
  assistLabel: { fontSize: 12, fontWeight: 600, color: '#e6e8eb' },
  assistValue: { fontSize: 13, color: '#d1d5db', wordBreak: 'break-all', background: '#161b22', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace' },
  assistMissing: { fontSize: 12, color: '#9aa0a6', fontStyle: 'italic' },
  copyBtn: { border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' },
  searchResults: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 },
  searchResult: { background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px' },
  searchResultTitle: { fontSize: 12, color: '#58a6ff', textDecoration: 'none', display: 'block', marginBottom: 2 },
  searchResultSnippet: { fontSize: 11, color: '#8b949e', lineHeight: 1.4 },
  // Follow-up tracker
  followUpSection: { background: '#0b1017', border: '1px solid #1e3a2b', borderRadius: 12, overflow: 'hidden' },
  followUpHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderBottom: '1px solid #1e3a2b', flexWrap: 'wrap',
  },
  followUpTitle: { fontSize: 13, fontWeight: 600, color: '#4ade80' },
  followUpCount: { fontSize: 11, color: '#6b7280' },
  followUpGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 },
  followUpPanel: { border: '1px solid', borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: '#0d1117' },
  followUpPanelHead: { fontSize: 12, fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' },
  tpItem: { display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid', borderRadius: 8, background: '#111a14' },
  refItem: { display: 'flex', gap: 10, padding: '10px 12px', minHeight: 60 },
  tpNumber: {
    fontSize: 11, fontWeight: 700, color: '#4ade80', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 6px', height: 20,
    flexShrink: 0, display: 'flex', alignItems: 'center',
  },
  tpQuote: { fontSize: 13, color: '#d1d5db', lineHeight: 1.5, fontStyle: 'italic', marginBottom: 4 },
  tpMeta: { fontSize: 10, color: '#6b7280', marginBottom: 6 },
  tpWorking: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9aa0a6', fontStyle: 'italic' },
  workingDot: {
    width: 7, height: 7, borderRadius: '50%', background: '#f59e0b',
    display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite',
  },
  tpAssist: { fontSize: 13, color: '#86efac', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 },
  addressBtn: {
    border: '1px solid #1f2937', borderRadius: 5, background: '#1a2028',
    color: '#6b7280', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
  },
  refResult: { background: '#0d1117', border: '1px solid #1e3a5f', borderRadius: 6, padding: '8px 10px' },
  refTitle: { fontSize: 12, color: '#60a5fa', textDecoration: 'none', display: 'block', marginBottom: 2, wordBreak: 'break-word' },
  refSnippet: { fontSize: 11, color: '#6b7280', lineHeight: 1.4 },
  foot: { fontSize: 11, color: '#9aa0a6', textAlign: 'center' },
};
