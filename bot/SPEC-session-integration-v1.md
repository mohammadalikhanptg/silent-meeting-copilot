# SMC meeting-bot session integration v1 — full build spec

This is the authoritative spec for job job-smcbot-v1. The worker brief points here. Read this file in full before starting. Work only in this repo. Never touch the Pacific Assurance Dashboard or any PAD asset.

## Context

Silent Meeting Copilot (SMC) is a Next.js app on Vercel with a live coaching cockpit fed today by a desktop helper. A headless Zoom Linux Meeting SDK bot runs on a LAN VM the app can never reach, so the VM polls the app. The bot's PROVEN v1 source is in this repo at `bot/` (see `bot/README.md` for binding SDK gotchas; read it first). This job delivers the session-side bot integration, bot v2 source, the VM poller, automatic helper fallback, and live-coaching reliability hardening.

## Skills (mandatory preamble)

Install, enable, read in full and apply: superpowers and double-shot-latte (brainstorm, plan in small verified steps, fresh subagent per task, do not stop before acceptance tests pass); security-guidance plus run /security-review before finishing; for UI work frontend-design, impeccable (product register) and taste-skill, STRICTLY constrained to the existing SMC design system: extend it, never restyle the app. After installing run `claude plugin list` and enable anything disabled; paste the enabled list into the evidence file. Record which skill informed which choice in a committed SKILL-APPLICATION.md. The runner's status line is not proof; the committed evidence file and the pushed branch are.

## Budget rule

Execute parts strictly in order A, B, C, D. Never leave a part half-done: finish and verify it, or report it untouched.

## Part A — app (priority 1)

A1. Session preparation UI: add a "Meeting bot" block with meeting number (digits, required to enable the bot for the session), optional passcode, and a bot display name text input prefilled from the user's default bot name. Helper text: without a passcode the bot joins and waits in the waiting room for admission. Follow the existing design system.

A2. Profile/settings: add a "default bot name" field, computed default `<first name>'s meeting notes` from the profile display name. No logo, watermark, or SMC branding anywhere in bot identity.

A3. Bot request lifecycle and API. Authenticated user endpoints to create a bot join request bound to the active session (meetingNumber, passcode optional, botName) and to request leave (sets leaveRequested=true). Bot-facing endpoints: GET next queued request and POST status updates, authenticated ONLY by header `Authorization: Bearer <BOT_QUEUE_SECRET env var>`, constant-time comparison, 401 otherwise. Status enum exactly: queued, joining, waiting_room, in_meeting, passcode_required, failed, left. Claim semantics: a request returned to the bot moves out of queued so it is not double-claimed. Never log passcodes; never expose bot request records client-side beyond the owning user's own session status. Session UI: live bot status chip plus a Remove bot button.

A4. Capture-source arbitration with automatic helper fallback. Coaching must never depend on the bot. If the helper is connected, coaching runs off the helper exactly as today; bot in_meeting is informational until the raw-audio increment lands. On any bot terminal or blocking status (failed, passcode_required, left, waiting-room timeout) the session automatically continues or switches to the helper with a visible non-blocking notice, zero user action. Design the arbitration so a later increment can prefer bot audio when available.

## Part B — bot v2 source only (priority 2)

Files: `bot/adapter/join_bot.cpp`, `bot/adapter/CMakeLists.txt` if needed, `bot/run-bot.sh`. You CANNOT compile this in your environment; the orchestrator compiles on the Linux host afterwards. Keep the diff minimal and pattern-faithful to the seeded v1. Where the SDK 7.1 Linux API is uncertain, state the uncertainty explicitly in SKILL-APPLICATION.md rather than guessing silently.

Changes:
1. Args become `<meeting_number>` (positional passcode kept for compat) plus `--passcode X`, `--name "display name"` (userName from --name, default "Meeting notes"), `--leave-flag <path>`.
2. Waiting room: treat waiting-room and waiting-for-host meeting statuses as WAIT states. Print `WAITING-ROOM` once, keep running, cap 20 minutes then leave with a distinct exit code.
3. If Zoom demands a passcode we did not supply, print `PASSCODE-REQUIRED` and exit with a distinct code. Investigate the meeting status/iResult signalling pragmatically without adding new controller dependencies.
4. Remove the 20-second auto-leave. Leave when the `--leave-flag` file appears (poll every 2s via glib timeout), when the meeting ends, or at a 4-hour hard cap.
5. After in-meeting, mute own mic via the audio controller with minimal includes and never unmute; keep isVideoOff=true.
6. PRESERVE: every existing status output line (only add WAITING-ROOM and PASSCODE-REQUIRED); the exact set of overridden virtuals (do NOT override onNotificationServiceStatus or onAppSignalPanelUpdated, they are WIN32-guarded); rawdataOpts lowercase-d field names; the CMake link set (meetingsdk GL EGL glib); the run-bot.sh JWT block unchanged. run-bot.sh passes the new args through.

