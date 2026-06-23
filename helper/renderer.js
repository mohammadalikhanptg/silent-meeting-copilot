// SMC Helper renderer — dual-channel audio capture + WebSocket streaming

const logEl = document.getElementById('log');
const micSel = document.getElementById('micSel');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const barMe = document.getElementById('barMe');
const barOt = document.getElementById('barOt');
const engineUrlEl = document.getElementById('engineUrl');

const CHUNK_MS = 2500;

let ws = null;
let micRecorder = null;
let othersRecorder = null;
let micStream = null;
let dispStream = null;
let analyserCtxMe = null;
let analyserCtxOt = null;
let rafId = null;
let engineUrl = '';
let sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(state) {
  const states = {
    idle: { dot: '', text: 'Idle' },
    connecting: { dot: 'amber', text: 'Connecting…' },
    live: { dot: 'green', text: 'Live — streaming' },
    error: { dot: '', text: 'Error — check log' },
  };
  const s = states[state] || states.idle;
  statusDot.className = 'dot ' + s.dot;
  statusText.textContent = s.text;
  window.smc?.setCaptureState(state === 'live');
}

// Encode audio buffer with speaker byte prefix (0=me, 1=others)
function encodeFrame(speaker, arrayBuffer) {
  const frame = new Uint8Array(1 + arrayBuffer.byteLength);
  frame[0] = speaker === 'others' ? 1 : 0;
  frame.set(new Uint8Array(arrayBuffer), 1);
  return frame.buffer;
}

function openWebSocket() {
  return new Promise((resolve, reject) => {
    const wsUrl = engineUrl.replace(/^http/, 'ws') + `/session/${sessionId}/ws`;
    log(`Connecting WebSocket: ${wsUrl}`);
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      log('WebSocket connected.');
      resolve();
    };
    ws.onerror = () => reject(new Error('WebSocket connection failed'));
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'transcript' && msg.raw) {
          const speaker = msg.speaker === 'others' ? 'OTHERS' : 'ME';
          log(`[${speaker}] ${msg.cleaned || msg.raw}`);
        }
      } catch (_) {}
    };
    ws.onclose = () => log('WebSocket closed.');

    setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
  });
}

function setupMeter(stream, barEl) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  function readLevel() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    barEl.style.width = Math.min(100, rms * 400) + '%';
    return rms;
  }

  return { ctx, readLevel };
}

async function start() {
  startBtn.disabled = true;
  setStatus('connecting');

  try {
    await openWebSocket();
    setStatus('live');

    // ME channel — default microphone
    const micId = micSel.value;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : { sampleRate: 16000, channelCount: 1 },
    });
    log('Microphone stream open.');

    // OTHERS channel — WASAPI system loopback via Electron setDisplayMediaRequestHandler
    dispStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    dispStream.getVideoTracks().forEach(t => t.stop());
    const othersStream = new MediaStream(dispStream.getAudioTracks());

    if (othersStream.getAudioTracks().length === 0) {
      log('WARNING: No loopback audio track — system audio may be muted or unsupported.');
    } else {
      log('System loopback stream open.');
    }

    // Level meters
    const meterMe = setupMeter(micStream, barMe);
    const meterOt = othersStream.getAudioTracks().length > 0
      ? setupMeter(othersStream, barOt)
      : null;
    analyserCtxMe = meterMe.ctx;
    analyserCtxOt = meterOt?.ctx;

    function drawMeters() {
      meterMe.readLevel();
      meterOt?.readLevel();
      rafId = requestAnimationFrame(drawMeters);
    }
    drawMeters();

    // MediaRecorder for ME
    const meMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/ogg;codecs=opus';

    micRecorder = new MediaRecorder(micStream, { mimeType: meMime });
    micRecorder.ondataavailable = async (evt) => {
      if (!evt.data || evt.data.size < 100) return;
      const buf = await evt.data.arrayBuffer();
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(encodeFrame('me', buf));
      }
    };
    micRecorder.start(CHUNK_MS);
    log(`ME recorder started (${meMime}, ${CHUNK_MS}ms chunks).`);

    // MediaRecorder for OTHERS (if loopback available)
    if (othersStream.getAudioTracks().length > 0) {
      othersRecorder = new MediaRecorder(othersStream, { mimeType: meMime });
      othersRecorder.ondataavailable = async (evt) => {
        if (!evt.data || evt.data.size < 100) return;
        const buf = await evt.data.arrayBuffer();
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(encodeFrame('others', buf));
        }
      };
      othersRecorder.start(CHUNK_MS);
      log('OTHERS recorder started.');
    }

    stopBtn.disabled = false;
    log('Session active. Transcripts will appear above.');
  } catch (err) {
    log('ERROR: ' + err.message);
    setStatus('error');
    stop();
  }
}

function stop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  micRecorder?.stop();
  othersRecorder?.stop();
  micStream?.getTracks().forEach(t => t.stop());
  dispStream?.getTracks().forEach(t => t.stop());
  analyserCtxMe?.close();
  analyserCtxOt?.close();

  if (ws?.readyState === WebSocket.OPEN) ws.close();
  ws = null;
  micRecorder = null;
  othersRecorder = null;
  micStream = null;
  dispStream = null;
  analyserCtxMe = null;
  analyserCtxOt = null;
  barMe.style.width = '0';
  barOt.style.width = '0';

  setStatus('idle');
  startBtn.disabled = false;
  stopBtn.disabled = true;
  log('Session stopped.');
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
    log(`Found ${inputs.length} microphone device(s).`);
  } catch (err) {
    log('Could not list devices: ' + err.message);
  }
}

// Init
(async () => {
  try {
    const config = await window.smc.getConfig();
    engineUrl = config.engineUrl;
    engineUrlEl.textContent = 'Engine: ' + engineUrl;
    sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    log(`SMC Helper started. Session: ${sessionId}`);
    log('Engine: ' + engineUrl);
    log(`Electron ${window.smc.versions.electron} / Chromium ${window.smc.versions.chrome}`);
  } catch (err) {
    log('Config load error: ' + err);
  }

  await listDevices();
})();

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

// Handle tray toggle-capture IPC
window.smc?.onToggleCapture((shouldCapture) => {
  if (shouldCapture && startBtn && !startBtn.disabled) start();
  else if (!shouldCapture && stopBtn && !stopBtn.disabled) stop();
});
