#!/bin/bash
# One shard of phase 1 by compression's proofs (proof-bulk.ts --shard k --of N), or of the menus
# along people's solves (human-menus.ts; metadata job=menus), at boot on a spot
# VM made by run-proof-job.sh: install Node, fetch the code, the human corpus and the proofs made
# so far (the run's seed, and this shard's own rows when relaunched), prove the shard's puzzles on
# every CPU as memory allows, syncing the rows to results/<run>/shard-k/ every five minutes and at
# the end, mark it done, shut down.
BUCKET=gs://inkit-research-ml
NODE=v22.22.2
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run); SHARD=$(meta shard); OF=$(meta of); HOURS=$(meta hours || echo 3)
# the job: bulk (proof-bulk.ts → references/proof-bulk) or menus (human-menus.ts → references/proof-menus)
JOB=$(meta job || echo bulk)
# or solver-menus (proof-menus.ts → references/proof-menus-solver: the menus along the solver's proofs)
if [ "$JOB" = menus ]; then OUTDIR=references/proof-menus; SCRIPT=puzzles/difficulty/human-menus.ts
elif [ "$JOB" = solver-menus ]; then OUTDIR=references/proof-menus-solver; SCRIPT=puzzles/difficulty/proof-menus.ts
else OUTDIR=references/proof-bulk; SCRIPT=puzzles/difficulty/proof-bulk.ts; fi
SOUT=$BUCKET/results/$RUN/shard-$SHARD
# also to the serial console, so a VM that never reaches its first sync can still be read
exec > >(tee /var/log/proof-job.log > /dev/ttyS0) 2>&1
set -x
finish() { gcloud storage cp /var/log/proof-job.log "$SOUT/job.log"; shutdown -h now; }
trap finish EXIT

mkdir -p /opt/node /opt/deps /work
curl -fsSL "https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.gz" | tar -xz -C /opt/node --strip-components=1
export PATH=/opt/node/bin:$PATH
(cd /opt/deps && npm init -y > /dev/null && npm install --no-audit --no-fund clingo-wasm@0.6.0)
cd /work
gcloud storage cp -r "$BUCKET/private/code/src" "$BUCKET/private/code/puzzles" "$BUCKET/private/code/package.json" /work/
ln -s /opt/deps/node_modules /work/node_modules
mkdir -p references/ml/human-corpus $OUTDIR
gcloud storage rsync -q "$BUCKET/private/human-corpus" references/ml/human-corpus
# the solver's proofs, which solver-menus follows
[ "$JOB" = solver-menus ] && { mkdir -p references/proof-bulk; gcloud storage rsync -q -x 'run\..*' "$BUCKET/private/refs/proof-bulk" references/proof-bulk; }
# what's done: the seed (all shards' puzzles, skipped by id), then this shard's own rows
gcloud storage rsync -q "$BUCKET/results/$RUN/seed" $OUTDIR || true
mkdir -p mine
gcloud storage rsync -q "$SOUT/rows" mine || true
for f in mine/*.jsonl; do [ -e "$f" ] && cat "$f" >> "$OUTDIR/$(basename "$f")"; done
# from here on, new rows also go to mine/ (the seed stays out of this shard's upload)
for f in $OUTDIR/*.jsonl; do wc -l < "$f" > "$f.seed"; done
sync_rows() {
  for f in $OUTDIR/*.jsonl; do
    n=$(cat "$f.seed" 2>/dev/null || echo 0)
    tail -n +$((n + 1)) "$f" > "mine/new-$(basename "$f")"
    cat "mine/$(basename "$f")" "mine/new-$(basename "$f")" 2>/dev/null > "mine/all-$(basename "$f")"
  done
  mkdir -p up; for f in mine/all-*.jsonl; do [ -s "$f" ] && cp "$f" "up/${f#mine/all-}"; done
  gcloud storage rsync -q up "$SOUT/rows"
  gcloud storage cp -q /var/log/proof-job.log "$SOUT/job.log"
  [ -f run.log ] && gcloud storage cp -q run.log "$SOUT/run.log"
  { date; uptime; free -m; } > load.txt; gcloud storage cp -q load.txt "$SOUT/load.txt"
}
( set +x; while sleep 300; do sync_rows; done ) &
# health on the serial console every minute (memory, load, the job's progress)
( set +x; while sleep 60; do echo "HEALTH $(date -u +%H:%M) $(uptime | sed 's/.*load/load/') $(free -m | awk '/Mem/ {print "mem used", $3, "of", $2}') rows $(cat $OUTDIR/*.jsonl 2>/dev/null | wc -l)" > /dev/ttyS0; done ) &
SYNC=$!
LIMIT=$((HOURS * 3600 - SECONDS))
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
# a job's memory: 1.4 GB for the proofs; the menus job holds every candidate step of a big board
# (a 10 x 10 Fillomino's grounding alone is near 2.3 GB), so 4 GB. With no swap, running out
# doesn't kill anything: the VM freezes (seen 2026-10-20 at 9 minutes, 22 jobs on 32 GB)
PER=1400; [ "$JOB" != bulk ] && PER=4000
JOBS=$(nproc); [ $((MEM_MB / PER)) -lt "$JOBS" ] && JOBS=$((MEM_MB / PER))
# stopped 5 minutes before the limit (a proof is killed at 60 s), so the last copy happens
PROOF_CAP=60000 DEDUCE_JOBS=$JOBS timeout $((LIMIT - 300)) \
  node --no-warnings "$SCRIPT" --shard "$SHARD" --of "$OF" > run.log 2>&1
STATUS=$?
kill $SYNC
sync_rows
gcloud storage cp run.log "$SOUT/"
[ $STATUS -eq 0 ] && { echo done > done.txt; gcloud storage cp done.txt "$SOUT/done"; }
exit 0
