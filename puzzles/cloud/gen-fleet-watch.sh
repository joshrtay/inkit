#!/bin/bash
# Keep a generation fleet going (run-gen-fleet.sh): every 10 minutes, any of its VMs that Google
# reclaimed (spot) before the fleet's end is made again in another zone, carrying on from what it
# had synced (resume=<run>). Stops at the fleet's end.
#
#   puzzles/cloud/gen-fleet-watch.sh references/ml/gen-fleet-<stamp>.txt [hours=4]
LOG=$1
HOURS=${2:-4}
DIR=$(dirname "$0")
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
STAMP=$(basename "$LOG" .txt | sed 's/gen-fleet-//')
START=$(date -j -f "%Y%m%d-%H%M" "$STAMP" +%s 2>/dev/null || date -d "${STAMP:0:8} ${STAMP:9:2}:${STAMP:11:2}" +%s)
END=$((START + HOURS * 3600 - 30 * 60))   # no relaunch in the last half hour
ZONES="a b c f"
while [ "$(date +%s)" -lt "$END" ]; do
  sleep 600
  LIVE=$(gcloud compute instances list --format="value(name)" 2>/dev/null)
  [ -z "$LIVE" ] && continue   # a failed listing isn't a fleet gone
  # the latest run of each VM name (a relaunch adds -r, -rr, ...)
  for RUN in $(awk '{print $1}' "$LOG" | sort -u); do
    grep -q "^$RUN-r " "$LOG" && continue
    echo "$LIVE" | grep -qx "$RUN" && continue
    # finished on its own (every arm done): it wrote its summary
    gcloud storage ls "gs://inkit-research-ml/results/$RUN/summary.md" > /dev/null 2>&1 && continue
    NAME=$(echo "$RUN" | sed -E "s/^gen-$STAMP-//; s/(-r)+$//")
    ROW=$(grep -E "^$NAME\|" "$DIR/run-gen-fleet.sh")
    [ -z "$ROW" ] && continue
    IFS='|' read -r _ REGION BANDS GENRES <<< "$ROW"
    LEFT=$(( (END + 30 * 60 - $(date +%s)) / 3600 )); [ "$LEFT" -lt 1 ] && LEFT=1
    # a zone that just reclaimed it is likely to again: try the others first
    LASTZ=$(awk -v r="$RUN" '$1 == r {print $2}' "$LOG" | tail -1 | sed 's/.*-//')
    for Z in $(echo $ZONES | tr ' ' '\n' | grep -vx "$LASTZ") $LASTZ; do
      if GEN_RUN="$RUN-r" GEN_NO_UPLOAD=1 GEN_GENRES=$GENRES GEN_BANDS=$BANDS \
         "$DIR/run-gen-job.sh" 32 "$LEFT" 2000 "$REGION-$Z" n2 "$RUN" > /tmp/gen-watch.txt 2>&1; then
        echo "$RUN-r $REGION-$Z" >> "$LOG"; echo "$(date +%H:%M) relaunched $RUN as $RUN-r in $REGION-$Z"; break
      fi
    done
  done
done
echo "fleet watch ended"
