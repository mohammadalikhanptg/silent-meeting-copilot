#!/bin/bash
# usage: run-bot.sh <meeting_number> [passcode]
pulseaudio --check 2>/dev/null || pulseaudio --start --exit-idle-time=-1
pactl list short sinks 2>/dev/null | grep -q virtual_speaker || pactl load-module module-null-sink sink_name=virtual_speaker >/dev/null 2>&1
pactl list short sinks 2>/dev/null | grep -q virtual_mic || pactl load-module module-null-sink sink_name=virtual_mic >/dev/null 2>&1
set -a; source ~/.smc/zoom.env; set +a
export SMC_ZOOM_JWT=$(python3 - <<'PY'
import jwt,time,os
now=int(time.time())
p={"appKey":os.environ["ZOOM_SDK_CLIENT_ID"],"sdkKey":os.environ["ZOOM_SDK_CLIENT_ID"],"iat":now-30,"exp":now+7200,"tokenExp":now+7200}
t=jwt.encode(p,os.environ["ZOOM_SDK_CLIENT_SECRET"],algorithm="HS256")
print(t if isinstance(t,str) else t.decode())
PY
)
exec ~/smc-bot/adapter/build/join_bot "$@"
