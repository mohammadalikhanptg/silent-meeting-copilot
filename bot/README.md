# SMC meeting bot

Mirror of /home/ptg/smc-bot on SMC-LINUX-BOT (Ubuntu 24.04, Zoom Meeting SDK Linux 7.1.0.4100).
The app never reaches the VM; the VM polls the app (see bot/poller once added).
Compilation happens ON the Linux host only; this repo is the source of truth, the orchestrator syncs and builds there.
SDK gotchas (binding): do NOT override WIN32-guarded virtuals (onNotificationServiceStatus, onAppSignalPanelUpdated); rawdataOpts field names use lowercase d (audioRawdataMemoryMode); recording controller header is meeting_service_components/meeting_recording_interface.h; link GL and EGL explicitly; SDK JWT is generated on the VM by run-bot.sh (appKey+sdkKey=clientId, iat-30s, exp/tokenExp now+7200, HS256).
