#!/bin/bash
# CPU job building the human training set (puzzles/difficulty/graph-human.ts --train →
# graphs-human-train.jsonl), run at boot on a spot VM made by puzzles/cloud/run-human-job.sh:
# install Node, fetch the code from the bucket, the raw Janko and Puzzle Square JP files from its
# private path (private/janko, private/psjp; never published) and the human test set
# (data/graphs-human.jsonl, whose puzzles are left out); solve every puzzle on every CPU, copying the
# solve cache and the file so far to the bucket every five minutes; shut down. A finished build is
# also copied to data/, where the GPU job (graph-job.sh, step next) reads it; one cut short (time
# limit or preempted) stays in results/<run>/, and a new run carries on from it (metadata
# resume=<earlier run>). Then the human-labelled records (graph-human-labels.ts → graphs-human-labels
# .jsonl: no solving, a few minutes), whose solverFinished this build's solves fill in, to
# results/<run>/ and data/. The code comes from the private path (private/code), as does Puzzle
# Square JP's from links (private/psjp-links, psjp-links.ts), which the training set includes.
BUCKET=gs://inkit-research-ml
NODE=v22.22.2
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run)
HOURS=$(meta hours || echo 4)            # the VM's time limit (max-run-duration)
MAX=$(meta max || echo 15)               # largest board side
RESUME=$(meta resume || true)            # an earlier run to carry on from
OUT=$BUCKET/results/$RUN
exec > /var/log/human-job.log 2>&1
set -x
finish() {
  gcloud storage cp /var/log/human-job.log "$OUT/job.log"
  shutdown -h now
}
trap finish EXIT

# Node 22 (it runs the TypeScript directly) and clingo-wasm, the only package the job needs
mkdir -p /opt/node /opt/deps /work
curl -fsSL "https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.gz" | tar -xz -C /opt/node --strip-components=1
export PATH=/opt/node/bin:$PATH
node --version
(cd /opt/deps && npm init -y > /dev/null && npm install --no-audit --no-fund clingo-wasm@0.6.0)

cd /work
gcloud storage cp -r "$BUCKET/private/code/src" "$BUCKET/private/code/puzzles" "$BUCKET/private/code/package.json" /work/
ln -s /opt/deps/node_modules /work/node_modules
mkdir -p references/ml/human-cache
gcloud storage cp -r "$BUCKET/private/janko" "$BUCKET/private/psjp" references/
gcloud storage cp -r "$BUCKET/private/psjp-links" references/ || true
gcloud storage cp "$BUCKET/data/graphs-human.jsonl" references/ml/
[ -n "$RESUME" ] && { gcloud storage rsync -q "$BUCKET/results/$RESUME/human-cache" references/ml/human-cache || true; }

sync_out() {
  gcloud storage rsync -q references/ml/human-cache "$OUT/human-cache"
  gcloud storage cp -q references/ml/graphs-human-train.jsonl "$OUT/" 2>/dev/null
  gcloud storage cp -q /var/log/human-job.log "$OUT/job.log"
}
( set +x; while sleep 300; do sync_out; done ) &
SYNC=$!

# every CPU, as memory allows (a solve peaks near 0.85 GB; n2-highcpu has 1 GB per vCPU); stopped
# 10 minutes before the limit (a solve is killed at 2 minutes), so the last copy always happens.
# --no-skip: every puzzle is tried, even of types the solver rarely finishes (Nurikabe, Numberlink)
LIMIT=$((HOURS * 3600 - SECONDS))
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
JOBS=$(nproc); [ $((MEM_MB / 1100)) -lt "$JOBS" ] && JOBS=$((MEM_MB / 1100))
DEDUCE_JOBS=$JOBS timeout $((LIMIT - 600)) node puzzles/difficulty/graph-human.ts --train --no-skip --max "$MAX" > build.txt 2> build.log
STATUS=$?
kill $SYNC
# the file from the cache (also after a cut-short run), with the per-type table and the leakage line
node puzzles/difficulty/graph-human.ts --train --max "$MAX" --write >> build.txt 2> summary.md
cat summary.md
sync_out
gcloud storage cp build.txt build.log summary.md "$OUT/"
if [ $STATUS -eq 0 ]; then
  gcloud storage cp references/ml/graphs-human-train.jsonl "$BUCKET/data/"
else
  echo "cut short (status $STATUS): graphs-human-train.jsonl not copied to data/; carry on with resume=$RUN"
fi
# the human-labelled records: no solver, so always (the solves so far say which our solver finished)
DEDUCE_JOBS=$JOBS node puzzles/difficulty/graph-human-labels.ts --max "$MAX" > labels.md 2> labels.log && {
  cat labels.md
  gcloud storage cp references/ml/graphs-human-labels.jsonl labels.md labels.log "$OUT/"
  gcloud storage cp references/ml/graphs-human-labels.jsonl "$BUCKET/data/"
}
