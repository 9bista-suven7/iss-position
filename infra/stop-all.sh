#!/usr/bin/env bash
# Stops everything start-all.sh started, in reverse order.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

for name in gateway ingest; do
  pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null && echo "$name stopped"
    rm -f "$pidfile"
  fi
done

"$INFRA_DIR/stop-flink.sh"
"$INFRA_DIR/stop-kafka.sh"
echo "All components stopped."
