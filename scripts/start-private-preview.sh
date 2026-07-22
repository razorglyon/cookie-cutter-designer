#!/usr/bin/env bash
set -Eeuo pipefail

readonly TS_HOME="${TS_HOME:-/root/.local/tailscale}"
readonly TS_STATE_DIR="${TS_STATE_DIR:-/root/.tailscale}"
readonly TS_BIN="$TS_HOME/bin/tailscale"
readonly TSD_BIN="$TS_HOME/bin/tailscaled"
readonly TS_SOCKET="$TS_STATE_DIR/tailscaled.sock"
readonly APP_URL="http://127.0.0.1:4173"
readonly APP_PATH="/cookie-cutter-designer/"

daemon_pid=''
preview_pid=''
serve_started=false

cleanup() {
  if [[ "$serve_started" == true ]]; then
    "$TS_BIN" --socket="$TS_SOCKET" serve --https=443 off >/dev/null 2>&1 || true
  fi
  if [[ -n "$preview_pid" ]]; then
    kill "$preview_pid" >/dev/null 2>&1 || true
    wait "$preview_pid" 2>/dev/null || true
  fi
  if [[ -n "$daemon_pid" ]]; then
    kill "$daemon_pid" >/dev/null 2>&1 || true
    wait "$daemon_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for binary in "$TS_BIN" "$TSD_BIN"; do
  if [[ ! -x "$binary" ]]; then
    printf 'Missing executable: %s\n' "$binary" >&2
    exit 1
  fi
done

install -d -m 700 "$TS_STATE_DIR"

if ! "$TS_BIN" --socket="$TS_SOCKET" status --json >/dev/null 2>&1; then
  "$TSD_BIN" \
    --tun=userspace-networking \
    --state="$TS_STATE_DIR/tailscaled.state" \
    --statedir="$TS_STATE_DIR" \
    --socket="$TS_SOCKET" \
    --no-logs-no-support &
  daemon_pid=$!

  for _attempt in {1..30}; do
    if "$TS_BIN" --socket="$TS_SOCKET" status --json >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

"$TS_BIN" --socket="$TS_SOCKET" up \
  --hostname=cookie-cutter-dev \
  --accept-dns=false \
  --accept-routes=false

if curl -fsS "$APP_URL$APP_PATH" >/dev/null 2>&1; then
  printf 'Port 4173 is already serving an application. Stop it before using this script.\n' >&2
  exit 1
fi

pnpm run preview --host 127.0.0.1 &
preview_pid=$!

ready=false
for _attempt in {1..30}; do
  if curl -fsS "$APP_URL$APP_PATH" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != true ]]; then
  printf 'Vite preview did not become ready at %s%s\n' "$APP_URL" "$APP_PATH" >&2
  exit 1
fi

"$TS_BIN" --socket="$TS_SOCKET" serve --bg --yes "$APP_URL"
serve_started=true
status_file=$(mktemp /tmp/cookie-cutter-tailscale-status.XXXXXX.json)
"$TS_BIN" --socket="$TS_SOCKET" status --json > "$status_file"
dns_name=$(python3 -c 'import json, sys; data=json.load(open(sys.argv[1])); print((data.get("Self") or {}).get("DNSName", "").rstrip("."))' "$status_file")

if [[ -z "$dns_name" ]]; then
  printf 'Tailscale did not return a private DNS name.\n' >&2
  exit 1
fi

printf '\nPrivate preview: https://%s/\n' "$dns_name"
printf 'Keep this process running while the preview is needed.\n'
wait "$preview_pid"
