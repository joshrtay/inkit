#!/bin/bash
# Launch the generation fleet (docs/generation-plan.md): 15 spot n2-highcpu-32 VMs for 4 hours,
# five in each of us-central1, us-east4 and us-west4, each with its own arms (genre, size, band)
# so no two make the same puzzle. Uploads the code once, then makes each VM through
# run-gen-job.sh, trying the region's other zones on a stockout. Writes the run names to
# references/ml/gen-fleet-<stamp>.txt (local only); gather them afterwards from the bucket.
#
#   puzzles/cloud/run-gen-fleet.sh [hours=4] [per=2000] [only these names, e.g. "hard-a big-g"]
set -e
HOURS=${1:-4}
PER=${2:-2000}
ONLY=${3:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAMP=$(date +%Y%m%d-%H%M)
LOG="$ROOT/references/ml/gen-fleet-$STAMP.txt"

# name | region | bands | genres (gen-set.ts GEN_GENRES: genre:sizes[:bands], sizes and bands
# joined by +). The hard and medium groups are balanced by the first batch's CPU time per attempt.
FLEET="
hard-a|us-central1|hard|sudoku:9
hard-b|us-central1|hard|irregular-sudoku:6
hard-c|us-central1|hard|hidoku:5,thermo-sudoku:6,aquarium:6
hard-d|us-central1|hard|akari:7+10,masyu:6,fill-in:5
hard-e|us-central1|hard|star-battle:6+8,slitherlink:5+6,binary-puzzle:6,minesweeper:6
hard-f|us-east4|hard|skyscrapers:5+6,wittgenstein-briquet:6,cave:6,easy-as-abc:5,spiral-galaxies:6,simple-loop:6,simple-path:6
big-g|us-east4|hard,expert|slitherlink:7+8,masyu:8,cave:7
big-h|us-east4|hard|star-battle:10,akari:12,skyscrapers:7
expert-i|us-east4|expert|nurikabe:6,hitori:6,square-jam:6
expert-j|us-east4|expert|slitherlink:5+6,masyu:6,simple-loop:6,cave:6,wittgenstein-briquet:6,spiral-galaxies:6,simple-path:6
medium-k|us-west4|medium|sudoku:9,hidoku:5,fill-in:5,minesweeper:6
medium-l|us-west4|medium|skyscrapers:5+6,akari:7+10,slitherlink:5+6,simple-path:6,aquarium:6
medium-m|us-west4|medium|star-battle:6+8,thermo-sudoku:6,irregular-sudoku:6,masyu:6,binary-puzzle:6,simple-loop:6,cave:6,spiral-galaxies:6,wittgenstein-briquet:6,easy-as-abc:5
easy-n|us-west4|easy,medium|sudoku:9,irregular-sudoku:6,thermo-sudoku:6,skyscrapers:5+6,easy-as-abc:5,akari:7+10,slitherlink:5+6,masyu:6,simple-loop:6
easy-o|us-west4|easy,medium|simple-path:6,cave:6,aquarium:6,minesweeper:6,wittgenstein-briquet:6,binary-puzzle:6,star-battle:6+8,spiral-galaxies:6,hidoku:5,fill-in:5
"

export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud storage cp -r "$ROOT/src" "$ROOT/puzzles" "$ROOT/package.json" gs://inkit-research-ml/code/
mkdir -p "$(dirname "$LOG")"
echo "$FLEET" | while IFS='|' read -r NAME REGION BANDS GENRES; do
  [ -z "$NAME" ] && continue
  [ -n "$ONLY" ] && [[ " $ONLY " != *" $NAME "* ]] && continue
  RUN="gen-$STAMP-$NAME"
  made=""
  for Z in a b c f; do
    if GEN_RUN=$RUN GEN_NO_UPLOAD=1 GEN_GENRES=$GENRES GEN_BANDS=$BANDS \
       "$(dirname "$0")/run-gen-job.sh" 32 "$HOURS" "$PER" "$REGION-$Z" > /tmp/gen-fleet-$NAME.txt 2>&1; then
      made="$REGION-$Z"; break
    fi
  done
  if [ -n "$made" ]; then echo "$RUN $made" | tee -a "$LOG"
  else echo "$RUN FAILED: $(grep -iE 'error|stockout|quota' /tmp/gen-fleet-$NAME.txt | head -1)" | tee -a "$LOG"; fi
done
echo "runs in $LOG"
