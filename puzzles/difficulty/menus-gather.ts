// Gather human-menus.ts's rows from every run into references/proof-menus/<genre>.jsonl, one row a
// puzzle, and re-flag the person's next marks the puzzle already settled (`known`). Rows written
// before 2026-10-16 lack that flag, so their misses and choices count marks the grounding settled
// (Easy as ABC's most); the flag is recomputed for every row from a setup-only solve (cheap: the
// grounding and the givens' own cells, no steps).
//
// The dirs are read in order; for one puzzle, a row with menus beats a capped or failed one, and
// among rows with menus a later dir's wins (put the newest run last).
//
//   gcloud storage rsync -r gs://inkit-research-ml/results/<run> <dir>   (for each run)
//   DEDUCE_JOBS=4 node --no-warnings puzzles/difficulty/menus-gather.ts <dir> … [--out dir]
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { deduceGuarded } from "./deduce-guarded.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const argv = process.argv.slice(2), oi = argv.indexOf("--out");
const OUT = oi >= 0 ? argv[oi + 1] : `${REFS_DIR}proof-menus/`, CORPUS = `${REFS_DIR}ml/human-corpus/`;
const dirs = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? files(p) : p.endsWith(".jsonl") && f !== "misses.jsonl" ? [p] : []; });

// one row a puzzle, by genre; kept as text (the menus are large) with what the choice needs
const best = new Map<string, Map<string, { line: string; ok: boolean }>>();
for (const d of dirs) for (const f of files(d)) {
  const genre = f.split("/").pop()!.slice(0, -6);
  const rows = best.get(genre) ?? best.set(genre, new Map()).get(genre)!;
  for await (const line of createInterface({ input: createReadStream(f) })) {
    const m = /^\{"id":"([^"]+)"/.exec(line);
    if (!m) continue;
    const ok = line.includes('"positions":'), had = rows.get(m[1]);
    if (!had || ok || !had.ok) rows.set(m[1], { line, ok });
  }
}

mkdirSync(OUT, { recursive: true });
for (const [genre, rows] of [...best.entries()].sort()) {
  const specs = new Map<string, any>();
  if (existsSync(`${CORPUS}${genre}.jsonl`))
    for (const l of readFileSync(`${CORPUS}${genre}.jsonl`, "utf8").split("\n")) if (l.trim()) { const d = JSON.parse(l); if (rows.has(d.key)) specs.set(d.key, d); }
  const out = [...rows.values()];
  let flagged = 0, failed = 0;
  await mapPool(out, async (r) => {
    if (!r.ok) return;
    const row = JSON.parse(r.line), d = specs.get(row.id);
    let initial: string[] | undefined;
    try { initial = d && (await deduceGuarded({ ...d.spec, genre: d.spec.genre ?? genre }, { setupOnly: true }, 120000))?.initial; } catch { /* below */ }
    if (!initial) { failed++; return; }
    const given = new Set(initial.map((x) => x.split("=")[0]));
    for (const p of row.positions) for (const nx of p.next) { if (given.has(nx.mark)) { nx.known = 1; flagged++; } else delete nx.known; }
    r.line = JSON.stringify(row);
  });
  writeFileSync(`${OUT}${genre}.jsonl`, out.map((r) => r.line).join("\n") + "\n");
  console.log(`${genre.padEnd(18)} ${String(out.length).padStart(6)} puzzles, ${String(out.filter((r) => r.ok).length).padStart(6)} with menus, ${flagged} next marks known${failed ? `, ${failed} not re-flagged` : ""}`);
}
