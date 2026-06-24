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

const CHUNK_MS = 2500;
const HEARTBEAT_MS = 25000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000, 60000];
// Client-side silence gating (per channel) to cut transcription cost and noise.
const RMS_ON = 0.018;        // enter "speaking" above this
const RMS_OFF = 0.010;       // leave "speaking" below this (hysteresis)
const MIN_SPEECH_MS = 150;   // sustained speech before a segment counts as voiced
const POSTROLL_MS = 1500;    // keep sending briefly after speech so tails are not clipped

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
let micRecorder = null, othersRecorder = null;
let micSegTimer = null, otSegTimer = null;
let meterMe = null, meterOt = null, rafId = null;

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
async function beginCapture() {
  if (capturing) return;            // idempotent
  if (!armed) {                     // need a one-time gesture first
    try { await ensureStreams(); }
    catch (e) { pendingCapture = true; log('Capture requested but this device needs to be enabled first.'); refreshState(); return; }
  }
  capturing = true;
  refreshState();
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
  startChannel(micStream, 'me', (r) => { micRecorder = r; }, (t) => { micSegTimer = t; }, mime);
  if (othersStream && othersStream.getAudioTracks().length) {
    startChannel(othersStream, 'others', (r) => { othersRecorder = r; }, (t) => { otSegTimer = t; }, mime);
  }
  log('Capturing.');
}

function encodeFrame(speaker, arrayBuffer) {
  const frame = new Uint8Array(1 + arrayBuffer.byteLength);
  frame[0] = speaker === 'others' ? 1 : 0;
  frame.set(new Uint8Array(arrayBuffer), 1);
  return frame.buffer;
}

// Cycle the recorder so each segment is a COMPLETE, self-contained file, and only
// send segments that contained speech (silence gate) to save transcription cost.
function startChannel(stream, speaker, assignRecorder, assignTimer, mime) {
  if (!capturing) return;
  let parts = [];
  speech[speaker].seg = false;
  const rec = new MediaRecorder(stream, { mimeType: mime });
  assignRecorder(rec);
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    const blob = new Blob(parts, { type: mime });
    parts = [];
    const voiced = speech[speaker].seg || (Date.now() - speech[speaker].last < POSTROLL_MS);
    if (voiced && blob.size > 1200 && ws?.readyState === WebSocket.OPEN) {
      try { ws.send(encodeFrame(speaker, await blob.arrayBuffer())); } catch (_) {}
    }
    if (capturing) startChannel(stream, speaker, assignRecorder, assignTimer, mime);
  };
  rec.start();
  assignTimer(setTimeout(() => { try { rec.stop(); } catch (_) {} }, CHUNK_MS));
}

function endCapture(keepStreams) {
  capturing = false;
  if (micSegTimer) { clearTimeout(micSegTimer); micSegTimer = null; }
  if (otSegTimer) { clearTimeout(otSegTimer); otSegTimer = null; }
  try { micRecorder?.stop(); } catch (_) {}
  try { othersRecorder?.stop(); } catch (_) {}
  micRecorder = null; othersRecorder = null;
  if (!keepStreams) disarm();
  if (barMe) barMe.style.width = '0';
  if (barOt) barOt.style.width = '0';
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
    // Stop old ME recorder + tracks, swap stream, rebuild ME meter.
    const wasCapturing = capturing;
    if (micSegTimer) { clearTimeout(micSegTimer); micSegTimer = null; }
    try { micRecorder?.stop(); } catch (_) {}
    micRecorder = null;
    micStream?.getTracks().forEach(t => t.stop());
    try { meterMe?.ctx.close(); } catch (_) {}
    micStream = newMic;
    meterMe = setupMeter(micStream, barMe, 'me');
    log('Microphone switched.');
    if (wasCapturing) {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
      startChannel(micStream, 'me', (r) => { micRecorder = r; }, (t) => { micSegTimer = t; }, mime);
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
