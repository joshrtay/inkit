#!/bin/bash
# Launch the graph network's GPU job (graph-job.sh) on Google Cloud: one L4 (g2-standard-8) in
# project inkit-research, us-central1, Google's PyTorch image with NVIDIA drivers. Code and data
# must be in gs://inkit-research-ml (code/, data/); results come back to results/<run>/. The VM
# shuts itself down when done and is deleted by Google after 4 hours at most.
#
#   puzzles/cloud/run-graph-job.sh [zone]
set -e
ZONE=${1:-us-central1-a}
RUN=graph-$(date +%Y%m%d-%H%M)
gcloud compute instances create "$RUN" --project inkit-research --zone "$ZONE" \
  --machine-type g2-standard-8 --accelerator type=nvidia-l4,count=1 --maintenance-policy TERMINATE \
  --image-family pytorch-2-9-cu129-ubuntu-2204-nvidia-580 --image-project deeplearning-platform-release \
  --boot-disk-size 100GB --scopes storage-rw,logging-write \
  --max-run-duration 4h --instance-termination-action DELETE \
  --metadata run="$RUN" --metadata-from-file startup-script="$(dirname "$0")/graph-job.sh"
echo "$RUN"
