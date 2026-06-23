# SMC Helper — Windows Desktop Audio Bridge

Electron app that captures two audio channels and streams them to the Silent Meeting Copilot transcription engine via WebSocket.

## What it does

| Channel | Source | Label in engine |
|---------|--------|-----------------|
| ME | Default microphone (WASAPI input) | `speaker: "me"` |
| OTHERS | System audio loopback (all speaker output) | `speaker: "others"` |

Both channels are chunked every 2.5 seconds and sent as binary WebSocket frames to the engine Durable Object. The engine returns transcript JSON: `{type:"transcript", speaker:"me"|"others", raw:"...", cleaned:"..."}`.

## Prerequisites

- Windows 10 / 11 (64-bit)
- Node.js 20+ (LTS): https://nodejs.org
- Git (optional, for cloning)

## Setup

```cmd
cd helper
npm install
```

This installs Electron (~300 MB on first run).

## Run

```cmd
npm start
```

The app opens a small window and a system tray icon (teal square).

1. Select your microphone from the dropdown.
2. Click **Start** — the app requests microphone permission and opens the loopback stream.
3. A Windows dialog **may** appear asking which screen/window to share — click any entry and press Share. The video is discarded immediately; only the audio loopback is kept.
4. Both level meters should move when you speak (ME) or play audio (OTHERS).
5. Transcripts appear in the log panel as they come back from the engine.
6. The tray icon tooltip shows **Live — streaming** when active.

## Engine URL

Default: `https://smc-engine.ali-6b8.workers.dev`

Override with an environment variable:

```cmd
set SMC_ENGINE_URL=https://your-worker.workers.dev
npm start
```

## Audio format

The helper sends **WebM/Opus** chunks (the browser's native MediaRecorder format). The engine buffers chunks and flushes to Whisper when 64 KB per channel has accumulated (roughly 4–8 seconds of real speech at 32 kbps).

If the browser does not support `audio/webm;codecs=opus`, it falls back to `audio/ogg;codecs=opus`.

## Build installer (optional)

```cmd
npm run dist
```

Produces an NSIS installer in `dist/`. Requires `electron-builder` (installed as a dev dependency).

You need an icon at `assets/icon.ico` for the installer. If missing, the build will succeed but use a default Electron icon.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No system loopback audio | Ensure something is playing through the speakers. The loopback captures whatever the Windows audio mixer is playing. |
| Tray icon missing | The icon is generated inline; if it fails, re-run `npm start`. |
| WebSocket timeout | Check the engine URL is reachable and the Cloudflare Worker is deployed. |
| Microphone access denied | Allow mic in Windows Settings → Privacy → Microphone. |
| Screen-share picker appears every time | This is expected on first run. Electron's `setDisplayMediaRequestHandler` is used to suppress it after the first permission grant on some Windows versions. |

## Architecture

```
Windows
  └─ SMC Helper (Electron)
       ├─ main.js          Electron main process, tray icon, IPC
       ├─ preload.js       Context bridge (main ↔ renderer)
       └─ renderer.js      UI + MediaRecorder + WebSocket client
             │
             │  Binary WebSocket frames
             ▼
  Cloudflare Worker (smc-engine)
       └─ SessionDO        Durable Object per session
             │
             ├─ @cf/openai/whisper         Speech-to-text
             └─ @cf/meta/llama-3.2-3b     Transcript cleanup
```
