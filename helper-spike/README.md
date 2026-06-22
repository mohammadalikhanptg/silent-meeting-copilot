# SMC capture spike (Electron)

Purpose: prove, in the real stack, that one Windows app can capture the
microphone (ME) and the system speaker output (OTHERS) as two independent
streams with live level meters. This is the Electron equivalent of the
proven Python hybrid capture, and the foundation for the helper.

## Run
From this folder:

    npm install
    npm start

The window shows a microphone dropdown, Start/Stop, and two level bars.

## What proves success
1. Pick your mic, click Start.
2. Speak: the ME bar moves.
3. Play any audio on the PC (a video, music, a call): the OTHERS bar moves.
4. The two bars move independently, from two separate streams.
5. The log records each stream becoming active.

If the OTHERS bar stays flat, the log will warn that no loopback track was
returned, which tells us the loopback grant needs adjusting for this machine.

## Next steps (not in this spike)
- Resample each stream to 16 kHz mono and stream out to Cloudflare over a
  secure websocket.
- Device pairing to the web login; green connected status.
- Auto-update and code-signing.