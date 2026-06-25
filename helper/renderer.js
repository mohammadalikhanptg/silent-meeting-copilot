// SMC Helper renderer — daemon model.
// Connects to the engine on launch (standby), and captures ONLY when the engine
// (driven by the browser cockpit) sends a capture command. No session code, no
// manual start/stop. The helper never self-resumes capture; the engine decides.

const logEl = document.getElementById('log');
const micSel = document.getElementById('micSel');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const barMe = document.getElementById('barMe');
const barOt = document.getElementById('barOt');
const engineUrlEl = document.getElementById('engineUrl');
const pairingKeyInput = document.getElementById('pairingKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const keySavedBadge = document.getElementById('keySavedBadge');
const armBtn = document.getElementById('armBtn');

const HEARTBEAT_MS = 25000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000, 60000];
// Client-side silence gating (per channel) to cut transcription cost and noise.
const RMS_ON = 0.018;        // enter "speaking" above this
const RMS_OFF = 0.010;       // leave "speaking" below this (hysteresis)
const MIN_SPEECH_MS = 150;   // sustained speech before a segment counts as voiced

// B1 — pause-aligned segmentation (replaces the old blind 2.5s wall-clock cut).
// A segment closes when the speaker pauses (sustained silence via the RMS gate),
// not on a fixed clock, so words and fast/overlapping speech are not sliced in
// half. The max cap is a safety valve only, not the primary cut.
const SEG_MIN_MS = 1000;     // never close a pause-bounded segment shorter than this
const SEG_MAX_MS = 13000;    // hard safety-valve cap (within 12-15s)
const SEG_PAUSE_MS = 350;    // sustained silence that marks a pause boundary
const SEG_OVERLAP_MS = 300;  // trailing audio carried into the next segment
const SEG_TICK_MS = 80;      // segmentation evaluation cadence

let engineUrl = '';
let pairingKey = '';
let deviceId = '';

let ws = null;
let reconnectIdx = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let intentionalClose = false;

let armed = false;        // streams acquired on this device (needs a one-time gesture)
let capturing = false;    // actively recording + streaming
let pendingCapture = false; // engine asked to capture but we are not armed yet
let demoted = false;      // another helper is the active one

let micStream = null, dispStream = null, othersStream = null;
let chanMe = null, chanOt = null;   // per-channel segmentation controllers
let meterMe = null, meterOt = null, rafId = null;
let segMetrics = null;              // B6 — per-channel segment counters

const speech = {
  me: { spk: false, spkSince: 0, seg: false, last: 0 },
  others: { spk: false, spkSince: 0, seg: false, last: 0 },
};

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('smc_device_id');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem('smc_device_id', id);
    }
    return id;
  } catch (_) {
    return 'dev-' + Math.random().toString(36).slice(2);
  }
}

function setState(state) {
  const map = {
    disconnected: { dot: '', text: 'Disconnected — reconnecting…' },
    connecting:   { dot: 'amber', text: 'Connecting…' },
    standby:      { dot: 'blue', text: 'Standby — ready, waiting for the cockpit' },
    needsArm:     { dot: 'amber', text: 'Action needed — click Enable on this device' },
    capturing:    { dot: 'green', text: 'Capturing — streaming to the cockpit' },
    inactive:     { dot: '', text: 'Standby — another device is active' },
  };
  const s = map[state] || map.disconnected;
  statusDot.className = 'dot ' + s.dot;
  statusText.textContent = s.text;
  // Arm button is only relevant until this device is armed.
  armBtn.style.display = armed ? 'none' : 'inline-block';
  window.smc?.setCaptureState(state === 'capturing');
}

function refreshState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) { setState('disconnected'); return; }
  if (capturing) { setState('capturing'); return; }
  if (pendingCapture && !armed) { setState('needsArm'); return; }
  if (demoted) { setState('inactive'); return; }
  setState('standby');
}

