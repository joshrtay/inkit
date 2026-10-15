#!/bin/bash
# Phase 1 by compression's proofs at scale (puzzles/difficulty/proof-bulk.ts) on Google Cloud:
# the human corpus sharded over N spot CPU VMs (proof-job.sh at boot). It uploads the code
# (src/, puzzles/, package.json to gs://inkit-research-ml/private/code/), the corpus
# (private/human-corpus) and the proofs already made locally (references/proof-bulk →
# results/<run>/seed, so no puzzle is solved twice). Each shard syncs its rows to
# results/<run>/shard-k/ every five minutes; gather-proof.sh brings them back. Spot VMs that are
# reclaimed are relaunched with PROOF_ONLY="k …" and resume=<run>: they carry on from their rows.
#
#   [PROOF_JOB=menus] puzzles/cloud/run-proof-job.sh [VMs=8] [vCPUs=32] [hours=3] [region=us-central1] [resume run]
#
# About 34,400 puzzles; on the Mac a puzzle took about 21 s of one core, a vCPU here about half a
# core, so about 400 VM-hours of vCPU: 8 × 32 vCPUs for under 2 hours, a few dollars on spot.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
N=${1:-8}; CPUS=${2:-32}; HOURS=${3:-3}; REGION=${4:-us-central1}; RESUME=${5:-}
JOB=${PROOF_JOB:-bulk}   # bulk, or menus (human-menus.ts: the menus along people's solves)
OUT=proof-bulk; [ "$JOB" = menus ] && OUT=proof-menus
RUN=${PROOF_RUN:-$JOB-$(date +%Y%m%d-%H%M)}
REFS=$ROOT/references; [ -d "$REFS/ml/human-corpus" ] || REFS=$(cd "$ROOT/../../.." && pwd)/references
LOG=$REFS/ml/$RUN.txt
if [ -z "${PROOF_NO_UPLOAD:-}" ]; then
  gcloud storage rsync -r -q "$REFS/ml/human-corpus" gs://inkit-research-ml/private/human-corpus
  gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" gs://inkit-research-ml/private/code/
  [ -d "$REFS/$OUT" ] && gcloud storage rsync -q -x 'run\..*' "$REFS/$OUT" "gs://inkit-research-ml/results/$RUN/seed"
fi
for K in $(seq 0 $((N - 1))); do
  [ -n "${PROOF_ONLY:-}" ] && [[ " $PROOF_ONLY " != *" $K "* ]] && continue
  NAME=$RUN-s$K${PROOF_SUFFIX:-}
  made=""
  for Z in ${PROOF_ZONES:-a b c f}; do
    if gcloud compute instances create "$NAME" --project inkit-research --zone "$REGION-$Z" \
      --machine-type "n2-highcpu-$CPUS" --provisioning-model SPOT \
      --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
      --scopes storage-rw,logging-write \
      --max-run-duration "${HOURS}h" --instance-termination-action DELETE \
      --metadata "^|^run=${RESUME:-$RUN}|shard=$K|of=$N|hours=$HOURS|job=$JOB" \
      --metadata-from-file startup-script="$(dirname "$0")/proof-job.sh" > /tmp/proof-create-$K.txt 2>&1; then
      made="$REGION-$Z"; break
    fi
  done
  if [ -n "$made" ]; then echo "$NAME $made $K" | tee -a "$LOG"
  else echo "$NAME FAILED $K" | tee -a "$LOG"; grep -iE 'error|stockout|quota' /tmp/proof-create-$K.txt | head -1; fi
done
echo "${RESUME:-$RUN}: VMs in $LOG"
