'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
const CHUNK_MS = 2500;
const MAX_RECONNECTS = 5;

// Language hint sent alongside each mode
const MODE_LANG = { english: 'en', 'hindi-urdu': 'hi', auto: null };

// Display labels for mode badges
const MODE_LABEL = { english: 'English (fast)', 'hindi-urdu': 'Hindi / Urdu', auto: 'Auto-detect' };

// Short human-readable code: 3 letters + 4 digits, e.g. "drk-8421"
function generateShortCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz';
  const letters = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${letters}-${digits}`;
}

// Encode audio chunk: first byte = speaker (0=me, 1=others), rest = audio
function encodeChunk(speaker, audioBuffer) {
  const out = new Uint8Array(1 + audioBuffer.byteLength);
  out[0] = speaker === 'others' ? 1 : 0;
  out.set(new Uint8Array(audioBuffer), 1);
  return out.buffer;
}

export default function SessionPage() {
  // Session code starts empty to avoid SSR hydration mismatch; set in useEffect
  const [sessionCode, setSessionCode] = useState('');
  const [mode, setMode] = useState('english'); // 'english' | 'hindi-urdu' | 'auto'
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error | stopped
  const [meLines, setMeLines] = useState([]);
  const [othersLines, setOthersLines] = useState([]);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deepgramAvailable, setDeepgramAvailable] = useState(null); // null=checking, true/false

  // Mutable refs — stable across renders, safe to use inside WS callbacks
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const intentionalStop = useRef(false);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef(null);
  const liveStatus = useRef('idle'); // mirror of status for stale-closure-safe reads

  // Transcript auto-scroll
  const meScrollRef = useRef(null);
  const otScrollRef = useRef(null);
  useEffect(() => { meScrollRef.current?.scrollTo(0, meScrollRef.current.scrollHeight); }, [meLines]);
  useEffect(() => { otScrollRef.current?.scrollTo(0, otScrollRef.current.scrollHeight); }, [othersLines]);

  // On mount: read ?s= from URL or generate a new code and write it to URL
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

  // On mount: check whether the engine has Deepgram configured
  useEffect(() => {
    fetch(`${ENGINE_URL}/health`)
      .then(r => r.json())
      .then(d => setDeepgramAvailable(!!d.deepgramAvailable))
      .catch(() => setDeepgramAvailable(false)); // treat network error as unavailable
  }, []);

  // Keep URL in sync if sessionCode changes
  useEffect(() => {
    if (!sessionCode) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('s') !== sessionCode) {
      u.searchParams.set('s', sessionCode);
      history.replaceState({}, '', u);
    }
  }, [sessionCode]);

  const updateStatus = useCallback((s) => {
    liveStatus.current = s;
    setStatus(s);
  }, []);

  const startSession = useCallback(async () => {
    if (!sessionCode) return;

    // Block Hindi/Urdu when Deepgram key is not configured — never silently fall back
    if (mode === 'hindi-urdu' && deepgramAvailable === false) {
      setError(
        'Hindi / Urdu mode is not available — the multilingual engine key has not been configured on this server. ' +
        'Select English (fast) to continue, or contact the administrator to enable multilingual mode.'
      );
      return;
    }

    intentionalStop.current = false;
    reconnectCount.current = 0;
    updateStatus('connecting');
    setError('');
    setMeLines([]);
    setOthersLines([]);

    // openWs is defined here so its closure captures sessionCode and mode at call time.
    // Defined as a named function so it can call itself recursively for reconnect.
    function openWs(code, sessionMode) {
      return new Promise((resolve, reject) => {
        // Close any existing WS
        if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
          try { wsRef.current.close(); } catch (_) {}
        }

        // Build query string: always include mode; add lang hint when known
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

          // Set persistent handlers now that connection is open
          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === 'transcript' && msg.raw) {
                const line = { raw: msg.raw, cleaned: msg.cleaned || msg.raw, ts: new Date().toLocaleTimeString() };
                if (msg.speaker === 'others') {
                  setOthersLines(p => [...p.slice(-200), line]);
                } else {
                  setMeLines(p => [...p.slice(-200), line]);
                }
              } else if (msg.type === 'error' && msg.code === 'deepgram_unavailable') {
                // Engine confirms Deepgram key is missing — show the real reason
                setError(
                  'Hindi / Urdu mode is not enabled on this server. ' +
                  'Audio was received but not transcribed. Stop this session, switch to English mode, and try again.'
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
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error('WebSocket connection failed'));
          }
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
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg;codecs=opus';

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
      wsRef.current = null;
      recorderRef.current = null;
      streamRef.current = null;
    }
  }, [sessionCode, mode, deepgramAvailable, updateStatus]);

  const stopSession = useCallback(() => {
    intentionalStop.current = true;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      try { wsRef.current.close(); } catch (_) {}
    }
    wsRef.current = null;
    recorderRef.current = null;
    streamRef.current = null;
    updateStatus('stopped');
    setWsConnected(false);
  }, [updateStatus]);

  const copyLink = useCallback(() => {
    if (!sessionCode) return;
    const u = new URL(window.location.href);
    u.searchParams.set('s', sessionCode);
    navigator.clipboard.writeText(u.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [sessionCode]);

  const isLive = status === 'live';
  const isConnecting = status === 'connecting';
  const deepgramBlocked = mode === 'hindi-urdu' && deepgramAvailable === false;
  const canStart = !isLive && !isConnecting && !deepgramBlocked;

  return (
    <>
      <style>{`
        @media (max-width: 760px) {
          .smc-grid { grid-template-columns: 1fr !important; }
          .smc-toprow { flex-direction: column; align-items: flex-start !important; }
          .smc-controls { flex-wrap: wrap; }
        }
        * { box-sizing: border-box; }
      `}</style>
      <div style={styles.root}>

        {/* Top bar */}
        <div className="smc-toprow" style={styles.topbar}>
          <div>
            <div style={styles.brand}>Silent Meeting Copilot</div>
            <a href="/" style={{ fontSize: 11, color: '#9aa0a6', textDecoration: 'none' }}>
              &larr; Home
            </a>
          </div>

          {/* Session code box */}
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

          {/* Controls */}
          <div className="smc-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            {/* Meeting language selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={styles.selectorLabel}>Meeting language</span>
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                style={{
                  ...styles.select,
                  borderColor: deepgramBlocked ? '#92400e' : '#2a2f37',
                }}
                disabled={isLive || isConnecting}
                title="Select the language for this meeting"
              >
                <option value="english">English (fast)</option>
                <option value="hindi-urdu">Hindi / Urdu (multilingual)</option>
                <option value="auto">Auto-detect</option>
              </select>
            </div>

            {/* Status dot + label */}
            <span style={{ ...styles.dot, background: isLive ? '#22c55e' : isConnecting ? '#facc15' : '#6b7280' }} />
            <span style={styles.statusText}>
              {isLive
                ? `Live — ${MODE_LABEL[mode] || mode}`
                : isConnecting
                ? 'Connecting…'
                : status === 'stopped'
                ? 'Stopped'
                : 'Ready'}
            </span>

            {canStart && (
              <button
                onClick={startSession}
                style={{ ...styles.btn, background: '#2AB49F', minWidth: 120 }}
                disabled={!sessionCode}
              >
                Start Session
              </button>
            )}
            {/* Show Start disabled with reason when blocked */}
            {deepgramBlocked && !isLive && !isConnecting && (
              <button style={{ ...styles.btn, background: '#4b5563', minWidth: 120, cursor: 'not-allowed' }} disabled>
                Start Session
              </button>
            )}
            {(isLive || isConnecting) && (
              <button onClick={stopSession} style={{ ...styles.btn, background: '#ef4444', minWidth: 80 }}>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Deepgram unavailable warning — shown when Hindi/Urdu selected but key not configured */}
        {deepgramBlocked && (
          <div style={styles.warnBox}>
            <strong>Hindi / Urdu mode is not currently enabled.</strong> The multilingual engine key has not been
            configured on this server. Sessions cannot start in this mode. Switch to{' '}
            <strong>English (fast)</strong> to continue, or contact the administrator to enable multilingual mode.
          </div>
        )}

        {/* Deepgram availability checking notice */}
        {mode === 'hindi-urdu' && deepgramAvailable === null && (
          <div style={{ ...styles.warnBox, borderColor: '#1e3a5f', background: '#0c1f33', color: '#93c5fd' }}>
            Checking whether multilingual mode is available on this server…
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Transcript panels */}
        <div className="smc-grid" style={styles.grid}>
          <div style={{ ...styles.panel, borderColor: '#22c55e' }}>
            <div style={{ ...styles.panelHead, color: '#22c55e' }}>ME — microphone</div>
            <div ref={meScrollRef} style={styles.transcript}>
              {meLines.length === 0 && (
                <span style={styles.muted}>Your speech will appear here…</span>
              )}
              {meLines.map((l, i) => (
                <div key={i} style={styles.line}>
                  <span style={styles.ts}>{l.ts}</span>
                  <span>{l.cleaned}</span>
                  {l.raw !== l.cleaned && (
                    <span style={styles.hint} title={l.raw}> [raw differs]</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...styles.panel, borderColor: '#38bdf8' }}>
            <div style={{ ...styles.panelHead, color: '#38bdf8' }}>OTHERS — system audio</div>
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
                  <span>{l.cleaned}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.foot}>
          Engine: {ENGINE_URL}&nbsp;&middot;&nbsp;
          WS:&nbsp;
          <span style={{ color: wsConnected ? '#22c55e' : '#9aa0a6' }}>
            {wsConnected ? 'connected' : 'disconnected'}
          </span>
          {isLive && (
            <>
              &nbsp;&middot;&nbsp;
              <span style={{ color: '#2AB49F' }}>{MODE_LABEL[mode]}</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0f1115',
    color: '#e6e8eb',
    fontFamily: '"Segoe UI",system-ui,-apple-system,sans-serif',
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
    gap: 14,
    maxWidth: 1200,
    margin: '0 auto',
  },
  topbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: { fontSize: 18, fontWeight: 600 },
  codeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#1a1d24',
    border: '1px solid #2a2f37',
    borderRadius: 8,
    padding: '6px 12px',
  },
  codeLabel: { fontSize: 11, color: '#9aa0a6', whiteSpace: 'nowrap' },
  code: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#2AB49F',
    fontFamily: 'monospace',
  },
  smallBtn: {
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  selectorLabel: { fontSize: 10, color: '#9aa0a6', letterSpacing: '0.04em', textTransform: 'uppercase' },
  select: {
    background: '#1a1d24',
    border: '1px solid #2a2f37',
    color: '#e6e8eb',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
  },
  dot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  statusText: { fontSize: 13, color: '#9aa0a6', whiteSpace: 'nowrap' },
  btn: {
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  warnBox: {
    background: '#1c1007',
    border: '1px solid #92400e',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: '#fcd34d',
  },
  errorBox: {
    background: '#2d1010',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: '#fca5a5',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    flex: 1,
  },
  panel: {
    background: '#171a21',
    border: '1px solid',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 300,
  },
  panelHead: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    fontSize: 14,
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  muted: { color: '#9aa0a6', fontStyle: 'italic' },
  line: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' },
  ts: { fontSize: 10, color: '#9aa0a6', flexShrink: 0 },
  hint: { fontSize: 10, color: '#9aa0a6', cursor: 'help' },
  foot: { fontSize: 11, color: '#9aa0a6', textAlign: 'center' },
};
