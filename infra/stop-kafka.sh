#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
PIDFILE="$RUN_DIR/kafka.pid"
if [ -f "$PIDFILE" ]; then
  "$KAFKA_HOME/bin/kafka-server-stop.sh" >/dev/null 2>&1 || true
  PID="$(cat "$PIDFILE")"
  for i in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -9 "$PID" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "Kafka stopped."
else
  echo "Kafka not running (no pidfile)."
fi
