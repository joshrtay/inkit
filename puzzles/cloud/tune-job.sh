#!/bin/bash
# GPU job for opus_human_tune.py, run at boot on a Google Cloud VM made by run-tune-job.sh: fetch
# the code (code/tune/<run>/) and the private data (the human labels, the human test set, the
# baseline network, opus-human's 400 states), fine-tune, score the 400 states with the baseline
# and the tuned network, upload everything to results/<run>/, shut down. Resumable: a VM started
# again with the same run picks up the checkpoints already in results/<run>/tune/.
BUCKET=gs://inkit-research-ml
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run)
exec > /var/log/tune-job.log 2>&1
set -x
R=$BUCKET/results/$RUN
finish() { gcloud storage cp -r /work/references/ml/opus-human/tune "$R/" ; gcloud storage cp /work/results/* "$R/"; gcloud storage cp /var/log/tune-job.log "$R/job.log"; shutdown -h now; }
trap finish EXIT
mkdir -p /work/references/ml/opus-human /work/references/ml/models /work/results && cd /work
gcloud storage cp -r "$BUCKET/code/tune/$RUN/puzzles" /work/
P=$BUCKET/private/refs/ml
gcloud storage cp "$P/graphs-human-labels.jsonl" "$P/graphs-human.jsonl" references/ml/
gcloud storage cp -r "$P/models/baseline-2026-10-14" references/ml/models/
gcloud storage cp "$P/opus-human/items.json" references/ml/opus-human/
gcloud storage cp -r "$R/tune" references/ml/opus-human/ || true
python3 -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
( set +x; while sleep 120; do
    gcloud storage cp -q -r references/ml/opus-human/tune "$R/"
    gcloud storage cp -q /var/log/tune-job.log "$R/job.log"
  done ) &
SYNC=$!
T=puzzles/difficulty/opus_human_tune.py
[ "$(meta relations)" = 1 ] && export GRAPH_RELATIONS=1
TUNE_LRS="$(meta lrs || echo '3e-4 1e-4')" TUNE_EPOCHS=$(meta epochs || echo 6) TUNE_DEADLINE=$((11400 - SECONDS)) python3 $T train > results/train.txt 2>&1
python3 $T score references/ml/models/baseline-2026-10-14/model.pt results/net-base.jsonl > results/score.txt 2>&1
python3 $T score references/ml/opus-human/tune/best.pt results/net-tuned.jsonl >> results/score.txt 2>&1
python3 $T heldout references/ml/models/baseline-2026-10-14/model.pt references/ml/opus-human/tune/best.pt > results/heldout.txt 2>&1
python3 puzzles/difficulty/hidoku_relations.py score references/ml/opus-human/tune/best.pt > results/digits.txt 2>&1
kill $SYNC
