#!/usr/bin/env bash
# Shared configuration for the ISS streaming stack.
# Sourced by every script in infra/ — edit versions/ports here only.

KAFKA_VERSION="3.9.2"
KAFKA_SCALA="2.13"
FLINK_VERSION="1.20.5"

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$INFRA_DIR/.." && pwd)"
DIST_DIR="$INFRA_DIR/dist"
RUN_DIR="$INFRA_DIR/run"

KAFKA_HOME="$DIST_DIR/kafka_${KAFKA_SCALA}-${KAFKA_VERSION}"
FLINK_HOME="$DIST_DIR/flink-${FLINK_VERSION}"

KAFKA_BOOTSTRAP="localhost:9092"
FLINK_REST="localhost:8181"

# Topics: raw ingest -> Flink -> enriched/derived
TOPIC_POSITION_RAW="iss.position.raw"
TOPIC_TELEMETRY_RAW="iss.telemetry.raw"
TOPIC_POSITION_ENRICHED="iss.position.enriched"
TOPIC_METRICS_WINDOWED="iss.metrics.windowed"
TOPIC_ORBIT_EVENTS="iss.orbit.events"
TOPIC_ALERTS="iss.alerts"
TOPIC_TELEMETRY_STATS="iss.telemetry.stats"

ALL_TOPICS=(
  "$TOPIC_POSITION_RAW"
  "$TOPIC_TELEMETRY_RAW"
  "$TOPIC_POSITION_ENRICHED"
  "$TOPIC_METRICS_WINDOWED"
  "$TOPIC_ORBIT_EVENTS"
  "$TOPIC_ALERTS"
  "$TOPIC_TELEMETRY_STATS"
)

mkdir -p "$RUN_DIR" "$DIST_DIR"
