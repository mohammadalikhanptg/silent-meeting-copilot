'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'https://smc-engine.ali-6b8.workers.dev';
const CHUNK_MS = 2500; // send audio every 2.5 seconds

function generateSessionId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Encode binary audio chunk: first byte = speaker (0=me, 1=others)
function encodeChunk(speaker, audioBuffer) {
  const speakerByte = speaker === 'others' ? 1 : 0;
  const combined = new Uint8Array(1 + audioBuffer.byteLength);
  combined[0] = speakerByte;
  combined.set(new Uint8Array(audioBuffer), 1);
  return combined.buffer;
}

export default function SessionPage() {
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error | stopped
  const [sessionId] = useState(generateSessionId);
  const [meLines, setMeLines] = useState([]);
  const [othersLines, setOthersLines] = useState([]);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const meTranscriptRef = useRef(null);
  const othersTranscriptRef = useRef(null);

  const appendLine = useCallback((speaker, raw, cleaned) => {
    const line = { raw, cleaned, ts: new Date().toLocaleTimeString() };
    if (speaker === 'me') {
      setMeLines(prev => [...prev.slice(-200), line]);
    } else {
      setOthersLines(prev => [...prev.slice(-200), line]);
    }
  }, []);

  // Auto-scroll transcripts
  useEffect(() => {
    meTranscriptRef.current?.scrollTo(0, meTranscriptRef.current.scrollHeight);
  }, [meLines]);
  useEffect(() => {
    othersTranscriptRef.current?.scrollTo(0, othersTranscriptRef.current.scrollHeight);
  }, [othersLines]);

  const startSession = useCallback(async () => {
    setStatus('connecting');
    setError('');
    setMeLines([]);
    setOthersLines([]);

    try {
      // 1. Open WebSocket to engine
      const wsUrl = ENGINE_URL.replace(/^http/, 'ws') + `/session/${sessionId}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
        setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
      });
      setWsConnected(true);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'transcript' && msg.raw) {
            appendLine(msg.speaker || 'me', msg.raw, msg.cleaned || msg.raw);
          }
        } catch (_) {}
      };
      ws.onerror = () => {
        setError('WebSocket error. Session may continue via chunked mode.');
      };
      ws.onclose = () => {
        setWsConnected(false);
      };

      // 2. Capture microphone (ME channel)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg;codecs=opus';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (evt) => {
        if (!evt.data || evt.data.size < 100) return;
        const arrayBuf = await evt.data.arrayBuffer();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeChunk('me', arrayBuf));
        }
      };

      recorder.start(CHUNK_MS);
      setStatus('live');
    } catch (err) {
      setError(String(err));
      setStatus('error');
      stopSession();
    }
  }, [sessionId, appendLine]);

  const stopSession = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setStatus('stopped');
    setWsConnected(false);
  }, []);

  const isLive = status === 'live';
  const isConnecting = status === 'connecting';

  return (
    <div style={styles.root}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.brand}>Silent Meeting Copilot</div>
          <div style={styles.sub}>Session {sessionId}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...styles.dot, background: isLive ? '#22c55e' : isConnecting ? '#facc15' : '#6b7280' }} />
          <span style={styles.statusText}>
            {isLive ? 'Live' : isConnecting ? 'Connecting…' : status === 'stopped' ? 'Stopped' : 'Ready'}
          </span>
          {!isLive && !isConnecting && (
            <button onClick={startSession} style={{ ...styles.btn, background: '#2AB49F' }}>
              Start Session
            </button>
          )}
          {(isLive || isConnecting) && (
            <button onClick={stopSession} style={{ ...styles.btn, background: '#ef4444' }}>
              Stop
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.grid}>
        <div style={{ ...styles.panel, borderColor: '#22c55e' }}>
          <div style={{ ...styles.panelHead, color: '#22c55e' }}>ME (microphone)</div>
          <div ref={meTranscriptRef} style={styles.transcript}>
            {meLines.length === 0 && (
              <span style={styles.muted}>Your speech will appear here…</span>
            )}
            {meLines.map((l, i) => (
              <div key={i} style={styles.line}>
                <span style={styles.ts}>{l.ts}</span>
                <span>{l.cleaned}</span>
                {l.raw !== l.cleaned && (
                  <span style={styles.rawHint} title={l.raw}> [raw differs]</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...styles.panel, borderColor: '#38bdf8' }}>
          <div style={{ ...styles.panelHead, color: '#38bdf8' }}>OTHERS (system audio)</div>
          <div ref={othersTranscriptRef} style={styles.transcript}>
            {othersLines.length === 0 && (
              <span style={styles.muted}>Others' speech will appear here (via Windows desktop helper)…</span>
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
        Engine: {ENGINE_URL} &nbsp;·&nbsp; WebSocket: {wsConnected ? 'connected' : 'disconnected'}
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0f1115',
    color: '#e6e8eb',
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
    gap: 14,
    maxWidth: 1200,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  topbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    fontSize: 18,
    fontWeight: 600,
    color: '#e6e8eb',
  },
  sub: {
    fontSize: 11,
    color: '#9aa0a6',
    marginTop: 2,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    fontSize: 13,
    color: '#9aa0a6',
  },
  btn: {
    border: 'none',
    borderRadius: 8,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
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
  panelHead: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    fontSize: 14,
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  muted: {
    color: '#9aa0a6',
    fontStyle: 'italic',
  },
  line: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'baseline',
  },
  ts: {
    fontSize: 10,
    color: '#9aa0a6',
    flexShrink: 0,
  },
  rawHint: {
    fontSize: 10,
    color: '#9aa0a6',
    cursor: 'help',
  },
  foot: {
    fontSize: 11,
    color: '#9aa0a6',
    textAlign: 'center',
  },
};
