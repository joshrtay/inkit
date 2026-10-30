#!/bin/bash
# Bring a Batch run's shards (run-batch.sh) back into references/<out dir>/, one row per id (or key, as
# solver-speed.ts's rows have; a capped row gives way to a finished one), and copy the merged rows to the bucket's
# data/<run>/ so any session can read them without the shards. Safe to run while the job is still
# going: it takes what has synced so far.
#   puzzles/cloud/gather-batch.sh <run> <out dir> [--no-upload]
set -e
RUN=${1:?run}; DIR=${2:?out dir}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
REFS=${REFS_DIR:-$ROOT/references}; REFS=${REFS%/}
mkdir -p "$REFS/$DIR"
TMP=$(mktemp -d)
gcloud storage rsync -r -q -x '.*seed/.*' "gs://inkit-research-ml/results/$RUN" "$TMP"
node --no-warnings -e '
const fs = require("fs"), [tmp, out] = process.argv.slice(1);
const files = fs.readdirSync(tmp).filter((d) => d.startsWith("shard-")).flatMap((d) => { const r = `${tmp}/${d}/rows`; return fs.existsSync(r) ? fs.readdirSync(r).filter((f) => f.endsWith(".jsonl")).map((f) => [f, `${r}/${f}`]) : []; });
const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
let added = 0;
const idOf = (r) => r.id ?? r.key;
for (const g of new Set(files.map(([f]) => f))) {
  const local = `${out}/${g}`, rows = new Map();
  for (const r of read(local)) rows.set(idOf(r), r);
  for (const [f, p] of files) if (f === g) for (const r of read(p)) { const had = rows.get(idOf(r)); if (!had) added++; if (!had || (had.cap && !r.cap)) rows.set(idOf(r), r); }
  fs.writeFileSync(local, [...rows.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
}
console.log(`${added} new rows into ${out}`);
' "$TMP" "$REFS/$DIR"
echo "shards done: $(ls -d "$TMP"/shard-*/done 2>/dev/null | wc -l) of $(ls -d "$TMP"/shard-* 2>/dev/null | wc -l)"
rm -rf "$TMP"
[ "${3:-}" = "--no-upload" ] || gcloud storage rsync -q -x '.*\.seed$' "$REFS/$DIR" "gs://inkit-research-ml/data/$RUN"
