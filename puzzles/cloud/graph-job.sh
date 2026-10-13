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
    GRAPH_LR_SCALE=$(meta lrscale || echo 0) GRAPH_H=$h GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_EPOCHS=16 GRAPH_TAG=w$h python3 puzzles/difficulty/graph_policy.py all --attention > results/scale/width-$h.txt 2>&1
    gcloud storage cp results/scale/width-$h.txt "$BUCKET/results/$RUN/scale/"
  done
fi
if [[ " $STEPS " == *" curve "* ]]; then
  # the learning curve: the attention network at width 64 (8 heads, positions, learning rate
  # scaled) trained on the corpus plus 0, 100, 10, 25 and 50% of the generated set (nested; the
  # ends first, so a short run still has them), each scored on the per-type split, the human test
  # set, agreement with people and held-out generated puzzles. 7 epochs at 4 states a generated
  # puzzle: about 3¼ hours for all five (the same epochs for every share, so more data is also
  # more steps). Partial results go to the bucket every two minutes; a share starts only if its
  # estimated time fits before 3 h 50 min (the VM is deleted at 4 h)
  mkdir -p results/curve
  ( set +x; while sleep 120; do
      gcloud storage cp -q results/curve/*.txt "$BUCKET/results/$RUN/curve/"
      gcloud storage cp -q /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"
    done ) &
  SYNC=$!
  EPOCHS=$(meta epochs || echo 7); PER=$(meta statesper || echo 4)
  for share in $(meta shares || echo "0 1 0.1 0.25 0.5"); do
    # minutes: about 4 for loading and scoring, 2.2 an epoch for the corpus, 7.2 an epoch for all
    # the generated set at 4 states a puzzle (from the scale step's 130 s an epoch on 18.6M mark-states)
    est=$(awk -v s="$share" -v e="$EPOCHS" -v p="$PER" 'BEGIN { print int(60 * (4 + e * (2.2 + 7.2 * s * p / 4))) }')
    if [ $((SECONDS + est)) -gt 13800 ]; then echo "skipping share $share (about $((est / 60)) min): out of time"; continue; fi
    GRAPH_DATA=/work/references/ml/graphs.jsonl,/work/references/ml/graphs-scale.jsonl,/work/references/ml/graphs-gen.jsonl \
      GRAPH_GEN_SHARE=$share GRAPH_STATES_PER=$PER GRAPH_EPOCHS=$EPOCHS GRAPH_LR_SCALE=1 GRAPH_H=64 GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_TAG=curve-$share \
      python3 puzzles/difficulty/graph_policy.py all --attention > results/curve/share-$share.txt 2>&1
    gcloud storage cp results/curve/share-$share.txt references/ml/graph-policy-attention-curve-$share.pt "$BUCKET/results/$RUN/curve/"
  done
  kill $SYNC
fi
if [[ " $STEPS " == *" embed "* ]]; then
  python3 puzzles/difficulty/graph_policy.py embed > results/embed.txt 2>&1
  gcloud storage cp results/embed.txt references/ml/move-embedding.npz "$BUCKET/results/$RUN/"
fi
