#!/bin/bash
# See a sharded human-corpus run through to the end, detached from any session: keep its shards
# going (human-watch.sh relaunches reclaimed spot VMs), wait until every shard has written its done
# marker or no VM of the run is left, then gather (gather-human.sh: the training file, the status
# file, the counts; uploads to data/ and deletes stopped VMs). A failed gcloud listing (an expired
# login) just waits. Log: references/ml/<run>-finish.log.
#
#   nohup puzzles/cloud/human-finish.sh <run> [hours=3] > /dev/null 2>&1 &
RUN=$1; HOURS=${2:-3}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
LOG=$ROOT/references/ml/$RUN-finish.log
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
exec >> "$LOG" 2>&1
echo "$(date '+%F %H:%M') finishing $RUN (pid $$)"
"$(dirname "$0")/human-watch.sh" "$ROOT/references/ml/$RUN.txt" "$HOURS" 32 20 &
WATCH=$!
while true; do
  sleep 300
  if ! L=$(gcloud compute instances list --format="value(name)" 2>/dev/null); then echo "$(date +%H:%M) gcloud unavailable (login?), waiting"; continue; fi
  done=0; for k in 0 1 2 3 4 5 6 7; do gcloud storage ls "gs://inkit-research-ml/results/$RUN/shard-$k/done" > /dev/null 2>&1 && done=$((done + 1)); done
  echo "$(date +%H:%M) $done of 8 shards done"
  [ "$done" = 8 ] && break
  echo "$L" | grep -q "^$RUN" || { echo "$(date +%H:%M) no VMs left with $done of 8 done"; break; }
done
kill $WATCH 2>/dev/null
echo "$(date +%H:%M) gathering"
"$(dirname "$0")/gather-human.sh" "$RUN"
echo "$(date +%H:%M) finished"