// ── WebSocket lifecycle ───────────────────────────────────────────────────────
function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (!pairingKey) {
    log('No pairing key set. Paste your key above and click Save, then it will connect automatically.');
    setState('disconnected');
    return;
  }
  setState('connecting');
  const qs = new URLSearchParams({ role: 'helper', key: pairingKey, device: deviceId });
  const wsUrl = engineUrl.replace(/^http/, 'ws') + `/helper/ws?${qs}`;
  log('Connecting to engine…');
  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    log('Connect failed: ' + e.message);
    scheduleReconnect();
    return;
  }
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    reconnectIdx = 0;
    demoted = false;
    log('Connected. Standing by.');
    // Announce this device and its capabilities (engine ignores unknown fields).
    try { ws.send(JSON.stringify({ type: 'hello', device: deviceId, platform: navigator.platform, app: 'smc-helper' })); } catch (_) {}
    startHeartbeat();
    refreshState();
  };
  ws.onmessage = (evt) => {
    if (typeof evt.data !== 'string') return; // helper does not receive binary
    let msg; try { msg = JSON.parse(evt.data); } catch (_) { return; }
    handleEngineMessage(msg);
  };
  ws.onerror = () => { log('Connection error.'); };
  ws.onclose = (evt) => {
    stopHeartbeat();
    if (evt.code === 4401) {
      log('Authentication failed — check your pairing key. Will retry.');
    }
    if (capturing) endCapture(true); // stop recording; streams stay armed for fast resume
    ws = null;
    if (!intentionalClose) { setState('disconnected'); scheduleReconnect(); }
  };
}

function scheduleReconnect() {
  if (intentionalClose) return;
  const base = BACKOFF_MS[Math.min(reconnectIdx, BACKOFF_MS.length - 1)];
  const jitter = Math.floor(Math.random() * Math.min(base, 1000));
  const delay = base + jitter;
  reconnectIdx++;
  log(`Reconnecting in ${Math.round(delay / 1000)}s…`);
  reconnectTimer = setTimeout(connect, delay);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() })); } catch (_) {}
    }
  }, HEARTBEAT_MS);
}
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

function handleEngineMessage(msg) {
  switch (msg.type) {
    case 'capture':
      if (msg.action === 'start') {
        demoted = false;
        beginCapture();
      } else if (msg.action === 'stop') {
        endCapture(true);
        refreshState();
      } else if (msg.action === 'config') {
        log(`Session language/mode updated by cockpit (${msg.mode || 'auto'}).`);
      }
      break;
    case 'helper_demoted':
      demoted = true;
      endCapture(true);
      log('Another device became the active helper. This device is now on standby.');
      refreshState();
      break;
    case 'session_state':
      // Informational; capture is driven by explicit capture commands.
      if (msg.status === 'paused' || msg.status === 'ended') { if (capturing) { endCapture(true); refreshState(); } }
      break;
    case 'transcript':
      if (msg.raw) log(`[${msg.speaker === 'others' ? 'OTHERS' : 'ME'}] ${msg.cleaned || msg.raw}`);
      break;
    case 'auth_error':
      log('AUTH ERROR: ' + (msg.reason || 'invalid pairing key'));
      break;
  }
}

// ── Stream acquisition (needs a one-time user gesture for OS audio permission) ─
async function ensureStreams() {
  if (micStream && micStream.active) return true;
  const micId = micSel.value;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: micId ? { deviceId: { exact: micId } } : { sampleRate: 16000, channelCount: 1 },
  });
  dispStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  dispStream.getVideoTracks().forEach(t => t.stop());
  othersStream = new MediaStream(dispStream.getAudioTracks());
  if (othersStream.getAudioTracks().length === 0) {
    log('WARNING: no system-audio (loopback) track. OTHERS will be silent.');
  }
  // Meters run continuously while armed so the silence gate is warm before capture.
  meterMe = setupMeter(micStream, barMe, 'me');
  meterOt = othersStream.getAudioTracks().length ? setupMeter(othersStream, barOt, 'others') : null;
  if (!rafId) drawMeters();
  armed = true;
  return true;
}

async function arm() {
  try {
    await ensureStreams();
    log('Microphone and system audio enabled on this device.');
    if (pendingCapture) { pendingCapture = false; beginCapture(); }
    else refreshState();
  } catch (e) {
    log('Could not enable audio: ' + e.message);
    refreshState();
  }
}

function setupMeter(stream, barEl, chan) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  function readLevel() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / data.length);
    if (barEl) barEl.style.width = Math.min(100, rms * 400) + '%';
    // Hysteresis gate
    const st = speech[chan];
    const now = Date.now();
    if (!st.spk && rms > RMS_ON) { st.spk = true; st.spkSince = now; }
    else if (st.spk && rms < RMS_OFF) { st.spk = false; }
    if (st.spk && now - st.spkSince >= MIN_SPEECH_MS) { st.seg = true; st.last = now; }
    return rms;
  }
  return { ctx, analyser, readLevel };
}

function drawMeters() {
  meterMe?.readLevel();
  meterOt?.readLevel();
  rafId = requestAnimationFrame(drawMeters);
}

// ── Capture (recording + streaming), driven by the engine ─────────────────────
function pickMime() {
  return MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
}

