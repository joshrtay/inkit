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
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if [ "${1:-}" = "--upload-private" ]; then
  REFS=$ROOT/references; [ -d "$REFS/janko" ] || REFS=$(cd "$ROOT/../../.." && pwd)/references   # a worktree: the main checkout's
  gcloud storage rsync -r "$REFS/janko" gs://inkit-research-ml/private/janko
  gcloud storage rsync -r "$REFS/psjp" gs://inkit-research-ml/private/psjp
  [ -d "$REFS/psjp-links" ] && gcloud storage rsync -r "$REFS/psjp-links" gs://inkit-research-ml/private/psjp-links
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
