#!/bin/bash
# GPU job for the cross-type graph network (puzzles/difficulty/graph_policy.py), run at boot on a
# Google Cloud VM made by puzzles/cloud/run-graph-job.sh: fetch code and data from the bucket,
# train on every type, the held-out types, the move embedding; upload results and the log; shut
# down. The VM also has a hard time limit, after which Google deletes it.
BUCKET=gs://inkit-research-ml
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run)
STEPS=$(meta steps || echo "all holdout embed")   # which steps to run
MODEL=$(meta model || true)                        # a run whose trained network to use (without "all")
FAMILIES=$(meta families || true)                  # for "grid": the families to leave out (default all six)
exec > /var/log/graph-job.log 2>&1
set -x
finish() { gcloud storage cp /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"; shutdown -h now; }
trap finish EXIT
mkdir -p /work/references/ml /work/results && cd /work
gcloud storage cp -r "$BUCKET/code/*" /work/
gcloud storage cp "$BUCKET/data/*.jsonl" /work/references/ml/
python3 -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '-')"
export GRAPH_DATA=/work/references/ml/graphs.jsonl,/work/references/ml/graphs-scale.jsonl
[ -n "$MODEL" ] && gcloud storage cp "$BUCKET/results/$MODEL/graph-policy.pt" references/ml/
if [[ " $STEPS " == *" all "* ]]; then
  python3 puzzles/difficulty/graph_policy.py all > results/all.txt 2>&1
  gcloud storage cp results/all.txt references/ml/graph-policy.pt "$BUCKET/results/$RUN/"
fi
[[ " $STEPS " == *" holdout "* ]] && for t in star-battle akari slitherlink sudoku nurikabe; do
  python3 puzzles/difficulty/graph_policy.py holdout $t 2>&1 | grep "^| [a-z]" >> results/holdout.txt
  gcloud storage cp results/holdout.txt "$BUCKET/results/$RUN/"
done
# every version of the network (base, attention, pretrain, both) × each family left out in turn;
# partial results go to the bucket every two minutes, and no run starts after 3½ hours
if [[ " $STEPS " == *" grid "* ]]; then
  mkdir -p results/grid
  ( set +x; while sleep 120; do
      gcloud storage cp -q results/grid.txt results/grid/*.md results/grid/*.txt "$BUCKET/results/$RUN/grid/"
      gcloud storage cp -q /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"
    done ) &
  SYNC=$!
  GRID_OUT=/work/results/grid GRID_DEADLINE=$((12600 - SECONDS)) python3 puzzles/difficulty/graph_policy.py grid $FAMILIES > results/grid.txt 2>&1
  kill $SYNC
  gcloud storage cp results/grid.txt results/grid/* "$BUCKET/results/$RUN/grid/"
fi
if [[ " $STEPS " == *" scale "* ]]; then
  # does a bigger network help? the attention network at widths 64, 128, 256 (8 heads, each cell's
  # position as input, 16 epochs); each trained on every type, scored per type. No new width
  # starts after 3.3 hours, so the VM's 4-hour limit doesn't cut one off half-trained
  mkdir -p results/scale
  for h in 64 128 256; do
    [ $SECONDS -gt 11900 ] && echo "skipping width $h: out of time" && break
    GRAPH_H=$h GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_EPOCHS=16 GRAPH_TAG=w$h python3 puzzles/difficulty/graph_policy.py all --attention > results/scale/width-$h.txt 2>&1
    gcloud storage cp results/scale/width-$h.txt "$BUCKET/results/$RUN/scale/"
  done
fi
if [[ " $STEPS " == *" embed "* ]]; then
  python3 puzzles/difficulty/graph_policy.py embed > results/embed.txt 2>&1
  gcloud storage cp results/embed.txt references/ml/move-embedding.npz "$BUCKET/results/$RUN/"
fi