async function beginCapture() {
  if (capturing) return;            // idempotent
  if (!armed) {                     // need a one-time gesture first
    try { await ensureStreams(); }
    catch (e) { pendingCapture = true; log('Capture requested but this device needs to be enabled first.'); refreshState(); return; }
  }
  capturing = true;
  refreshState();
  resetMetrics();
  const mime = pickMime();
  chanMe = makeChannel(micStream, 'me', mime);
  if (othersStream && othersStream.getAudioTracks().length) {
    chanOt = makeChannel(othersStream, 'others', mime);
  }
  log('Capturing.');
}

function encodeFrame(speaker, arrayBuffer) {
  const frame = new Uint8Array(1 + arrayBuffer.byteLength);
  frame[0] = speaker === 'others' ? 1 : 0;
  frame.set(new Uint8Array(arrayBuffer), 1);
  return frame.buffer;
}

// A channel runs exactly one MediaRecorder at a time, except for a brief ~300ms
// overlap window at each cut (two recorders) so boundary audio is shared into the
// next segment. A periodic tick decides cuts from the RMS speech gate.
function makeChannel(stream, speaker, mime) {
  const c = { stream, speaker, mime, rec: null, tick: null, stopped: false };
  startSegment(c);
  c.tick = setInterval(() => evaluateChannel(c), SEG_TICK_MS);
  return c;
}

// Each segment is a COMPLETE, self-contained webm/opus file (a full record→stop
// cycle). Only voiced segments are sent (silence gate) to save transcription cost.
function startSegment(c) {
  if (c.stopped) return;
  let parts = [];
  const rec = new MediaRecorder(c.stream, { mimeType: c.mime });
  rec._startTs = Date.now();
  rec._hadSpeech = false;
  speech[c.speaker].seg = false;   // fresh voiced-detection window for this segment
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    const blob = new Blob(parts, { type: c.mime });
    parts = [];
    const durMs = Date.now() - rec._startTs;
    metricSegment(c.speaker, durMs, rec._hadSpeech);
    if (rec._hadSpeech && blob.size > 1200 && ws?.readyState === WebSocket.OPEN) {
      try { ws.send(encodeFrame(c.speaker, await blob.arrayBuffer())); metricSent(c.speaker); } catch (_) {}
    }
  };
  try { rec.start(); } catch (_) { return; }
  c.rec = rec;
}

// Decide whether to close the current segment: on a sustained pause once past the
// minimum length, or on the hard maximum cap as a safety valve.
function evaluateChannel(c) {
  if (c.stopped) return;
  const rec = c.rec;
  if (!rec || rec.state !== 'recording') return;
  const st = speech[c.speaker];
  const now = Date.now();
  if (st.spk || st.seg) rec._hadSpeech = true;
  const age = now - rec._startTs;
  const speaking = st.spk;
  const silentFor = speaking ? 0 : (now - (st.last || 0));
  const pauseCut = rec._hadSpeech && !speaking && silentFor >= SEG_PAUSE_MS && age >= SEG_MIN_MS;
  const maxCut = age >= SEG_MAX_MS;
  if (pauseCut || maxCut) cutSegment(c);
}

// Start the next segment immediately, then stop the old recorder SEG_OVERLAP_MS
// later so ~300ms of audio is shared across the seam (the engine dedupes the
// repeated boundary words). Both recorders briefly run on the same stream.
function cutSegment(c) {
  const old = c.rec;
  if (!old || old.state !== 'recording') return;
  startSegment(c);
  setTimeout(() => { try { old.stop(); } catch (_) {} }, SEG_OVERLAP_MS);
}

function stopChannel(c) {
  if (!c) return;
  c.stopped = true;
  if (c.tick) { clearInterval(c.tick); c.tick = null; }
  try { c.rec?.stop(); } catch (_) {}
  c.rec = null;
}

function endCapture(keepStreams) {
  capturing = false;
  flushMetrics('stop');
  stopChannel(chanMe); chanMe = null;
  stopChannel(chanOt); chanOt = null;
  if (!keepStreams) disarm();
  if (barMe) barMe.style.width = '0';
  if (barOt) barOt.style.width = '0';
}

