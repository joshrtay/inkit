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
if [[ " $STEPS " == *" embed "* ]]; then
  python3 puzzles/difficulty/graph_policy.py embed > results/embed.txt 2>&1
  gcloud storage cp results/embed.txt references/ml/move-embedding.npz "$BUCKET/results/$RUN/"
fi
