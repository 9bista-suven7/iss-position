#!/usr/bin/env bash
# Starts a local Flink session cluster (JobManager + TaskManager).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
[ -d "$FLINK_HOME" ] || { echo "Flink not installed. Run ./infra/setup.sh first."; exit 1; }

if curl -sf "http://$FLINK_REST/overview" >/dev/null 2>&1; then
  echo "Flink already running at http://$FLINK_REST"; exit 0
fi

echo "Starting Flink cluster ..."
"$FLINK_HOME/bin/start-cluster.sh" >/dev/null

for i in $(seq 1 60); do
  if curl -sf "http://$FLINK_REST/overview" >/dev/null 2>&1; then
    echo "Flink dashboard: http://$FLINK_REST"
    curl -s "http://$FLINK_REST/overview" | head -c 300; echo
    exit 0
  fi
  sleep 1
done
echo "Flink did not become ready in 60s. Logs in $FLINK_HOME/log/"; exit 1
