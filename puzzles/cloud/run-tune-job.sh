#!/bin/bash
# Launch opus_human_tune.py's GPU job (tune-job.sh) on Google Cloud: one L4 (g2-standard-8),
# Google's PyTorch image. The network's code goes to code/tune/<run>/ (so other jobs' code isn't
# replaced); the data is read from the private bucket; results land in results/<run>/. The VM
# shuts down when done and is deleted after 4 hours at most. Pass an earlier run to resume it.
#
#   puzzles/cloud/run-tune-job.sh [zone] [run]     (TUNE_LRS, TUNE_EPOCHS as in opus_human_tune.py)
#
# TUNE_SPOT=1: a spot VM (cheaper, and often there when on-demand L4s are sold out; a preempted run
# resumes when launched again with its run). TUNE_GPU=t4: an n1-standard-8 with a T4 instead.
# TUNE_RELATIONS=1: graph_policy.py's GRAPH_RELATIONS inputs (a digit mark's number beside the others).
set -e
ZONE=${1:-us-central1-a}
RUN=${2:-tune-$(date +%Y%m%d-%H%M)}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
gcloud storage cp "$ROOT"/puzzles/difficulty/{graph_policy.py,structure.py,signatures.ts,opus_human_tune.py,hidoku_relations.py} "gs://inkit-research-ml/code/tune/$RUN/puzzles/difficulty/"
gcloud compute instances create "$RUN" --project inkit-research --zone "$ZONE" \
  $([ "${TUNE_GPU:-l4}" = t4 ] && echo "--machine-type n1-standard-8 --accelerator type=nvidia-tesla-t4,count=1" || echo "--machine-type g2-standard-8 --accelerator type=nvidia-l4,count=1") \
  --maintenance-policy TERMINATE ${TUNE_SPOT:+--provisioning-model SPOT} \
  --image-family pytorch-2-9-cu129-ubuntu-2204-nvidia-580 --image-project deeplearning-platform-release \
  --boot-disk-size 100GB --scopes storage-rw,logging-write \
  --max-run-duration 4h --instance-termination-action DELETE \
  --metadata "run=$RUN,lrs=${TUNE_LRS:-3e-4 1e-4},epochs=${TUNE_EPOCHS:-6},relations=${TUNE_RELATIONS:-0}" --metadata-from-file startup-script="$(dirname "$0")/tune-job.sh"
echo "$RUN"
