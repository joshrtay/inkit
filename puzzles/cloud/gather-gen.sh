#!/bin/bash
# Gather a generation fleet's results (run-gen-fleet.sh, gen-fleet-watch.sh): copy every run's
# generated/*.jsonl and graphs-gen.jsonl from the bucket (relaunches carry on from their
# originals, so a puzzle can be in both), keep each puzzle once (by its key; training records by
# name), write them together, summarise by genre and band, and delete the fleet's stopped VMs
# (a run that finishes shuts its VM down, which keeps its disk). Local only, under references/ml.
#
#   puzzles/cloud/gather-gen.sh references/ml/gen-fleet-<stamp>.txt [more runs ...]
set -e
LOG=$1; shift
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAMP=$(basename "$LOG" .txt | sed 's/gen-fleet-//')
OUT="$ROOT/references/ml/gen-fleet-$STAMP"
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
mkdir -p "$OUT/runs"
for RUN in $(awk '{print $1}' "$LOG" | sort -u) "$@"; do
  mkdir -p "$OUT/runs/$RUN"
  gcloud storage cp -r "gs://inkit-research-ml/results/$RUN/generated" "gs://inkit-research-ml/results/$RUN/graphs-gen.jsonl" "$OUT/runs/$RUN/" > /dev/null 2>&1 || echo "$RUN: nothing synced"
done
python3 - "$OUT" <<'EOF'
import json, os, sys, glob, collections
out = sys.argv[1]
seen, by_genre, graphs, gseen = set(), collections.defaultdict(list), [], set()
for f in sorted(glob.glob(f"{out}/runs/*/generated/*.jsonl")):
    if f.endswith("attempts.jsonl"): continue
    for line in open(f):
        if not line.strip(): continue
        r = json.loads(line)
        if r["key"] in seen: continue
        seen.add(r["key"]); by_genre[r["genre"]].append(line.strip())
for f in sorted(glob.glob(f"{out}/runs/*/graphs-gen.jsonl")):
    for line in open(f):
        if not line.strip(): continue
        name = json.loads(line)["name"]
        if name in gseen: continue
        gseen.add(name); graphs.append(line.strip())
os.makedirs(f"{out}/generated", exist_ok=True)
for g, rows in by_genre.items(): open(f"{out}/generated/{g}.jsonl", "w").write("\n".join(rows) + "\n")
open(f"{out}/graphs-gen.jsonl", "w").write("\n".join(graphs) + "\n")
bands = collections.Counter(); table = collections.defaultdict(collections.Counter)
for g, rows in by_genre.items():
    for l in rows: b = json.loads(l)["band"]; bands[b] += 1; table[g][b] += 1
print(f"{len(seen)} puzzles ({len(graphs)} training records): " + ", ".join(f"{b} {bands[b]}" for b in ["easy", "medium", "hard", "expert"]))
print("| Genre | easy | medium | hard | expert |\n|---|---|---|---|---|")
for g in sorted(table): print(f"| {g} | " + " | ".join(str(table[g][b]) for b in ["easy", "medium", "hard", "expert"]) + " |")
EOF
# the fleet's stopped VMs
for VM in $(gcloud compute instances list --filter="name~^gen-$STAMP AND status=TERMINATED" --format="value(name,zone.basename())" 2>/dev/null | awk '{print $1":"$2}'); do
  gcloud compute instances delete "${VM%%:*}" --zone "${VM##*:}" --quiet > /dev/null 2>&1 && echo "deleted ${VM%%:*}"
done
