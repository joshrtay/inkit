#!/bin/bash
# Launch the generation fleet (docs/generation-plan.md): 15 spot n2-highcpu-32 VMs for 4 hours,
# five in each of us-central1, us-east4 and us-west4, each with its own arms (genre, size, band)
# so no two make the same puzzle. Uploads the code once, then makes each VM through
# run-gen-job.sh, trying the region's other zones on a stockout. Writes the run names to
# references/ml/gen-fleet-<stamp>.txt (local only); gather them afterwards from the bucket.
#
#   puzzles/cloud/run-gen-fleet.sh [hours=4] [per=2000] [only these names, e.g. "hard-a big-g"]
#   GEN_PLAN=human puzzles/cloud/run-gen-fleet.sh ...    the human-like plan (HUMAN_FLEET below)
#
# The human-like plan (docs/generation-plan.md, "A human-like run"): 16 VMs, 512 vCPUs (the whole
# CPU quota: six in us-central1, five in each of us-east4 and us-west4), weighted toward the sizes
# and settings of hand-made puzzles (10 × 10, 2-star Star Battle, Easy as ABC with more letters),
# with gen-set.ts GEN_HUMAN (symmetric clue layouts by the targets' shares, extra jobs toward the
# human family mix, quotas by the targets' size shares) and the best break-in of HUMAN_BREAKIN
# candidates at hard and expert. Its names start "h-" (gen-fleet-watch.sh relaunches them the same
# way). With the GPU VM up (8 vCPUs), leave one VM out (ONLY) to stay inside the quota.
set -e
HOURS=${1:-4}
PER=${2:-2000}
ONLY=${3:-}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAMP=$(date +%Y%m%d-%H%M)
LOG="$ROOT/references/ml/gen-fleet-$STAMP.txt"

# name | region | bands | genres (gen-set.ts GEN_GENRES: genre:sizes[:bands[:settings]], sizes,
# bands and settings joined by +). The hard and medium groups are balanced by the first batch's CPU time per attempt.
HUMAN_BREAKIN=2
HUMAN_FLEET="
h-sudoku|us-central1|hard,expert|sudoku:9
h-slither-h|us-central1|hard|slitherlink:10
h-slither-x|us-central1|expert|slitherlink:10
h-stars|us-central1|hard|star-battle:10::stars=2
h-stars-1|us-central1|hard,expert|star-battle:10
h-loops-h|us-central1|hard|masyu:10,cave:10
h-loops-x|us-east4|expert|masyu:10,cave:10
h-regions|us-east4|hard,expert|nurikabe:8:expert,hitori:8:expert,shikaku:8
h-reach-a|us-east4|hard,expert|spiral-galaxies:7:hard,hidoku:6,fillomino:6:hard+expert
h-reach-b|us-east4|hard,expert|fill-in:6,minesweeper:8:expert,simple-path:7,numberlink:7:hard
h-latin|us-east4|hard,expert|skyscrapers:6+7:hard,easy-as-abc:6::letters=4,easy-as-abc:7::letters=5
h-loops-8|us-west4|hard,expert|slitherlink:8,masyu:8,cave:8
h-medium-a|us-west4|medium|sudoku:9,slitherlink:10,masyu:10,cave:10
h-medium-b|us-west4|medium|star-battle:10::stars=2,akari:10,minesweeper:8,skyscrapers:6+7,easy-as-abc:6::letters=4,easy-as-abc:7::letters=5
h-medium-c|us-west4|medium|hidoku:6,spiral-galaxies:7,fill-in:6,simple-path:7
h-easy|us-west4|easy|sudoku:9,akari:10,slitherlink:10,masyu:10,cave:10,star-battle:10::stars=2,skyscrapers:6+7,easy-as-abc:6::letters=4,easy-as-abc:7::letters=5,minesweeper:8,hidoku:6,fill-in:6,simple-path:7
"
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

if [ "${GEN_PLAN:-}" = human ]; then FLEET=$HUMAN_FLEET; export GEN_HUMAN=1 GEN_BREAKIN=$HUMAN_BREAKIN; fi

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
