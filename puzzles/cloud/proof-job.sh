#!/bin/bash
# One shard of phase 1 by compression's proofs (proof-bulk.ts --shard k --of N), at boot on a spot
# VM made by run-proof-job.sh: install Node, fetch the code, the human corpus and the proofs made
# so far (the run's seed, and this shard's own rows when relaunched), prove the shard's puzzles on
# every CPU as memory allows, syncing the rows to results/<run>/shard-k/ every five minutes and at
# the end, mark it done, shut down.
BUCKET=gs://inkit-research-ml
NODE=v22.22.2
meta() { curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
RUN=$(meta run); SHARD=$(meta shard); OF=$(meta of); HOURS=$(meta hours || echo 3)
SOUT=$BUCKET/results/$RUN/shard-$SHARD
exec > /var/log/proof-job.log 2>&1
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
mkdir -p references/ml/human-corpus references/proof-bulk
gcloud storage rsync -q "$BUCKET/private/human-corpus" references/ml/human-corpus
# what's done: the seed (all shards' puzzles, skipped by id), then this shard's own rows
gcloud storage rsync -q "$BUCKET/results/$RUN/seed" references/proof-bulk || true
mkdir -p mine
gcloud storage rsync -q "$SOUT/rows" mine || true
for f in mine/*.jsonl; do [ -e "$f" ] && cat "$f" >> "references/proof-bulk/$(basename "$f")"; done
# from here on, new rows also go to mine/ (the seed stays out of this shard's upload)
for f in references/proof-bulk/*.jsonl; do wc -l < "$f" > "$f.seed"; done
sync_rows() {
  for f in references/proof-bulk/*.jsonl; do
    n=$(cat "$f.seed" 2>/dev/null || echo 0)
    tail -n +$((n + 1)) "$f" > "mine/new-$(basename "$f")"
    cat "mine/$(basename "$f")" "mine/new-$(basename "$f")" 2>/dev/null > "mine/all-$(basename "$f")"
  done
  mkdir -p up; for f in mine/all-*.jsonl; do [ -s "$f" ] && cp "$f" "up/${f#mine/all-}"; done
  gcloud storage rsync -q up "$SOUT/rows"
  gcloud storage cp -q /var/log/proof-job.log "$SOUT/job.log"
}
( set +x; while sleep 300; do sync_rows; done ) &
SYNC=$!
LIMIT=$((HOURS * 3600 - SECONDS))
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
JOBS=$(nproc); [ $((MEM_MB / 1400)) -lt "$JOBS" ] && JOBS=$((MEM_MB / 1400))
# stopped 5 minutes before the limit (a proof is killed at 60 s), so the last copy happens
PROOF_CAP=60000 DEDUCE_JOBS=$JOBS timeout $((LIMIT - 300)) \
  node --no-warnings puzzles/difficulty/proof-bulk.ts --shard "$SHARD" --of "$OF" > run.log 2>&1
STATUS=$?
kill $SYNC
sync_rows
gcloud storage cp run.log "$SOUT/"
[ $STATUS -eq 0 ] && { echo done > done.txt; gcloud storage cp done.txt "$SOUT/done"; }
exit 0
