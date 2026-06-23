# SMC Helper — Desktop Audio Bridge

Electron app that captures two audio channels and streams them to the Silent Meeting Copilot transcription engine via WebSocket. Available for Mac and Windows.

## What it does

| Channel | Source | Label in engine |
|---------|--------|-----------------|
| ME | Default microphone (WASAPI input / Mac mic) | `speaker: "me"` |
| OTHERS | System audio loopback | `speaker: "others"` |

Both channels are chunked every 2.5 seconds and sent as binary WebSocket frames to the engine Durable Object. The engine returns transcript JSON: `{type:"transcript", speaker:"me"|"others", raw:"...", cleaned:"..."}`.

## Download (pre-built)

Go to **Silent Meeting Copilot → Profile → Desktop helper** to download the installer for your platform (Mac .dmg or Windows .exe). Your pairing key is shown there too.

## Pairing key (required)

The helper must be bound to your account before it can stream to your sessions. This prevents any unauthorised app from writing into your meeting transcript.

**Setup:**

1. Sign in to Silent Meeting Copilot.
2. Go to **Profile → Desktop helper**.
3. Copy your **pairing key** (starts with `smc1_`).
4. Open the SMC Helper app, paste the key into the **Pairing key** field, and click **Save**.
5. The key is stored securely on this device using the OS keychain (Electron safeStorage).

**Rotation:** If you rotate your key from the profile page, the old key stops working immediately. Update the helper with the new key.

## Session pairing

1. Open a live session in the browser — note the session code (e.g., `drk-8421`).
2. In the helper, enter the same code in the **Session code** field.
3. Click **Start** — the helper validates your key, binds to your session, and begins streaming.

## Prerequisites (development / build)

- Node.js 20+ (LTS)
- Mac: Xcode command-line tools (for native modules if needed)
- Windows 10 / 11 (64-bit)

## Run from source

```bash
cd helper
npm install
npm start
```

## Build installer

```bash
npm run dist:mac    # produces .dmg and .zip in dist/
npm run dist:win    # produces NSIS .exe in dist/
```

Set `CSC_IDENTITY_AUTO_DISCOVERY=false` to build unsigned (no code signing cert required).

**Unsigned builds:** macOS Gatekeeper will warn on first launch. Right-click the .dmg → Open to bypass. Windows SmartScreen: click "More info" → "Run anyway".

## Engine URL

Default: `https://smc-engine.ali-6b8.workers.dev`

Override with `SMC_ENGINE_URL` environment variable.

## Audio format

WebM/Opus chunks from the browser's native MediaRecorder. Falls back to OGG/Opus if WebM is unavailable. The engine buffers and flushes to Whisper every ~64 KB per channel.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Auth error / key rejected | Check the pairing key matches what's shown on your profile page. Rotate and re-paste if needed. |
| No system loopback audio | Ensure audio is playing. On Mac, the loopback requires macOS 14+ or a virtual audio device (e.g. BlackHole). On Windows, WASAPI loopback is used. |
| WebSocket timeout | Check the engine URL is reachable and the Cloudflare Worker is deployed. |
| Microphone access denied | Allow mic in System Settings / Windows Privacy settings. |

## Architecture

```
Mac / Windows
  └─ SMC Helper (Electron)
       ├─ main.js       Main process, tray, safeStorage IPC
       ├─ preload.js    Context bridge (main ↔ renderer)
       └─ renderer.js   UI + pairing key + MediaRecorder + WebSocket
             │
             │  Binary WebSocket frames (?key=smc1_xxx.yyy)
             ▼
  Cloudflare Worker (smc-engine)
       └─ SessionDO     Validates pairing key → bins to user → Whisper → LLM
```
