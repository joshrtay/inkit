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
  # the learning curve: the attention network (width 128 by default, 8 heads, positions, learning
  # rate scaled) trained on the corpus plus 100, 10, 50 and 25% of the generated set (nested; the
  # ends first, so a short run still has them), each scored on the per-type split, the human test
  # set, agreement with people and held-out generated puzzles. Every share gets the same training
  # time, the size test's 16 epochs of the corpus alone (44 min at width 128), so the curve
  # measures more data, not more steps; its 0% point is the size test (73.5% at 128). At 4 states a
  # generated puzzle, an epoch of all of them is 3.3 corpus epochs, so the epochs are
  # 16 / (1 + 3.3 × share): 12, 9, 6 and 4 for 10, 25, 50 and 100%. About 3.4 hours for the four. Partial results go to
  # the bucket every two minutes; a share starts only if its estimated time fits before 3 h 50 min
  # (the VM is deleted at 4 h)
  mkdir -p results/curve
  ( set +x; while sleep 120; do
      gcloud storage cp -q results/curve/*.txt "$BUCKET/results/$RUN/curve/"
      gcloud storage cp -q /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"
    done ) &
  SYNC=$!
  W=$(meta width || echo 128); PER=$(meta statesper || echo 4); FIXED=$(meta epochs || true)
  # minutes a corpus epoch on the L4 (size test, learning rate scaled: 36, 44 and 81 min for 16)
  C=$(case $W in (64) echo 2.25;; (128) echo 2.75;; (256) echo 5.07;; (*) awk -v w="$W" 'BEGIN { print 5.07 * w / 256 }';; esac)
  for share in $(meta shares || echo "1 0.1 0.5 0.25"); do
    EPOCHS=${FIXED:-$(awk -v s="$share" -v p="$PER" 'BEGIN { e = int(16 / (1 + 0.825 * s * p) + 0.5); print e < 1 ? 1 : e }')}
    # minutes: about 4 for loading and scoring, then the epochs (generated mark-states as fast as the corpus's)
    est=$(awk -v s="$share" -v e="$EPOCHS" -v p="$PER" -v c="$C" 'BEGIN { print int(60 * (4 + e * c * (1 + 0.825 * s * p))) }')
    if [ $((SECONDS + est)) -gt 13800 ]; then echo "skipping share $share (about $((est / 60)) min): out of time"; continue; fi
    GRAPH_DATA=/work/references/ml/graphs.jsonl,/work/references/ml/graphs-scale.jsonl,/work/references/ml/graphs-gen.jsonl \
      GRAPH_GEN_SHARE=$share GRAPH_STATES_PER=$PER GRAPH_EPOCHS=$EPOCHS GRAPH_LR_SCALE=1 GRAPH_H=$W GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_TAG=curve-w$W-$share \
      python3 puzzles/difficulty/graph_policy.py all --attention > results/curve/share-$share.txt 2>&1
    gcloud storage cp results/curve/share-$share.txt references/ml/graph-policy-attention-curve-w$W-$share.pt "$BUCKET/results/$RUN/curve/"
  done
  kill $SYNC
fi
if [[ " $STEPS " == *" structure "* ]]; then
  # the size test's width-128 run (attention, positions, 16 epochs, learning rate scaled) with what
  # a person sees at a glance as input: known groups, their size and ways out, a number's room and
  # reach, line pieces and their ends (structure.py, GRAPH_STRUCTURE=1); results synced as they come
  mkdir -p results/structure
  # the bucket's code must carry the hook (another upload may have replaced it)
  grep -q GRAPH_STRUCTURE puzzles/difficulty/graph_policy.py || { echo "graph_policy.py in the bucket has no GRAPH_STRUCTURE: upload the code again" | tee results/structure/width-128.txt; exit 1; }
  ( set +x; while sleep 120; do
      gcloud storage cp -q results/structure/*.txt "$BUCKET/results/$RUN/structure/"
      gcloud storage cp -q /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"
    done ) &
  SYNC=$!
  python3 puzzles/difficulty/structure.py --selftest > results/structure/selftest.txt 2>&1
  GRAPH_STRUCTURE=1 GRAPH_LR_SCALE=1 GRAPH_H=128 GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_EPOCHS=16 GRAPH_TAG=structure python3 puzzles/difficulty/graph_policy.py all --attention > results/structure/width-128.txt 2>&1
  kill $SYNC
  gcloud storage cp results/structure/*.txt references/ml/graph-policy-attention-structure.pt "$BUCKET/results/$RUN/structure/"
fi
if [[ " $STEPS " == *" next "* ]]; then
  # the next big run: attention at width 256 (8 heads, positions, structure as input, learning rate
  # scaled) on the corpus, the whole generated set (3 states a puzzle) and the human training set
  # (graph-human.ts --train, its loss weighted 2), scored with every measure (per type, key move,
  # human test, agreement with people per type and person, generated by band, families). An epoch
  # is about 22 minutes on the L4 (the corpus's 139,000 training states, 391,000 generated, about
  # 100,000 human ones that cost a third more, each mark-heavy; width 256 with structure about
  # 1.9 ms a state), so 8 epochs; GRAPH_TRAIN_DEADLINE stops before an epoch that wouldn't end in
  # time, so the whole run, loading and scoring included, ends within about 3½ hours.
  # Metadata nextwidth, nextstatesper, nextweight, nextepochs change it (run-graph-job.sh NEXT_*)
  mkdir -p results/next
  W=$(meta nextwidth || echo 256); PER=$(meta nextstatesper || echo 3); HW=$(meta nextweight || echo 2); EPOCHS=$(meta nextepochs || echo 8)
  # nextweight 0: no human training set (the baseline to compare human data against)
  HUMANARGS="GRAPH_HUMAN_TRAIN=/work/references/ml/graphs-human-train.jsonl GRAPH_HUMAN_WEIGHT=$HW"
  [ "$HW" = 0 ] && HUMANARGS=""
  if [ -n "$HUMANARGS" ] && [ ! -s references/ml/graphs-human-train.jsonl ]; then
    echo "no data/graphs-human-train.jsonl in the bucket: build it first (puzzles/cloud/run-human-job.sh)" | tee results/next/all.txt
    gcloud storage cp results/next/all.txt "$BUCKET/results/$RUN/next/"; exit 1
  fi
  grep -q GRAPH_HUMAN_TRAIN puzzles/difficulty/graph_policy.py && grep -q GRAPH_STRUCTURE puzzles/difficulty/graph_policy.py || {
    echo "graph_policy.py in the bucket has no GRAPH_HUMAN_TRAIN or GRAPH_STRUCTURE: upload the code again" | tee results/next/all.txt
    gcloud storage cp results/next/all.txt "$BUCKET/results/$RUN/next/"; exit 1
  }
  ( set +x; while sleep 120; do
      gcloud storage cp -q results/next/*.txt "$BUCKET/results/$RUN/next/"
      gcloud storage cp -q /var/log/graph-job.log "$BUCKET/results/$RUN/job.log"
    done ) &
  SYNC=$!
  python3 puzzles/difficulty/structure.py --selftest > results/next/selftest.txt 2>&1
  # training ends by 3½ hours from boot, less 25 minutes for loading and scoring
  GRAPH_DATA=/work/references/ml/graphs.jsonl,/work/references/ml/graphs-scale.jsonl,/work/references/ml/graphs-gen.jsonl \
    GRAPH_GEN_SHARE=1 GRAPH_STATES_PER=$PER env $HUMANARGS \
    GRAPH_EPOCHS=$EPOCHS GRAPH_TRAIN_DEADLINE=$((12600 - SECONDS - 1500)) GRAPH_STRUCTURE=1 GRAPH_LR_SCALE=1 GRAPH_H=$W GRAPH_HEADS=8 GRAPH_POS=1 GRAPH_TAG=next \
    python3 puzzles/difficulty/graph_policy.py all --attention > results/next/all.txt 2>&1
  kill $SYNC
  gcloud storage cp results/next/*.txt references/ml/graph-policy-attention-next.pt "$BUCKET/results/$RUN/next/"
fi
if [[ " $STEPS " == *" embed "* ]]; then
  python3 puzzles/difficulty/graph_policy.py embed > results/embed.txt 2>&1
  gcloud storage cp results/embed.txt references/ml/move-embedding.npz "$BUCKET/results/$RUN/"
fi
