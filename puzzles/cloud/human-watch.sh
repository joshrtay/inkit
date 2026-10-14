#!/bin/bash
# Keep a sharded human-corpus run going (run-human-job.sh --corpus): every 10 minutes, a shard whose
# VM Google reclaimed (spot) and that hasn't written results/<run>/shard-k/done is made again in
# another zone, carrying on from its synced cache (resume=<run>, the same run, so it writes to the
# same shard folder). Stops at the run's end, or when every shard is done.
#
#   puzzles/cloud/human-watch.sh references/ml/<run>.txt [hours=3] [vCPUs=32] [max side=20]
LOG=$1
HOURS=${2:-3}
CPUS=${3:-32}
MAXSIDE=${4:-20}
DIR=$(dirname "$0")
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
RUN=$(basename "$LOG" .txt)
STAMP=${RUN#human-}
START=$(date -j -f "%Y%m%d-%H%M" "$STAMP" +%s 2>/dev/null || date -d "${STAMP:0:8} ${STAMP:9:2}:${STAMP:11:2}" +%s)
END=$((START + HOURS * 3600 - 30 * 60))   # no relaunch in the last half hour
N=$(awk '{print $NF}' "$LOG" | sort -n | tail -1); N=$((N + 1))
while [ "$(date +%s)" -lt "$END" ]; do
  sleep 600
  LIVE=$(gcloud compute instances list --filter="name~^$RUN-" --format="value(name,status)" 2>/dev/null)
  ALLDONE=1
  for K in $(seq 0 $((N - 1))); do
    gcloud storage ls "gs://inkit-research-ml/results/$RUN/shard-$K/done" > /dev/null 2>&1 && continue
    ALLDONE=0
    # the shard's latest VM (a relaunch adds -r, -r-r, ...)
    NAME=$(awk -v k="$K" '$NF == k && $2 != "FAILED" {print $1}' "$LOG" | tail -1)
    if [ -n "$NAME" ] && echo "$LIVE" | grep -Eq "^$NAME[[:space:]]+(RUNNING|PROVISIONING|STAGING)"; then continue; fi
    LEFT=$(( (END + 30 * 60 - $(date +%s) + 3599) / 3600 )); [ "$LEFT" -lt 1 ] && LEFT=1
    SUFFIX=$(echo "${NAME:-$RUN-s$K}" | sed -E "s/^$RUN-s$K//")-r
    REGION=$(awk -v k="$K" '$NF == k && $2 != "FAILED" {print $2}' "$LOG" | tail -1 | sed -E 's/-[a-z]$//'); REGION=${REGION:-us-central1}
    if HUMAN_RUN=$RUN HUMAN_NO_UPLOAD=1 HUMAN_ONLY=$K HUMAN_SUFFIX=$SUFFIX \
       "$DIR/run-human-job.sh" --corpus "$N" "$CPUS" "$LEFT" "$MAXSIDE" "$REGION" "$RUN" > /tmp/human-watch.txt 2>&1; then
      echo "$(date +%H:%M) shard $K: $(grep -E "^$RUN-s$K" /tmp/human-watch.txt | tail -1)"
    fi
  done
  [ $ALLDONE = 1 ] && { echo "every shard done"; break; }
done
echo "human watch ended"
