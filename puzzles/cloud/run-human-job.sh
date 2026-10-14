#!/bin/bash
# Launch the human training set's build (human-job.sh) on Google Cloud: one spot, CPU-only VM in
# project inkit-research, Debian 12 (Node is installed at boot). It uploads the code first (src/,
# puzzles/, package.json to gs://inkit-research-ml/private/code/); the raw Janko and Puzzle Square JP
# files must be in the bucket's private path (--upload-private puts them there: references/janko,
# references/psjp and references/psjp-links to gs://inkit-research-ml/private/; the bucket is
# private to the project, and these files are never published), and the human test set in
# data/graphs-human.jsonl. It also builds the human-labelled records (graph-human-labels.ts), to
# data/graphs-human-labels.jsonl. Results come
# back to results/<run>/, and a finished build to data/graphs-human-train.jsonl. The VM shuts itself
# down when done and is deleted by Google at the time limit, or if it's preempted.
#
#   puzzles/cloud/run-human-job.sh [vCPUs] [hours] [max side] [zone] [resume run]
#   puzzles/cloud/run-human-job.sh --upload-private
#
#   vCPUs   16 (default), any n2-highcpu size (2, 4, 8, 16, 32, ...)
#   hours   the VM's time limit (default 4)
#   max     the largest board side (default 15)
#   resume  an earlier run whose solves to carry on from
#
# About 3,800 puzzles (2,270 Janko, 1,510 Puzzle Square JP). A test of 46 (two of each source and
# type, so the slow types weigh more than in the whole) took 10 CPU-seconds each on the Mac: about
# 10½ CPU-hours, 3½ hours at 3 jobs; a vCPU here is about half a Mac core, so about 1½ hours on 16
# vCPUs (14 solves at a time, as memory allows). The 4-hour limit leaves room; a run cut short
# carries on with resume. Quota: 32 vCPUs in all, 8 of them the GPU VM's.
# Since janko.ts reads fourteen types and psjp-links.ts adds Puzzle Square JP's linked puzzles, it's
# about twice that (about 4,500 Janko, 1,500 Puzzle Square JP and 2,000 from links; Hidoku's and
# Numberlink's solves are slow): 24 vCPUs for 6 hours, or resume.
#
# The merged human corpus (human-corpus.ts → references/ml/human-corpus/), sharded over N spot VMs
# (human-job.sh's corpus mode, human-shard.ts): each takes the puzzles whose key hashes to its
# shard, checks uniqueness and solves, and syncs to results/<run>/shard-k/. human-watch.sh
# relaunches reclaimed shards; gather-human.sh merges them into data/graphs-human-train.jsonl.
#
#   puzzles/cloud/run-human-job.sh --corpus [VMs=8] [vCPUs=32] [hours=3] [max side=20] [region=us-central1] [resume run]
#
# Writes the run's VMs to references/ml/<run>.txt (local only).
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if [ "${1:-}" = "--upload-private" ]; then
  REFS=$ROOT/references; [ -d "$REFS/janko" ] || REFS=$(cd "$ROOT/../../.." && pwd)/references   # a worktree: the main checkout's
  gcloud storage rsync -r "$REFS/janko" gs://inkit-research-ml/private/janko
  gcloud storage rsync -r "$REFS/psjp" gs://inkit-research-ml/private/psjp
  [ -d "$REFS/psjp-links" ] && gcloud storage rsync -r "$REFS/psjp-links" gs://inkit-research-ml/private/psjp-links
  exit
fi
if [ "${1:-}" = "--corpus" ]; then
  N=${2:-8}; CPUS=${3:-32}; HOURS=${4:-3}; MAXSIDE=${5:-20}; REGION=${6:-us-central1}; RESUME=${7:-}
  RUN=${HUMAN_RUN:-human-$(date +%Y%m%d-%H%M)}
  CORPUS=$ROOT/references/ml/human-corpus; [ -d "$CORPUS" ] || CORPUS=$(cd "$ROOT/../../.." && pwd)/references/ml/human-corpus
  LOG=$(dirname "$CORPUS")/$RUN.txt
  if [ -z "${HUMAN_NO_UPLOAD:-}" ]; then
    gcloud storage rsync -r -q "$CORPUS" gs://inkit-research-ml/private/human-corpus
    gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" gs://inkit-research-ml/private/code/
  fi
  for K in $(seq 0 $((N - 1))); do
    [ -n "${HUMAN_ONLY:-}" ] && [[ " $HUMAN_ONLY " != *" $K "* ]] && continue
    NAME=$RUN-s$K${HUMAN_SUFFIX:-}
    made=""
    for Z in ${HUMAN_ZONES:-a b c f}; do
      if gcloud compute instances create "$NAME" --project inkit-research --zone "$REGION-$Z" \
        --machine-type "n2-highcpu-$CPUS" --provisioning-model SPOT \
        --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
        --scopes storage-rw,logging-write \
        --max-run-duration "${HOURS}h" --instance-termination-action DELETE \
        --metadata "^|^run=$RUN|shard=$K|of=$N|hours=$HOURS|maxside=$MAXSIDE|resume=$RESUME" \
        --metadata-from-file startup-script="$(dirname "$0")/human-job.sh" > /tmp/human-create-$K.txt 2>&1; then
        made="$REGION-$Z"; break
      fi
    done
    if [ -n "$made" ]; then echo "$NAME $made $K" | tee -a "$LOG"
    else echo "$NAME FAILED $K" | tee -a "$LOG"; grep -iE 'error|stockout|quota' /tmp/human-create-$K.txt | head -1; fi
  done
  echo "$RUN: VMs in $LOG"
  exit
fi
CPUS=${1:-16}
HOURS=${2:-4}
MAX=${3:-15}
ZONE=${4:-us-central1-a}
RESUME=${5:-}
RUN=human-$(date +%Y%m%d-%H%M)
gcloud storage ls gs://inkit-research-ml/private/janko/ gs://inkit-research-ml/private/psjp/ > /dev/null || { echo "upload the raw files first: $0 --upload-private"; exit 1; }
gcloud storage ls gs://inkit-research-ml/data/graphs-human.jsonl > /dev/null
gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" gs://inkit-research-ml/private/code/
gcloud compute instances create "$RUN" --project inkit-research --zone "$ZONE" \
  --machine-type "n2-highcpu-$CPUS" --provisioning-model SPOT \
  --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
  --scopes storage-rw,logging-write \
  --max-run-duration "${HOURS}h" --instance-termination-action DELETE \
  --metadata "^|^run=$RUN|hours=$HOURS|max=$MAX|resume=$RESUME" \
  --metadata-from-file startup-script="$(dirname "$0")/human-job.sh"
echo "$RUN"
