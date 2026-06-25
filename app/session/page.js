'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';

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
  const [meetingId, setMeetingId] = useState(null); // set from ?m= param or on create
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('english');
  const [modeType, setModeType] = useState('meeting');
  const [objective, setObjective] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [refDocs, setRefDocs] = useState([]); // [{id, filename, size_bytes, content_text}]
  const [status, setStatus] = useState('idle');
  const [meLines, setMeLines] = useState([]);
  const [othersLines, setOthersLines] = useState([]);
  const [coaching, setCoaching] = useState(null);
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
  const modeTypeRef = useRef('meeting');
  const contextNotesRef = useRef('');
  const refDocsRef = useRef([]);
  const profileRef = useRef(null);
  const seenAssistKeys = useRef(new Set());
  const flaggedItemsRef = useRef([]);
  const segmentTimer = useRef(null);
  const suppressMicRef = useRef(false); // true when a desktop helper is the authoritative ME source
  const tokenRef = useRef(null);
  const heartbeatTimer = useRef(null);
  const complianceAckRef = useRef(false);

  useEffect(() => { meLinesRef.current = meLines; }, [meLines]);
  useEffect(() => { othersLinesRef.current = othersLines; }, [othersLines]);
  useEffect(() => { objectiveRef.current = objective; }, [objective]);
  useEffect(() => { modeTypeRef.current = modeType; }, [modeType]);
  useEffect(() => { contextNotesRef.current = contextNotes; }, [contextNotes]);
  useEffect(() => { refDocsRef.current = refDocs; }, [refDocs]);
  useEffect(() => { flaggedItemsRef.current = flaggedItems; }, [flaggedItems]);
  useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);

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
          if (!languageTouched.current && d.profile.default_language_mode) {
            setMode(d.profile.default_language_mode);
          }
        }
      })
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
            modeType: modeTypeRef.current,
            profile: profileRef.current,
            context: contextNotesRef.current,
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
        }
      } catch (_) {}
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
    reconnectCount.current = 0;
    setPaused(false);
    updateStatus('connecting');
    setError('');
    if (!resume) {
      setMeLines([]);
      setOthersLines([]);
      setCoaching(null);
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

        const qs = new URLSearchParams({ mode: sessionMode, role: 'browser', token: tokenRef.current || '' });
        const langHint = MODE_LANG[sessionMode];
        if (langHint) qs.set('lang', langHint);
        const wsUrl = ENGINE_URL.replace(/^http/, 'ws') + `/app/ws?${qs}`;
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
          try { ws.send(JSON.stringify({ type: 'control', action: resume ? 'resume' : 'start', mode: sessionMode, lang: MODE_LANG[sessionMode] || null })); } catch (_) {}
          startHeartbeat();

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
  }, [sessionCode, mode, objective, contextNotes, title, updateStatus, getEngineToken, startHeartbeat, stopHeartbeat]);

  const stopSession = useCallback(() => {
    intentionalStop.current = true;
    if (segmentTimer.current) { clearTimeout(segmentTimer.current); segmentTimer.current = null; }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    stopHeartbeat();
    recorderRef.current?.stop();
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

  const acceptComplianceAndStart = useCallback(() => {
    complianceAckRef.current = true;
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

  const isLive = status === 'live';
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

  return (
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

          <ThemeToggle />

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

            <span style={{ ...styles.dot, background: isLive ? '#22c55e' : isConnecting ? '#facc15' : isPaused ? '#f59e0b' : '#6b7280' }} />
            <span style={styles.statusText}>
              {isLive ? `Live — ${MODE_LABEL[mode] || mode}`
                : isConnecting ? 'Connecting…'
                : isPaused ? 'Paused'
                : status === 'stopped' ? 'Stopped'
                : 'Ready'}
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
              {meetingId && <span style={{ fontSize: 11, color: '#6b7280' }}>ID: {meetingId.slice(0, 8)}…</span>}
            </div>
            <div style={styles.prepBody}>
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
                  maxLength={120}
                />
              </div>

              {/* Objective */}
              <div style={styles.fieldRow}>
                <label style={styles.selectorLabel} htmlFor="objective">
                  Meeting objective (optional — enables coaching alignment)
                </label>
                <input
                  id="objective"
                  type="text"
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="e.g. Agree on project timeline and assign owners"
                  style={styles.textInput}
                  maxLength={200}
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
                  maxLength={2000}
                />
                <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                  {contextNotes.length}/2000 chars — this feeds the coaching AI for this session
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
          <div style={styles.modalOverlay} onClick={() => setShowComplianceModal(false)}>
            <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Before you start</div>
              <div style={styles.modalBody}>
                This meeting may be transcribed and analysed by AI to provide live assistance, quality and assessment.
                Make sure you have any consent required, and that recording or analysing this conversation complies with the laws that apply to you and the other participants. You are responsible for lawful use.
              </div>
              <div style={styles.modalActions}>
                <button onClick={() => setShowComplianceModal(false)} style={{ ...styles.btn, background: 'var(--bg-raised)', color: 'var(--tx)' }}>Cancel</button>
                <button onClick={acceptComplianceAndStart} style={{ ...styles.btn, background: '#2AB49F' }}>I understand — start</button>
              </div>
            </div>
          </div>
        )}

        {/* Transcript panels — shown when live or stopped */}
        {(isLive || status === 'stopped' || status === 'error') && (
          <div className="smc-grid" style={styles.grid}>
            {/* ME panel */}
            <div className="smc-transcript-panel me-panel">
              <div style={{ ...styles.panelHead, color: 'var(--me)' }}>ME — microphone</div>
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
                          color: l.flagged ? '#f59e0b' : '#cfd4db',
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
            <div className="smc-transcript-panel others-panel">
              <div style={{ ...styles.panelHead, color: 'var(--others)' }}>
                OTHERS — system audio
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
                          color: l.flagged ? '#f59e0b' : '#cfd4db',
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
        )}

        {/* Coaching panel */}
        {(isLive || status === 'stopped') && (
          <div className="smc-coach-panel">
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
                    <div style={styles.coachSectionLabel}>{coachLabels.open}</div>
                    <ul style={styles.coachList}>
                      {coaching.openItems.map((item, i) => <li key={i} style={styles.coachItem}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {coaching.openItems?.length === 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>{coachLabels.open}</div>
                    <div style={styles.coachNone}>None detected</div>
                  </div>
                )}
                {coaching.suggestions?.length > 0 && (
                  <div style={styles.coachSection}>
                    <div style={styles.coachSectionLabel}>{coachLabels.sugg}</div>
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
        )}

        {/* Follow-up Tracker */}
        {showFollowUp && (
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
                        <div style={styles.tpQuote}>&ldquo;{item.text}&rdquo;</div>
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
          {meetingId && <>&nbsp;&middot;&nbsp;<span style={{ color: '#9aa0a6' }}>recording</span></>}
        </div>
      </div>
    </>
  );
}

const styles = {
  root: {
    minHeight: '100vh', background: 'var(--bg)', color: 'var(--tx)',
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
  prepBody: { display: 'flex', flexDirection: 'column', gap: 14, padding: 16 },
  fieldRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  uploadError: { background: 'var(--error-bg)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#fca5a5', marginTop: 4 },
  docList: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  docItem: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' },
  docIcon: { fontSize: 14, flexShrink: 0 },
  docName: { fontSize: 12, color: 'var(--tx)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docSize: { fontSize: 10, color: 'var(--tx-3)', flexShrink: 0 },
  docRemove: { background: 'none', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 },
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
  ts: { fontSize: 10, color: 'var(--tx-3)', flexShrink: 0, fontFeatureSettings: '"tnum"' },
  hint: { fontSize: 10, color: 'var(--tx-3)', cursor: 'help' },
  flagBtn: { background: 'none', border: 'none', fontSize: 17, padding: '0 4px', flexShrink: 0, lineHeight: 1 },
  clarifiedBadge: {
    fontSize: 9, fontWeight: 700, color: '#34d399', background: '#052e16',
    border: '1px solid #166534', borderRadius: 4, padding: '1px 5px', marginRight: 5,
    textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle', display: 'inline-block',
  },
  strikethrough: { fontSize: 11, color: 'var(--tx-3)', textDecoration: 'line-through', cursor: 'help', marginLeft: 4 },
  // Coaching panel (outer div uses className="smc-coach-panel")
  coachHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--coach-border)', flexWrap: 'wrap' },
  coachTitle: { fontSize: 13, fontWeight: 600, color: 'var(--coach)' },
  coachTs: { fontSize: 11, color: 'var(--tx-3)' },
  coachBody: { display: 'flex', flexWrap: 'wrap', gap: 0 },
  coachSection: { flex: '1 1 220px', padding: '12px 16px', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  coachSectionLabel: { fontSize: 10, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  balanceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  balanceLabel: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 60 },
  balanceBar: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' },
  balanceFill: { height: '100%', background: 'linear-gradient(to right, var(--me), var(--others))', borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' },
  coachList: { margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--tx)' },
  coachItem: { marginBottom: 4 },
  coachNone: { fontSize: 13, color: 'var(--tx-3)', fontStyle: 'italic' },
  coachAlignment: { fontSize: 13, color: 'var(--warn)', lineHeight: 1.5 },
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
  foot: { fontSize: 11, color: 'var(--tx-3)', textAlign: 'center' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modalCard: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14 },
  modalTitle: { fontSize: 15, fontWeight: 700, color: 'var(--tx)' },
  modalBody: { fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.6 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
};