## Part C — VM poller (priority 2)

New dir `bot/poller`: `smc-bot-poller.sh` (bash; python3 permitted for JSON) plus a systemd user unit `smc-bot-poller.service`. Loop every 5 seconds: GET the queue endpoint using APP_BASE_URL and BOT_QUEUE_SECRET sourced from `~/.smc/bot-queue.env` (mode 600, never committed). On a claimed request, POST joining, launch run-bot.sh with the request's args via nohup to a per-request log under `~/smc-bot/logs`, tail the log to map bot status lines to POST status transitions (WAITING-ROOM to waiting_room, IN-MEETING-OK to in_meeting, PASSCODE-REQUIRED to passcode_required, process exit to left or failed with the exit code), and honour leaveRequested by touching the request's leave-flag file. Must survive the app being unreachable with backoff and no crash loop. Include a `--once` dry-run mode gated by SMC_POLLER_DRYRUN=1 that claims one request, posts joining then failed, and exits 0 without launching the binary.

## Part D — live coaching reliability (priority 3, start ONLY after A-C fully pass)

A real meeting saw the coach stall about 10 minutes into the session. Audit the live session data path end to end: helper ingest, streaming/SSE/websocket routes, Vercel function maxDuration versus vercel.json, auth or token expiry mid-session, reconnect logic, memory growth, backpressure. Implement automatic reconnect with resume, heartbeat plus a client watchdog that surfaces a visible reconnecting state instead of dying silently, and route duration configs consistent with the platform limits. If a concrete defect is found, document pre-fix repro and post-fix verification. If budget runs short, report Part D untouched.

## Secrets

Reference BOT_QUEUE_SECRET and all credentials by env var name only. Local tests use a dummy value in .env.local, never committed. Never print secrets to logs or the evidence file.

## Delivery contract

Commit everything including SKILL-APPLICATION.md to the job branch, push it, do not merge, do not deploy, do not touch production. Re-verify from origin (git ls-remote plus a fresh fetch) that every expected path exists and list those paths in the evidence file and report. On any unmet acceptance test set status needs-input or failed with the exact error; never a bare done on local-only work.

## Acceptance tests (all must pass)

1. `npm ci && npm run build` exits 0.
2. POST bot join request unauthenticated returns 401 or 403. Authenticated returns 201 and the owning session state shows bot status queued.
3. GET bot queue endpoint without Authorization returns 401. With the bearer secret returns 200 with the queued request; an immediate second poll does not return the same request as queued (claim semantics).
4. POST status transitions queued to joining to waiting_room to in_meeting each return 200 and are reflected in session state; an illegal transition left to in_meeting is rejected with a 4xx.
5. User leave endpoint sets leaveRequested=true and the bot-facing poll response carries it.
6. With helper connected and bot status set to failed, the active capture source resolves to helper and the session stays active; repeat for passcode_required and left.
7. `SMC_POLLER_DRYRUN=1 ./bot/poller/smc-bot-poller.sh --once` against the local app with one queued request prints CLAIMED, posts joining then failed, exits 0.
8. `bot/adapter/join_bot.cpp`: grep proves every v1 status line still present; grep proves onNotificationServiceStatus and onAppSignalPanelUpdated are NOT overridden; rawdataOpts field names unchanged; WAITING-ROOM and PASSCODE-REQUIRED lines exist; 20-second auto-leave removed; --leave-flag handling present.
9. Part D only if executed: a scripted 30-minute synthetic session against local dev completes with no gap over 15 seconds in coach output; the script is committed.
10. SKILL-APPLICATION.md committed; /security-review run with high-severity findings fixed; job branch pushed; git ls-remote and a fresh fetch confirm every expected path, listed in the report.
