// Capture spike (renderer). Proves two independent streams + live meters.
const logEl = document.getElementById('log')
const micSel = document.getElementById('mic')
const startBtn = document.getElementById('start')
const stopBtn = document.getElementById('stop')
const refreshBtn = document.getElementById('refresh')

function log (msg) {
  const t = new Date().toLocaleTimeString()
  logEl.textContent += `[${t}] ${msg}\n`
  logEl.scrollTop = logEl.scrollHeight
}

if (window.smc) {
  document.getElementById('ver').textContent =
    `Electron ${window.smc.versions.electron} - Chromium ${window.smc.versions.chrome} - Node ${window.smc.versions.node}`
}

let active = []   // tracks + audio contexts to tear down
let rafId = null

async function listDevices () {
  micSel.innerHTML = ''
  const devices = await navigator.mediaDevices.enumerateDevices()
  const inputs = devices.filter(d => d.kind === 'audioinput')
  for (const d of inputs) {
    const o = document.createElement('option')
    o.value = d.deviceId
    o.textContent = d.label || `Microphone ${micSel.length + 1}`
    micSel.appendChild(o)
  }
  log(`Found ${inputs.length} microphone input(s).`)
}

function meter (stream, canvasId, tag) {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  src.connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  const canvas = document.getElementById(canvasId)
  const g = canvas.getContext('2d')
  let peakLogged = 0
  function draw () {
    analyser.getByteTimeDomainData(data)
    let sum = 0, peak = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
      if (Math.abs(v) > peak) peak = Math.abs(v)
    }
    const rms = Math.sqrt(sum / data.length)
    g.clearRect(0, 0, canvas.width, canvas.height)
    const w = Math.min(1, rms * 3) * canvas.width
    g.fillStyle = peak > 0.9 ? '#ef4444' : '#22c55e'
    g.fillRect(0, 0, w, canvas.height)
    const now = Date.now()
    if (peak > 0.05 && now - peakLogged > 2000) {
      log(`${tag} active - rms ${rms.toFixed(3)} peak ${peak.toFixed(3)}`)
      peakLogged = now
    }
  }
  return { ctx, draw }
}

async function start () {
  startBtn.disabled = true
  try {
    const micId = micSel.value
    log('Requesting microphone...')
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : true
    })
    log('Microphone OK.')

    log('Requesting system loopback (OTHERS)...')
    const dispStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    // discard video, keep loopback audio only
    dispStream.getVideoTracks().forEach(t => t.stop())
    const othersStream = new MediaStream(dispStream.getAudioTracks())
    if (othersStream.getAudioTracks().length === 0) {
      log('WARNING: no loopback audio track returned.')
    } else {
      log('System loopback OK.')
    }

    const m1 = meter(micStream, 'meterMe', 'ME')
    const m2 = meter(othersStream, 'meterOthers', 'OTHERS')
    active = [micStream, dispStream, othersStream, m1.ctx, m2.ctx]

    function loop () { m1.draw(); m2.draw(); rafId = requestAnimationFrame(loop) }
    loop()
    stopBtn.disabled = false
    log('Capturing. Speak into the mic and play audio to verify both bars move independently.')
  } catch (e) {
    log('ERROR: ' + e.message)
    startBtn.disabled = false
  }
}

function stop () {
  if (rafId) cancelAnimationFrame(rafId)
  for (const a of active) {
    if (a instanceof MediaStream) a.getTracks().forEach(t => t.stop())
    else if (a && a.close) a.close()
  }
  active = []
  startBtn.disabled = false
  stopBtn.disabled = true
  log('Stopped.')
}

refreshBtn.addEventListener('click', listDevices)
startBtn.addEventListener('click', start)
stopBtn.addEventListener('click', stop)
listDevices()