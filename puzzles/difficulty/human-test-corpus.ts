// The network's human test puzzles (graphs-human-labels.jsonl, split "test") as human-corpus rows,
// so human-menus.ts can list their menus (MENUS_CORPUS). The human corpus leaves these puzzles out
// (human-corpus.ts keeps them out of training), and every corpus puzzle the network has a record for
// is on its training side; scoring the network as the ceiling for code v2 (net_ceiling.py) needs
// puzzles it never trained on. Spec and order as human-corpus.ts reads Janko's: janko.ts's readers.
//
//   node --no-warnings puzzles/difficulty/human-test-corpus.ts → references/ml/human-test-corpus/<genre>.jsonl
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JANKO_DIR, JANKO_TYPES, READERS, REFS_DIR } from "./janko.ts";

const OUT = `${REFS_DIR}ml/human-test-corpus/`;
const folders = new Map(Object.entries(JANKO_TYPES).map(([type, v]) => [v.folder, type]));
const rows = new Map<string, string[]>();
for (const line of readFileSync(`${REFS_DIR}ml/graphs-human-labels.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const d = JSON.parse(line), m = /^janko ([^/]+)\/(.+)\.txt$/.exec(d.name);
  if (d.split !== "test" || !m || !folders.has(m[1])) continue;
  const type = folders.get(m[1])!, file = `${JANKO_DIR}${m[1]}/${m[2]}.txt`;
  if (!existsSync(file)) continue;
  const j = READERS[type](file);
  if (!j?.moves) continue;
  const genre = j.spec.genre ?? JANKO_TYPES[type].genre;
  const out = rows.get(genre) ?? rows.set(genre, []).get(genre)!;
  out.push(JSON.stringify({ key: d.name, genre, spec: j.spec, ids: [`janko:${m[1]}/${m[2]}`], solver: j.solver, humanOrder: [...j.settled].sort((a, b) => a[1] - b[1]) }));
}
mkdirSync(OUT, { recursive: true });
for (const [genre, out] of rows) { writeFileSync(`${OUT}${genre}.jsonl`, out.join("\n") + "\n"); console.log(`${genre}: ${out.length}`); }
