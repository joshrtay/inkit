#!/bin/bash
# Gather a sharded human-corpus run (run-human-job.sh --corpus): copy every shard's cache from
# results/<run>/shard-k/cache, merge them into the training file (human-shard.ts --gather:
# references/ml/graphs-human-train.jsonl, human-corpus-status.jsonl, human-corpus-solved.md), copy
# the training file to the bucket's data/ (where the GPU job reads it), and delete the run's stopped
# VMs. Local only, under references/ml.
#
#   puzzles/cloud/gather-human.sh <run> [--no-upload]
set -e
RUN=$1
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
REFS=$ROOT/references; [ -d "$REFS/ml/human-corpus" ] || REFS=$(cd "$ROOT/../../.." && pwd)/references
OUT=$REFS/ml/human-runs/$RUN
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
mkdir -p "$OUT"
DIRS=()
for S in $(gcloud storage ls "gs://inkit-research-ml/results/$RUN/" | grep -o 'shard-[0-9]*' | sort -u); do
  mkdir -p "$OUT/$S/cache"
  gcloud storage rsync -q "gs://inkit-research-ml/results/$RUN/$S/cache" "$OUT/$S/cache" || echo "$S: nothing synced"
  gcloud storage cp "gs://inkit-research-ml/results/$RUN/$S/shard.md" "$OUT/$S/" > /dev/null 2>&1 || true
  DIRS+=("$OUT/$S/cache")
done
(cd "$ROOT" && node --no-warnings puzzles/difficulty/human-shard.ts --gather "${DIRS[@]}")
[ "${2:-}" = "--no-upload" ] || gcloud storage cp "$REFS/ml/graphs-human-train.jsonl" gs://inkit-research-ml/data/
# the run's stopped VMs
for VM in $(gcloud compute instances list --filter="name~^$RUN- AND status=TERMINATED" --format="value(name,zone.basename())" 2>/dev/null | awk '{print $1":"$2}'); do
  gcloud compute instances delete "${VM%%:*}" --zone "${VM##*:}" --quiet > /dev/null 2>&1 && echo "deleted ${VM%%:*}"
done
