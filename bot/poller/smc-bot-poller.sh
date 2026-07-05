#!/bin/bash
# smc-bot-poller.sh — SMC VM bot queue poller
# Reads APP_BASE_URL and BOT_QUEUE_SECRET from ~/.smc/bot-queue.env (mode 600).
# Loops every 5s: GET queue endpoint; on a claimed request, launches run-bot.sh,
# tails the log to post status transitions, honours leave_requested via leave-flag.
#
# Usage: smc-bot-poller.sh [--once]
#   --once  Dry-run (gated by SMC_POLLER_DRYRUN=1): claim one request, post
#           joining then failed, exit 0. Does NOT launch the bot binary.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_RUNNER="${SCRIPT_DIR}/../run-bot.sh"
LOG_DIR="${HOME}/smc-bot/logs"
ENV_FILE="${HOME}/.smc/bot-queue.env"

ONCE=0
for arg in "$@"; do
  [[ "$arg" == "--once" ]] && ONCE=1
done

# Load env
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

APP_BASE_URL="${APP_BASE_URL:-}"
BOT_QUEUE_SECRET="${BOT_QUEUE_SECRET:-}"

if [[ -z "$APP_BASE_URL" || -z "$BOT_QUEUE_SECRET" ]]; then
  echo "ERROR: APP_BASE_URL and BOT_QUEUE_SECRET must be set in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

BACKOFF=5
MAX_BACKOFF=60

post_status() {
  local req_id="$1" status="$2"
  curl -sf -X POST \
    -H "Authorization: Bearer ${BOT_QUEUE_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"${status}\"}" \
    "${APP_BASE_URL}/api/bot-queue/${req_id}/status" >/dev/null 2>&1 || true
}

get_leave_requested() {
  local req_id="$1"
  curl -sf \
    -H "Authorization: Bearer ${BOT_QUEUE_SECRET}" \
    "${APP_BASE_URL}/api/bot-queue/${req_id}/status" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('leave_requested') else '0')" 2>/dev/null || echo "0"
}

handle_request() {
  local req_id="$1" meeting_number="$2" passcode="$3" bot_name="$4"
  local log_file="${LOG_DIR}/bot-${req_id}.log"
  local leave_flag="${LOG_DIR}/leave-${req_id}"
  local bot_pid=""

  echo "[poller] CLAIMED req=${req_id} meeting=${meeting_number}"

  # Dry-run mode
  if [[ "${SMC_POLLER_DRYRUN:-}" == "1" ]]; then
    echo "CLAIMED"
    post_status "$req_id" "joining"
    sleep 1
    post_status "$req_id" "failed"
    echo "[poller] dry-run complete"
    exit 0
  fi

  post_status "$req_id" "joining"

  # Build args for run-bot.sh
  local bot_args=("$meeting_number")
  [[ -n "$passcode" ]] && bot_args+=("--passcode" "$passcode")
  [[ -n "$bot_name" ]] && bot_args+=("--name" "$bot_name")
  bot_args+=("--leave-flag" "$leave_flag")

  # Launch bot in background, capture output to log
  nohup "$BOT_RUNNER" "${bot_args[@]}" >"$log_file" 2>&1 &
  bot_pid=$!

  # Tail log and map status lines
  local last_status="joining"
  local final_status=""

  while true; do
    # Check if bot process is still running
    if ! kill -0 "$bot_pid" 2>/dev/null; then
      wait "$bot_pid" 2>/dev/null || true
      local exit_code=$?
      if [[ -z "$final_status" ]]; then
        if [[ $exit_code -eq 0 ]]; then
          final_status="left"
        elif [[ $exit_code -eq 8 ]]; then
          final_status="passcode_required"
          post_status "$req_id" "passcode_required"
        else
          final_status="failed"
        fi
        post_status "$req_id" "${final_status}"
      fi
      break
    fi

    # Parse log for status lines
    if [[ -f "$log_file" ]]; then
      if grep -q "^WAITING-ROOM" "$log_file" 2>/dev/null && [[ "$last_status" == "joining" ]]; then
        last_status="waiting_room"
        post_status "$req_id" "waiting_room"
      fi
      if grep -q "^IN-MEETING-OK" "$log_file" 2>/dev/null && [[ "$last_status" != "in_meeting" ]]; then
        last_status="in_meeting"
        post_status "$req_id" "in_meeting"
      fi
      if grep -q "^PASSCODE-REQUIRED" "$log_file" 2>/dev/null && [[ -z "$final_status" ]]; then
        final_status="passcode_required"
        post_status "$req_id" "passcode_required"
      fi
    fi

    # Check leave_requested from app every 5s
    local lr
    lr=$(get_leave_requested "$req_id")
    if [[ "$lr" == "1" && ! -f "$leave_flag" ]]; then
      touch "$leave_flag"
    fi

    sleep 5
  done

  # Cleanup leave flag
  rm -f "$leave_flag"
}

poll_once() {
  local response
  response=$(curl -sf \
    -H "Authorization: Bearer ${BOT_QUEUE_SECRET}" \
    "${APP_BASE_URL}/api/bot-queue" 2>/dev/null) || return 1

  if [[ -z "$response" ]]; then return 0; fi

  local req_id meeting_number passcode bot_name
  req_id=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null) || return 0
  [[ -z "$req_id" ]] && return 0

  meeting_number=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('meeting_number',''))" 2>/dev/null)
  passcode=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('passcode',''))" 2>/dev/null)
  bot_name=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('bot_name','Meeting notes'))" 2>/dev/null)

  handle_request "$req_id" "$meeting_number" "$passcode" "$bot_name"
}

# --once mode (dry-run gate checked inside handle_request)
if [[ $ONCE -eq 1 ]]; then
  poll_once
  exit 0
fi

# Main loop
echo "[poller] starting — ${APP_BASE_URL}"
while true; do
  if poll_once; then
    BACKOFF=5
  else
    echo "[poller] app unreachable, backing off ${BACKOFF}s"
    sleep "$BACKOFF"
    BACKOFF=$(( BACKOFF < MAX_BACKOFF ? BACKOFF * 2 : MAX_BACKOFF ))
    continue
  fi
  sleep 5
done
