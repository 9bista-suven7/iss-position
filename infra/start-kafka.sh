#!/usr/bin/env bash
# Starts the single-node KRaft broker in the background.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
PIDFILE="$RUN_DIR/kafka.pid"
LOG="$RUN_DIR/kafka.log"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Kafka already running (pid $(cat "$PIDFILE"))"; exit 0
fi
[ -d "$KAFKA_HOME" ] || { echo "Kafka not installed. Run ./infra/setup.sh first."; exit 1; }

echo "Starting Kafka broker on $KAFKA_BOOTSTRAP ..."
nohup "$KAFKA_HOME/bin/kafka-server-start.sh" \
  "$KAFKA_HOME/config/iss-kraft.properties" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

for i in $(seq 1 60); do
  if "$KAFKA_HOME/bin/kafka-broker-api-versions.sh" \
       --bootstrap-server "$KAFKA_BOOTSTRAP" >/dev/null 2>&1; then
    echo "Kafka is up (pid $(cat "$PIDFILE")), log: $LOG"; exit 0
  fi
  sleep 1
done
echo "Kafka did not become ready in 60s. Tail of $LOG:"; tail -30 "$LOG"; exit 1
