#!/bin/sh
# Dev smoke test: builds the bot, starts it without Evolution, and POSTs a fake
# Evolution webhook payload to verify the HTTP + routing pipeline end to end.
# The bot logs a warning that Evolution is unreachable (expected here).
set -u
cd "$(dirname "$0")/.."

npm run build || exit 1

PORT="${PORT:-3099}"
OWNER="${OWNER_NUMBER:-61400000000}"
EVOLUTION_URL=http://127.0.0.1:59999 OWNER_NUMBER="$OWNER" PORT="$PORT" \
  node dist/index.js > /tmp/wabot-smoke.log 2>&1 &
PID=$!
sleep 2

echo "--- health:"
curl -s "http://127.0.0.1:$PORT/health"
echo

TS=$(date +%s)
echo "--- webhook !whoami from owner DM:"
curl -s -X POST "http://127.0.0.1:$PORT/webhook" -H 'content-type: application/json' \
  -d "{\"event\":\"messages.upsert\",\"data\":{\"key\":{\"remoteJid\":\"$OWNER@c.us\",\"fromMe\":false,\"id\":\"SMOKE1\"},\"messageType\":\"conversation\",\"messageTimestamp\":$TS,\"messageId\":\"SMOKE1\",\"message\":{\"conversation\":\"!whoami\"}}}"
echo

sleep 1
kill $PID 2>/dev/null
echo "--- server log:"
tail -12 /tmp/wabot-smoke.log
echo
echo "NOTE: no WhatsApp reply is expected — the Evolution API is not running,"
echo "so the sendText call fails and is logged. Pipeline success = no stack traces."
