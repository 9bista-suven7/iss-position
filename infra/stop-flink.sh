#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
[ -d "$FLINK_HOME" ] && "$FLINK_HOME/bin/stop-cluster.sh" >/dev/null 2>&1 || true
echo "Flink stopped."
