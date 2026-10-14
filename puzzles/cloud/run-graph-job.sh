#!/bin/bash
# Launch the graph network's GPU job (graph-job.sh) on Google Cloud: one L4 (g2-standard-8) in
# project inkit-research, us-central1, Google's PyTorch image with NVIDIA drivers. Code and data
# must be in gs://inkit-research-ml (code/, data/); results come back to results/<run>/. The VM
# shuts itself down when done and is deleted by Google after 4 hours at most.
#
#   puzzles/cloud/run-graph-job.sh [zone] [steps] [model run] [families]
#
# steps: any of "all holdout embed grid scale structure curve next" (default the first three); model run: an earlier run whose
# trained network to use when "all" isn't among them, e.g. run-graph-job.sh us-central1-a embed
# graph-20261012-2218; families: for grid, the families to leave out (graph_policy.py FAMILIES;
# default all six), e.g. run-graph-job.sh us-central1-b grid "" "lines-loops counting"
#
# curve: the learning curve (data/graphs-gen.jsonl and data/graphs-human.jsonl must be in the
# bucket); CURVE_WIDTH (default 128), CURVE_STATES_PER (states per generated puzzle, default 4),
# CURVE_SHARES (default "1 0.1 0.5 0.25", the ends first) and CURVE_EPOCHS (default: the same
# training time for every share, the corpus's 16 epochs) change it, e.g. run-graph-job.sh us-central1-a curve
#
# next: the next big run (width 256, structure, the corpus plus the generated set plus the human
# training set; data/graphs-gen.jsonl, graphs-human.jsonl and graphs-human-train.jsonl must be in
# the bucket, the last from run-human-job.sh); NEXT_WIDTH (256), NEXT_STATES_PER (3), NEXT_WEIGHT
# (the human training set's loss weight, 2) and NEXT_EPOCHS (8, fewer if time runs short) change
# it, e.g. run-graph-job.sh us-central1-a next
#
# The network's code (graph_policy.py, structure.py and signatures.ts) is uploaded first, so the job runs this
# checkout's.
set -e
ZONE=${1:-us-central1-a}
RUN=graph-$(date +%Y%m%d-%H%M)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
gcloud storage cp "$ROOT/puzzles/difficulty/graph_policy.py" "$ROOT/puzzles/difficulty/structure.py" "$ROOT/puzzles/difficulty/signatures.ts" gs://inkit-research-ml/code/puzzles/difficulty/
META="run=$RUN,steps=${2:-all holdout embed},model=${3:-},families=${4:-},lrscale=${GRAPH_LR_SCALE:-0}"
[ -n "${CURVE_EPOCHS:-}" ] && META="$META,epochs=$CURVE_EPOCHS"
[ -n "${CURVE_WIDTH:-}" ] && META="$META,width=$CURVE_WIDTH"
[ -n "${CURVE_STATES_PER:-}" ] && META="$META,statesper=$CURVE_STATES_PER"
[ -n "${CURVE_SHARES:-}" ] && META="$META,shares=$CURVE_SHARES"
[ -n "${NEXT_WIDTH:-}" ] && META="$META,nextwidth=$NEXT_WIDTH"
[ -n "${NEXT_STATES_PER:-}" ] && META="$META,nextstatesper=$NEXT_STATES_PER"
[ -n "${NEXT_WEIGHT:-}" ] && META="$META,nextweight=$NEXT_WEIGHT"
[ -n "${NEXT_EPOCHS:-}" ] && META="$META,nextepochs=$NEXT_EPOCHS"
gcloud compute instances create "$RUN" --project inkit-research --zone "$ZONE" \
  --machine-type g2-standard-8 --accelerator type=nvidia-l4,count=1 --maintenance-policy TERMINATE \
  --image-family pytorch-2-9-cu129-ubuntu-2204-nvidia-580 --image-project deeplearning-platform-release \
  --boot-disk-size 100GB --scopes storage-rw,logging-write \
  --max-run-duration 4h --instance-termination-action DELETE \
  --metadata "$META" --metadata-from-file startup-script="$(dirname "$0")/graph-job.sh"
echo "$RUN"
