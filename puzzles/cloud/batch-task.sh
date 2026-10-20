#!/bin/bash
# One task of a Google Cloud Batch job made by run-batch.sh: one shard of a resumable research
# script (proof-bulk.ts, human-menus.ts, human-shard.ts, ...). Batch runs it on its own VM with the
# bucket mounted at /mnt/disks/inkit, retries it when Google reclaims a spot VM (exit 50001) and
# when it stops itself at its time limit to carry on (exit 75), so nothing on the Mac watches it.
#
# The script must take --shard k --of N and append one JSON row per finished item to
# references/<OUT>/*.jsonl, skipping ids already there (proof-bulk.ts does). The layout in the
# bucket is run-proof-job.sh's, so gather-proof.sh and gather-batch.sh read either:
#   results/<run>/seed/          rows made before the run (every shard skips them)
#   results/<run>/shard-k/rows/  this shard's own rows, synced every five minutes and at the end
#   results/<run>/shard-k/done   written when the script finished
#
# Environment (set by run-batch.sh): RUN, SCRIPT, OUT, CODE (bucket path of the code snapshot),
# INPUTS ("bucket-path:local-dir ..."), HOURS (one attempt's limit), MEM_PER_JOB (MB), ARGS, and
# any extra variables the script reads (PROOF_CAP, ...). Batch sets BATCH_TASK_INDEX and
# BATCH_TASK_COUNT. The log goes to Cloud Logging, so a task that dies early can still be read:
#   gcloud logging read 'labels.job_uid="<uid>"' --project inkit-research
set -x
B=/mnt/disks/inkit
NODE=v22.22.2
K=$BATCH_TASK_INDEX; N=$BATCH_TASK_COUNT
SOUT=$B/results/$RUN/shard-$K
mkdir -p "$SOUT/rows"
[ -e "$SOUT/done" ] && { echo "shard $K already done"; exit 0; }

W=/work/shard-$K  # its own dir, in case Batch ever puts two tasks on one VM
mkdir -p /opt/node /opt/deps "$W"
[ -x /opt/node/bin/node ] || curl -fsSL "https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.gz" | tar -xz -C /opt/node --strip-components=1
export PATH=/opt/node/bin:$PATH
[ -d /opt/deps/node_modules/clingo-wasm ] || (cd /opt/deps && npm init -y > /dev/null && npm install --no-audit --no-fund clingo-wasm@0.6.0)
cd "$W"
cp -r "$B/$CODE/." "$W/"
ln -sfn /opt/deps/node_modules "$W/node_modules"
for pair in $INPUTS; do mkdir -p "${pair#*:}"; cp -r "$B/${pair%%:*}/." "${pair#*:}/"; done

# what's done: the seed, then this shard's own rows (a retry carries on from them)
mkdir -p "references/$OUT"
[ -d "$B/results/$RUN/seed" ] && cp -r "$B/results/$RUN/seed/." "references/$OUT/"
for f in "$SOUT"/rows/*.jsonl; do [ -e "$f" ] && cat "$f" >> "references/$OUT/$(basename "$f")"; done
for f in "references/$OUT"/*.jsonl; do [ -e "$f" ] && wc -l < "$f" > "$f.seed"; done
mkdir -p mine; cp "$SOUT"/rows/*.jsonl mine/ 2>/dev/null

# this shard's rows = what it had before this attempt plus what this attempt appended
sync_rows() {
  for f in "references/$OUT"/*.jsonl; do
    [ -e "$f" ] || continue
    g=$(basename "$f"); n=$(cat "$f.seed" 2>/dev/null || echo 0)
    { cat "mine/$g" 2>/dev/null; tail -n +$((n + 1)) "$f"; } > "up-$g"
    [ -s "up-$g" ] && cp "up-$g" "$SOUT/rows/$g.tmp" && mv "$SOUT/rows/$g.tmp" "$SOUT/rows/$g"
  done
  [ -f run.log ] && cp run.log "$SOUT/run.log"
  { date; uptime; free -m; } > "$SOUT/load.txt"
}
( set +x; while sleep 300; do sync_rows; done ) &
SYNC=$!

MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
JOBS=$(nproc); [ $((MEM_MB / ${MEM_PER_JOB:-1400})) -lt "$JOBS" ] && JOBS=$((MEM_MB / ${MEM_PER_JOB:-1400}))
# stopped 5 minutes before the attempt's limit, so the last sync happens
DEDUCE_JOBS=$JOBS timeout $((HOURS * 3600 - SECONDS - 300)) \
  node --no-warnings "$SCRIPT" --shard "$K" --of "$N" $ARGS > run.log 2>&1
STATUS=$?
kill $SYNC
sync_rows
tail -20 run.log
if [ $STATUS -eq 0 ]; then echo done > "$SOUT/done"; exit 0; fi
# out of time: ask Batch for another attempt, which carries on from the synced rows
[ $STATUS -eq 124 ] && exit 75
exit $STATUS
