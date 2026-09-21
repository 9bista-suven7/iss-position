#!/usr/bin/env bash
# Builds (if needed) and submits the Flink pipeline job.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

JAR="$PROJECT_ROOT/flink-jobs/target/iss-flink-pipeline-1.0.0.jar"
OBSERVER_LAT="${OBSERVER_LAT:-28.5729}"   # Kennedy Space Center
OBSERVER_LON="${OBSERVER_LON:--80.6490}"

if [ ! -f "$JAR" ]; then
  echo "==> Building job jar"
  (cd "$PROJECT_ROOT/flink-jobs" && mvn -q package -DskipTests)
fi

# Cancel any previous run so resubmitting is idempotent.
RUNNING="$(curl -s "http://$FLINK_REST/jobs" \
  | python3 -c "import sys,json;j=[x['id'] for x in json.load(sys.stdin)['jobs'] if x['status']=='RUNNING'];print(' '.join(j))" 2>/dev/null || true)"
for id in $RUNNING; do
  echo "==> Cancelling previous job $id"
  "$FLINK_HOME/bin/flink" cancel -m "$FLINK_REST" "$id" >/dev/null 2>&1 || true
done

echo "==> Submitting pipeline (observer ${OBSERVER_LAT}, ${OBSERVER_LON})"
"$FLINK_HOME/bin/flink" run -d -m "$FLINK_REST" "$JAR" \
  --bootstrap "$KAFKA_BOOTSTRAP" \
  --observer-lat "$OBSERVER_LAT" \
  --observer-lon "$OBSERVER_LON"

echo "  dashboard: http://$FLINK_REST"