// ── B6 observability (helper side) ─────────────────────────────────────────────
// Segments emitted per channel and a coarse duration distribution. Logged to the
// helper window only; no audio content is recorded.
function freshChanMetric() { return { sent: 0, total: 0, voiced: 0, durBuckets: {} }; }
function resetMetrics() { segMetrics = { me: freshChanMetric(), others: freshChanMetric(), since: Date.now() }; }
function metricSegment(speaker, durMs, hadSpeech) {
  if (!segMetrics) return;
  const c = segMetrics[speaker];
  if (!c) return;
  c.total++;
  if (hadSpeech) c.voiced++;
  const s = durMs / 1000;
  const b = s < 1.5 ? '<1.5s' : s < 4 ? '1.5-4s' : s < 8 ? '4-8s' : s < 12 ? '8-12s' : '12s+';
  c.durBuckets[b] = (c.durBuckets[b] || 0) + 1;
  if (c.total % 20 === 0) flushMetrics('rolling');
}
function metricSent(speaker) { if (segMetrics && segMetrics[speaker]) segMetrics[speaker].sent++; }
function flushMetrics(reason) {
  if (!segMetrics) return;
  for (const ch of ['me', 'others']) {
    const c = segMetrics[ch];
    if (!c.total) continue;
    log(`metrics[${reason}] ${ch}: sent=${c.sent}/${c.total} voiced=${c.voiced} dur=${JSON.stringify(c.durBuckets)}`);
  }
}

function disarm() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  micStream?.getTracks().forEach(t => t.stop());
  dispStream?.getTracks().forEach(t => t.stop());
  try { meterMe?.ctx.close(); } catch (_) {}
  try { meterOt?.ctx.close(); } catch (_) {}
  micStream = null; dispStream = null; othersStream = null; meterMe = null; meterOt = null;
  armed = false;
}

// ── Mic hot-swap (no teardown of the connection or the OTHERS channel) ─────────
async function swapMic() {
  if (!armed) return;
  const micId = micSel.value;
  try {
    const newMic = await navigator.mediaDevices.getUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : { sampleRate: 16000, channelCount: 1 },
    });
    // Stop old ME channel + tracks, swap stream, rebuild ME meter.
    const wasCapturing = capturing;
    stopChannel(chanMe); chanMe = null;
    micStream?.getTracks().forEach(t => t.stop());
    try { meterMe?.ctx.close(); } catch (_) {}
    micStream = newMic;
    meterMe = setupMeter(micStream, barMe, 'me');
    log('Microphone switched.');
    if (wasCapturing) {
      chanMe = makeChannel(micStream, 'me', pickMime());
    }
  } catch (e) {
    log('Could not switch microphone: ' + e.message);
  }
}

async function listDevices() {
  micSel.innerHTML = '';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d => d.kind === 'audioinput');
    for (const d of inputs) {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Microphone ${micSel.options.length + 1}`;
      micSel.appendChild(o);
    }
  } catch (err) {
    log('Could not list devices: ' + err.message);
  }
}

// ── Pairing key ───────────────────────────────────────────────────────────────
saveKeyBtn.addEventListener('click', async () => {
  const val = pairingKeyInput.value.trim();
  if (!val) { log('Pairing key is empty — not saved.'); return; }
  if (!val.startsWith('smc1_')) log('WARNING: this does not look like a valid pairing key (should start with smc1_).');
  pairingKey = val;
  const result = await window.smc?.savePairingKey(val);
  if (result?.ok !== false) {
    keySavedBadge.style.display = 'inline';
    log('Pairing key saved. Connecting…');
    setTimeout(() => { keySavedBadge.style.display = 'none'; }, 3000);
    intentionalClose = true;
    try { ws?.close(); } catch (_) {}
    intentionalClose = false;
    reconnectIdx = 0;
    connect();
  } else {
    log('Failed to save pairing key: ' + (result?.error || 'unknown error'));
  }
});

armBtn.addEventListener('click', arm);
micSel.addEventListener('change', swapMic);

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  deviceId = getDeviceId();
  try {
    const config = await window.smc.getConfig();
    engineUrl = config.engineUrl;
    engineUrlEl.textContent = 'Engine: ' + engineUrl;
    log('SMC Helper started.');
    log(`Electron ${window.smc.versions.electron} / Chromium ${window.smc.versions.chrome}`);
    const keyResult = await window.smc.loadPairingKey();
    if (keyResult?.key) {
      pairingKey = keyResult.key;
      pairingKeyInput.value = keyResult.key;
      keySavedBadge.style.display = 'inline';
      setTimeout(() => { keySavedBadge.style.display = 'none'; }, 2000);
      log('Pairing key loaded.');
    } else {
      log('No pairing key found. Get yours from Silent Meeting Copilot → Profile → Desktop helper.');
    }
  } catch (err) {
    log('Config load error: ' + err);
  }
  await listDevices();
  refreshState();
  connect();
})();
