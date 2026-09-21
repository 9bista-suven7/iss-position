#!/usr/bin/env bash
# Brings the whole stack up: Kafka -> topics -> Flink -> job -> ingest -> gateway.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

"$INFRA_DIR/start-kafka.sh"
"$INFRA_DIR/create-topics.sh"
"$INFRA_DIR/start-flink.sh"
"$INFRA_DIR/submit-job.sh"

start_node() { # name dir port
  local name="$1" dir="$2" port="$3"
  local pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"; return
  fi
  [ -d "$dir/node_modules" ] || (cd "$dir" && npm install --no-audit --no-fund >/dev/null)
  (cd "$dir" && nohup node src/index.js > "$RUN_DIR/$name.log" 2>&1 & echo $! > "$pidfile")
  echo "$name started (pid $(cat "$pidfile")), log: $RUN_DIR/$name.log"
}

start_node ingest  "$PROJECT_ROOT/ingest"  7301
start_node gateway "$PROJECT_ROOT/gateway" 7300

cat <<INFO

Stack is up:
  Kafka broker      $KAFKA_BOOTSTRAP
  Flink dashboard   http://$FLINK_REST
  Ingest health     http://localhost:7301/health
  Gateway API       http://localhost:7300/health
  Gateway stream    ws://localhost:7300/stream

Start the dashboard with:
  cd dashboard && npm start
INFO
