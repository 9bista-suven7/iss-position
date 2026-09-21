#!/usr/bin/env bash
# Creates every topic the pipeline needs. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

# Position/enriched streams are keyed by a single craft, so 1 partition keeps
# strict global ordering. Telemetry is keyed per channel and can fan out.
declare -A PARTITIONS=(
  ["$TOPIC_POSITION_RAW"]=1
  ["$TOPIC_POSITION_ENRICHED"]=1
  ["$TOPIC_ORBIT_EVENTS"]=1
  ["$TOPIC_METRICS_WINDOWED"]=1
  ["$TOPIC_ALERTS"]=1
  ["$TOPIC_TELEMETRY_RAW"]=3
  ["$TOPIC_TELEMETRY_STATS"]=3
)

for t in "${ALL_TOPICS[@]}"; do
  p="${PARTITIONS[$t]:-1}"
  if "$KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server "$KAFKA_BOOTSTRAP" \
       --describe --topic "$t" >/dev/null 2>&1; then
    echo "  exists: $t"
  else
    "$KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server "$KAFKA_BOOTSTRAP" \
      --create --topic "$t" --partitions "$p" --replication-factor 1 \
      --config retention.ms=21600000 >/dev/null
    echo "  created: $t ($p partition(s))"
  fi
done
echo "Topics ready."
