# Status — 5 Jul 2026 — Zoom bot Gate 1b core PROVEN; live-join test ready

Chat chain: Silent Meeting Copilot Chat 3. This doc records the Gate 1b outcome and, critically, WHERE EVERYTHING LIVES, after the operator flagged that the Zoom credentials had been supplied three times and the SDK package twice because prior work was not durably documented. That failure mode is closed: the canonical machine-readable record is Sanity wfArtifact `a-smc-zoombot-buildhost-runbook` (published, project 74704nsd/production). This doc mirrors the essentials. NO future chat may ask the operator for the Zoom credentials or the SDK package again.

## Durable locations (never re-request from operator)
- Zoom Meeting SDK app: "Pacific Meeting Bot", Client ID `tzRQUuRpTZ6w1CaKVgZLg` (not secret). Client Secret lives ONLY at `/home/ptg/.smc/zoom.env` (mode 600) on SMC-LINUX-BOT (10.101.101.56, user ptg). Verified working 5 Jul: SDKAuth returned AUTHRET_SUCCESS.
- SDK package: `zoom-meeting-sdk-linux_x86_64-7.1.0.4100.tar.xz`, 107,863,960 bytes, SHA256 `5d1afcd058cf2c98a37a4a3277d4c1da4811afe57a55d6a6d230987513104fcd`. Copies: VM `~/smc-in/`, Worker 1 `C:/Users/MohammadAliKhan/smcvm/payload/`, staged extracted at `~/smc-bot/sdk` (symlink `libmeetingsdk.so.1` in place).
- Exec channel: Worker 1 scheduled tasks `smc-vmrun` (cmd.sh -> ssh bash -s -> out.txt) and `smc-vmcopy` (scp payload -> VM). Full mechanics and channel gotchas in the Sanity runbook.

## Gate 1b outcome (5 Jul)
- VM fully patched, rebooted, restart flag clear (kernel 6.8.0-134).
- SDK 7.1.0.4100 staged; runtime deps installed (xcb set, glib, curl, pulseaudio, GL/EGL stack).
- `auth_smoke` harness compiled, linked, and AUTHENTICATED against Zoom with a JWT generated on-VM (secret never left the VM). Gate 1a's open question is answered: this host builds and authenticates the C++ Linux SDK.
- `join_bot` built clean at `~/smc-bot/adapter/build/join_bot`: joins a meeting by number/passcode as "SMC Bot" (video off), reports meeting status transitions, probes CanStartRawRecording, auto-leaves after 20s. Wrapper `~/smc-bot/run-bot.sh <meeting_number> [passcode]` starts pulseaudio null sinks, mints the JWT, and runs it.
- SDK 7.1 Linux build knowledge (WIN32-guarded virtuals to skip, rawdataOpts field casing, recording-controller include, GL/EGL link) captured in the Sanity runbook so it is never re-derived.

## Live-join test procedure (first bot test in a real meeting)
1. Operator starts a Zoom meeting on his own account (waiting room off, or admit the bot).
2. Via the exec channel run: `~/smc-bot/run-bot.sh <meeting_number> <passcode>`.
3. Expected: INIT-OK, AUTH-RESULT=0, MEETING-STATUS transitions, IN-MEETING-OK, CAN-RAW-RECORD=<code>, auto-leave, EXIT=0. A nonzero CAN-RAW-RECORD on first run means recording permission is needed (host grant / recording token / OBF) — informative, not a failure.

## Product build check (5 Jul, for today's live use)
- Vercel production READY on main HEAD (roadmap status commit 4811a04); all recent deployments READY; commit author discipline intact (ali@khan.vg).
- Zero runtime errors in the last 24h on production.
- Engine untouched by this workstream; audio retention remains dormant (AUDIO_RETENTION_ENABLED=false).
- Dangling review branch `worker/job-zoombot-g1a` (Gate 1a findings doc) exists on origin; merge-or-delete per the no-lingering-branches rule is queued.

## Gaps / follow-ups (tracked in Sanity)
- `t-smc-worker1-bridge-tokens`: GPT_BRIDGE_TOKEN and SANITY_TOKEN absent from the MohammadAliKhan profile on DEV-ORCH-01 (HTTP wf-create fallback 401s there).
- Fold this status into ROADMAP.md's status trail next session (deferred to preserve context; this doc + the Sanity runbook are authoritative meanwhile).
- Remaining Gate 1b scope after the live-join test: per-participant raw audio capture delegate, binary frame envelope wiring into the existing bot/ runtime, /bot/ws route with bot-credential auth — all behind the existing hard gates.
