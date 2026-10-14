#!/bin/bash
# CPU job for generating puzzles that afford techniques (puzzles/difficulty/gen-set.ts), run at boot
# on a spot VM made by puzzles/cloud/run-gen-job.sh: install Node, fetch the code from the bucket,
# run gen-set.ts on every CPU, copy partial results to the bucket every five minutes, then the
# shortlist (gen-best.ts), the summary and the log; shut down. Google deletes the VM at its time
# limit, or when it's preempted (spot): results so far are in the bucket, and a new run can carry
# on from them (metadata resume=<earlier run>).
BUCKET=gs://inkit-research-ml
NODE=v22.22.2
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run)
PER=$(meta per || echo 20)              # puzzles per (genre, size, band)
HOURS=$(meta hours || echo 4)            # the VM's time limit (max-run-duration)
GENRES=$(meta genres || true)            # GEN_GENRES, default gen-set.ts's list
BANDS=$(meta bands || true)              # GEN_BANDS, default all
RESUME=$(meta resume || true)            # an earlier run to carry on from
HUMAN=$(meta human || true)              # GEN_HUMAN: aim at human-made puzzles
BREAKIN=$(meta breakin || true)          # GEN_BREAKIN: candidates per hard or expert job
THREAD=$(meta thread || true)            # GEN_THREAD: rank them by break-in and a narrow thread
CAP=$(meta cap || true)                  # GEN_CAP: seconds one job may take (default 600)
OUT=$BUCKET/results/$RUN
exec > /var/log/gen-job.log 2>&1
set -x
finish() {
  gcloud storage cp /var/log/gen-job.log "$OUT/job.log"
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
gcloud storage cp -r "$BUCKET/code/src" "$BUCKET/code/puzzles" "$BUCKET/code/package.json" /work/
ln -s /opt/deps/node_modules /work/node_modules
mkdir -p references/ml/generated
if [ -n "$RESUME" ]; then
  gcloud storage cp "$BUCKET/results/$RESUME/generated/*" references/ml/generated/ || true
  gcloud storage cp "$BUCKET/results/$RESUME/graphs-gen.jsonl" references/ml/ || true
fi

sync_out() {
  gcloud storage rsync -q references/ml/generated "$OUT/generated"
  gcloud storage cp -q references/ml/graphs-gen.jsonl "$OUT/" 2>/dev/null
  gcloud storage cp -q /var/log/gen-job.log "$OUT/job.log"
}
( set +x; while sleep 300; do sync_out; done ) &
SYNC=$!

# every CPU, as memory allows (a job peaks near 0.85 GB: 9×9 Sudoku; n2-highcpu has 1 GB per vCPU,
# so 16 vCPUs run 14 jobs, c3-highcpu's 2 GB one per vCPU); no job starts in the last 25 minutes,
# and the batch is stopped 10 minutes before the limit (a job runs 10 minutes at most; with a
# longer cap, the margins grow with it), so the last copy always happens
LIMIT=$((HOURS * 3600 - SECONDS))
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
JOBS=$(nproc); [ $((MEM_MB / 1100)) -lt "$JOBS" ] && JOBS=$((MEM_MB / 1100))
CAP=${CAP:-600}
export DEDUCE_JOBS=$JOBS GEN_DEADLINE=$((LIMIT - 900 - CAP)) GEN_CAP=$CAP
[ -n "$GENRES" ] && export GEN_GENRES=$GENRES
[ -n "$BANDS" ] && export GEN_BANDS=$BANDS
[ -n "$HUMAN" ] && export GEN_HUMAN=$HUMAN
[ -n "$BREAKIN" ] && export GEN_BREAKIN=$BREAKIN
[ -n "$THREAD" ] && export GEN_THREAD=$THREAD
timeout $((LIMIT - CAP)) node puzzles/difficulty/gen-set.ts "$PER" > summary.md 2> gen.log
tail -5 gen.log
kill $SYNC
node puzzles/difficulty/gen-set.ts --summary > summary.md
node puzzles/difficulty/gen-best.ts
sync_out
gcloud storage cp summary.md gen.log references/ml/shortlist.md references/ml/shortlist.jsonl "$OUT/"
