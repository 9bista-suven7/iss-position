#!/usr/bin/env bash
# One-shot health check across every component.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

check() { printf '  %-18s %s\n' "$1" "$2"; }

echo "Component status"
if "$KAFKA_HOME/bin/kafka-broker-api-versions.sh" --bootstrap-server "$KAFKA_BOOTSTRAP" >/dev/null 2>&1; then
  check "Kafka" "up  ($KAFKA_BOOTSTRAP)"
else
  check "Kafka" "DOWN"
fi

if curl -sf "http://$FLINK_REST/overview" >/dev/null 2>&1; then
  jobs=$(curl -s "http://$FLINK_REST/jobs/overview" | python3 -c "
import sys,json
js=json.load(sys.stdin)['jobs']
r=[j for j in js if j['state']=='RUNNING']
print(f\"{len(r)} running, {r[0]['tasks']['running'] if r else 0} tasks\")" 2>/dev/null)
  check "Flink" "up  ($jobs)  http://$FLINK_REST"
else
  check "Flink" "DOWN"
fi

for svc in "ingest:7301" "gateway:7300"; do
  name="${svc%%:*}"; port="${svc##*:}"
  if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
    check "$name" "up  (http://localhost:$port/health)"
  else
    check "$name" "DOWN"
  fi
done

echo
echo "Topic offsets"
for t in "${ALL_TOPICS[@]}"; do
  n=$("$KAFKA_HOME/bin/kafka-get-offsets.sh" --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --topic "$t" 2>/dev/null | awk -F: '{s+=$3} END {print s+0}')
  printf '  %-26s %s\n' "$t" "${n:-0}"
done
