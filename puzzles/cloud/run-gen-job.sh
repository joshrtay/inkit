#!/bin/bash
# Launch the puzzle generation job (gen-job.sh) on Google Cloud: one spot, CPU-only VM in project
# inkit-research, Debian 12 (Node is installed at boot). It uploads the code first (src/, puzzles/,
# package.json to gs://inkit-research-ml/code/); results come back to results/<run>/. The VM shuts
# itself down when done and is deleted by Google at the time limit, or if it's preempted.
#
#   puzzles/cloud/run-gen-job.sh [vCPUs] [hours] [per] [zone] [family] [resume run]
#
#   vCPUs   16 (default), any n2-highcpu size (2, 4, 8, 16, 32, 48, ...) or, with family c3, a
#           c3-highcpu one (4, 8, 22, 44, ...)
#   hours   the VM's time limit (default 4); no job starts in the last 25 minutes
#   per     puzzles per (genre, size, band) (default 20)
#   family  n2 (default) or c3
#   resume  an earlier run to carry on from (its results are copied in first)
#
# GEN_GENRES and GEN_BANDS in the environment pass through (gen-set.ts's defaults otherwise);
# GEN_RUN names the run, GEN_NO_UPLOAD=1 skips uploading the code.
#
# Quota: 32 vCPUs across all regions, 8 of them taken by the GPU VM, so 24 are free. Spot VMs draw
# on the regular CPU quota (the preemptible quota is 0), so 16 fits beside the GPU VM; 24 is the
# most, and 32 only with the GPU VM gone.
set -e
CPUS=${1:-16}
HOURS=${2:-4}
PER=${3:-20}
ZONE=${4:-us-central1-a}
FAMILY=${5:-n2}
RESUME=${6:-}
RUN=${GEN_RUN:-gen-$(date +%Y%m%d-%H%M)}   # GEN_RUN names it (the fleet launcher does)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# GEN_NO_UPLOAD=1 when the code is already up (the fleet launcher uploads once)
[ -n "${GEN_NO_UPLOAD:-}" ] || gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" gs://inkit-research-ml/code/
gcloud compute instances create "$RUN" --project inkit-research --zone "$ZONE" \
  --machine-type "$FAMILY-highcpu-$CPUS" --provisioning-model SPOT \
  --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
  --scopes storage-rw,logging-write \
  --max-run-duration "${HOURS}h" --instance-termination-action DELETE \
  --metadata "^|^run=$RUN|per=$PER|hours=$HOURS|genres=${GEN_GENRES:-}|bands=${GEN_BANDS:-}|resume=$RESUME" \
  --metadata-from-file startup-script="$(dirname "$0")/gen-job.sh"
echo "$RUN"
