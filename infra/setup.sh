#!/usr/bin/env bash
# Extracts and configures the Kafka (KRaft) + Flink local cluster.
# Safe to re-run: it skips work that is already done.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

KAFKA_TGZ="$DIST_DIR/kafka_${KAFKA_SCALA}-${KAFKA_VERSION}.tgz"
FLINK_TGZ="$DIST_DIR/flink-${FLINK_VERSION}-bin-scala_2.12.tgz"
KAFKA_URL="https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/kafka_${KAFKA_SCALA}-${KAFKA_VERSION}.tgz"
FLINK_URL="https://archive.apache.org/dist/flink/flink-${FLINK_VERSION}/flink-${FLINK_VERSION}-bin-scala_2.12.tgz"

fetch() { # url dest
  [ -s "$2" ] && { echo "  already downloaded: $(basename "$2")"; return; }
  echo "  downloading $(basename "$2") ..."
  curl -sSL --retry 3 -o "$2" "$1"
}

echo "==> Fetching distributions"
fetch "$KAFKA_URL" "$KAFKA_TGZ"
fetch "$FLINK_URL" "$FLINK_TGZ"

echo "==> Extracting"
[ -d "$KAFKA_HOME" ] || tar -xzf "$KAFKA_TGZ" -C "$DIST_DIR"
[ -d "$FLINK_HOME" ] || tar -xzf "$FLINK_TGZ" -C "$DIST_DIR"
echo "  KAFKA_HOME=$KAFKA_HOME"
echo "  FLINK_HOME=$FLINK_HOME"

echo "==> Writing Kafka KRaft config"
KAFKA_DATA="$RUN_DIR/kafka-data"
mkdir -p "$KAFKA_DATA"
cat > "$KAFKA_HOME/config/iss-kraft.properties" <<EOF
# Single-node KRaft broker+controller for the ISS pipeline (no ZooKeeper).
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@localhost:9093
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
inter.broker.listener.name=PLAINTEXT
advertised.listeners=PLAINTEXT://localhost:9092
controller.listener.names=CONTROLLER
listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
log.dirs=$KAFKA_DATA
num.partitions=3
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
# Telemetry is high-volume and only interesting while fresh.
log.retention.hours=6
log.segment.bytes=134217728
auto.create.topics.enable=false
EOF

if [ ! -f "$KAFKA_DATA/meta.properties" ]; then
  echo "==> Formatting Kafka storage (one time)"
  CLUSTER_ID="$("$KAFKA_HOME/bin/kafka-storage.sh" random-uuid)"
  echo "$CLUSTER_ID" > "$RUN_DIR/cluster-id"
  "$KAFKA_HOME/bin/kafka-storage.sh" format \
    -t "$CLUSTER_ID" -c "$KAFKA_HOME/config/iss-kraft.properties" >/dev/null
  echo "  cluster id: $CLUSTER_ID"
else
  echo "==> Kafka storage already formatted"
fi

echo "==> Configuring Flink for Java 17 + local run"
FLINK_CONF="$FLINK_HOME/conf/config.yaml"
[ -f "$FLINK_CONF" ] || FLINK_CONF="$FLINK_HOME/conf/flink-conf.yaml"
if [ ! -f "$FLINK_CONF.orig" ]; then cp "$FLINK_CONF" "$FLINK_CONF.orig"; fi

if [[ "$FLINK_CONF" == *config.yaml ]]; then
  cat > "$FLINK_CONF" <<'EOF'
jobmanager:
  rpc:
    address: localhost
    port: 6123
  memory:
    process:
      size: 1600m
  bind-host: localhost
  execution:
    failover-strategy: region
taskmanager:
  bind-host: localhost
  host: localhost
  memory:
    process:
      size: 2048m
  numberOfTaskSlots: 4
parallelism:
  default: 2
rest:
  address: localhost
  bind-address: 0.0.0.0
  port: 8081
env:
  java:
    opts:
      all: --add-exports=java.base/sun.net.util=ALL-UNNAMED --add-exports=java.rmi/sun.rmi.registry=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.net=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.nio=ALL-UNNAMED --add-opens=java.base/sun.nio.ch=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED --add-opens=java.base/java.text=ALL-UNNAMED --add-opens=java.base/java.time=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.util.concurrent=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.locks=ALL-UNNAMED
execution:
  checkpointing:
    interval: 30s
    mode: EXACTLY_ONCE
state:
  backend:
    type: hashmap
EOF
else
  cat > "$FLINK_CONF" <<EOF
jobmanager.rpc.address: localhost
jobmanager.rpc.port: 6123
jobmanager.memory.process.size: 1600m
taskmanager.memory.process.size: 2048m
taskmanager.numberOfTaskSlots: 4
parallelism.default: 2
rest.port: 8181
rest.address: localhost
execution.checkpointing.interval: 30s
state.backend: hashmap
EOF
fi
echo "  wrote $FLINK_CONF"

echo
echo "Setup complete."
echo "  next: ./infra/start-all.sh"
