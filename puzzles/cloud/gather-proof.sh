#!/bin/bash
# Bring a proof run's shards (run-proof-job.sh) back into references/proof-bulk/, keeping one row
# per puzzle (a capped row gives way to a finished one), and delete its stopped VMs.
#   puzzles/cloud/gather-proof.sh <run> [proof-bulk | proof-menus]
set -e
RUN=${1:?run}; DIR=${2:-proof-bulk}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
REFS=$ROOT/references; [ -d "$REFS/ml/human-corpus" ] || REFS=$(cd "$ROOT/../../.." && pwd)/references
TMP=$(mktemp -d)
gcloud storage rsync -r -q "gs://inkit-research-ml/results/$RUN" "$TMP" -x '.*seed/.*'
node --no-warnings -e '
const fs = require("fs"), [tmp, out] = process.argv.slice(1);
const files = fs.readdirSync(tmp).filter((d) => d.startsWith("shard-")).flatMap((d) => { const r = `${tmp}/${d}/rows`; return fs.existsSync(r) ? fs.readdirSync(r).map((f) => [f, `${r}/${f}`]) : []; });
const genres = new Set(files.map(([f]) => f));
let added = 0;
for (const g of genres) {
  const local = `${out}/${g}`, rows = new Map();
  const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
  for (const r of read(local)) rows.set(r.id, r);
  for (const [f, p] of files) if (f === g) for (const r of read(p)) { const had = rows.get(r.id); if (!had) added++; if (!had || (had.cap && !r.cap)) rows.set(r.id, r); }
  fs.writeFileSync(local, [...rows.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
}
console.log(`${added} new proofs into ${out}`);
' "$TMP" "$REFS/$DIR"
echo "shards done: $(ls -d "$TMP"/shard-*/done 2>/dev/null | wc -l)"
rm -rf "$TMP"
for name in $(gcloud compute instances list --project inkit-research --filter="name~^$RUN-s AND status=TERMINATED" --format="value(name,zone)" | tr '\t' ':'); do
  gcloud compute instances delete "${name%%:*}" --zone "${name##*:}" --project inkit-research -q
done
