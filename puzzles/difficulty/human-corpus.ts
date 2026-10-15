// One corpus of human-made puzzles: every source's converted puzzles merged, one record per
// distinct puzzle, every source's labels kept. → references/ml/human-corpus/<genre>.jsonl and
// summary.md (local only; the puzzles are others' and never published)
//
//   node puzzles/difficulty/human-corpus.ts
//
// Sources (whatever exists under references/): Puzzle Square JP (psjp-full/converted, the rated set
// psjp/<type>/<id>.json, psjp-links), puzz.link's database (puzzlink-db/converted), Janko (janko.ts's
// readers over references/janko, janko-full/converted, and puzzlekit/converted, whose puzzles are
// Janko's), Logic Masters (lmd/specs), the LMI Expo (lmi-expo/converted) and Nikoli's 100 Sudoku.
//
// - One record per distinct puzzle: by specKey (graph-data.ts: type, size, givens, areas, rules),
//   joined where the sources say two specs are one puzzle (the same Janko or Puzzle Square JP id,
//   or puzz.link's row naming its Puzzle Square JP id). Within one source id the best reader's spec
//   is kept (janko.ts, then the full crawl, then puzzlekit; psjp-full, then the rated set, then
//   links). The solve confirms it: contentKey (with the solution) merges what specKey kept apart
//   (human-shard.ts --gather).
// - labels: { psjp: {difficulty, likes, solves, user}, puzzlink: {difficulty, difficulty5, solves},
//   lmd: {beauty, difficulty, difficultySource, solvers}, lmi: {...}, janko: {licence, solver},
//   nikoli: {licence} }; with sources, ids, authors and setters (a source's own setter id).
// - Left out: the human test set (graphs-human.jsonl) and the human-labelled test split
//   (graphs-human-labels.jsonl, split "test"), by their source ids and by the specs read back from
//   the files their names point to.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { specKey } from "./graph-data.ts";
import { JANKO_DIR, JANKO_TYPES, READERS, REFS_DIR } from "./janko.ts";

const R = REFS_DIR, out = `${R}ml/human-corpus/`;
const jsonl = (f: string): any[] => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
const dirJsonl = (d: string): any[] => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".jsonl")).sort().flatMap((f) => jsonl(`${d}/${f}`)) : [];
const folderGenre = new Map(Object.values(JANKO_TYPES).map((t) => [t.folder, t.genre]));
const typeOfFolder = new Map(Object.entries(JANKO_TYPES).map(([k, t]) => [t.folder, k]));

/** One source's view of a puzzle. `id` is the source family's own id ("janko:Akari/001",
 *  "psjp:12345"); `rank` orders readers within a family (lower is better). */
interface Item {
  family: string; via: string; id: string; rank: number; genre: string; spec: GridSpec;
  url?: string; author?: string; setter?: string; licence?: string;
  labels: Record<string, Record<string, unknown>>;
  also?: string[];              // other ids the source says are the same puzzle
  solver?: string; humanOrder?: [string, number][];
}
const items: Item[] = [];
const n = (x: any): any => (x === null || x === undefined || x === "" ? undefined : x);

// ---- Janko: janko.ts's readers (with the recorded solver and order), the full crawl, puzzlekit
const jmeta = new Map<string, any>();
for (const m of jsonl(`${R}janko-full/meta.jsonl`)) jmeta.set(`${m.folder}/${m.n}`, m);
const jankoLabels = (id: string, licence?: string) => ({ janko: { licence: n(licence) ?? n(jmeta.get(id)?.licence) ?? null } });
for (const [type, { folder, genre }] of Object.entries(JANKO_TYPES)) {
  const dir = `${JANKO_DIR}${folder}/`;
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
    const j = READERS[type](dir + f);
    if (!j) continue;
    const id = `${folder}/${f.replace(/\.txt$/, "")}`;
    const order = j.moves ? [...j.settled].sort((a, b) => a[1] - b[1]) : undefined;
    items.push({ family: "janko", via: "janko", id: `janko:${id}`, rank: 0, genre: j.spec.genre ?? genre, spec: j.spec,
      url: `https://www.janko.at/Raetsel/${id}.a.htm`, author: n(j.author) ?? jmeta.get(id)?.author, licence: jmeta.get(id)?.licence,
      labels: jankoLabels(id), solver: n(j.solver) as string | undefined, humanOrder: order });
  }
}
for (const d of dirJsonl(`${R}janko-full/converted`))
  items.push({ family: "janko", via: "janko-full", id: `janko:${d.sourceId}`, rank: 1, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), licence: d.licence, labels: jankoLabels(d.sourceId, d.licence), solver: n(d.meta?.solver) as string | undefined });
for (const d of dirJsonl(`${R}puzzlekit/converted`))
  items.push({ family: "janko", via: "puzzlekit", id: `janko:${d.sourceId}`, rank: 2, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), licence: d.licence, labels: jankoLabels(d.sourceId, /^unknown/.test(d.licence) ? undefined : d.licence) });

// ---- Puzzle Square JP: the full crawl, the rated set, the links
const psjpLabels = (difficulty: unknown, likes: unknown, solves: unknown, user: unknown) => ({ psjp: { difficulty: n(difficulty) ?? null, likes: n(likes) ?? null, solves: n(solves) ?? null, user: n(user) ?? null } });
for (const d of dirJsonl(`${R}psjp-full/converted`)) {
  const m = d.meta ?? {};
  items.push({ family: "psjp", via: "psjp-full", id: `psjp:${d.sourceId}`, rank: 0, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), setter: m.user != null ? `psjp:${m.user}` : undefined, licence: d.licence, labels: psjpLabels(m.difficulty, m.favorite_n, m.answered_n, m.user) });
}
if (existsSync(`${R}psjp`))
  for (const type of readdirSync(`${R}psjp`).filter((t) => !t.includes(".") && t !== "scripts").sort())
    for (const f of readdirSync(`${R}psjp/${type}`).filter((x) => /^\d+\.json$/.test(x))) {
      const d = JSON.parse(readFileSync(`${R}psjp/${type}/${f}`, "utf8")), r = d.rating ?? {};
      const genre = d.grid.genre ?? type, id = f.replace(/\.json$/, "");
      items.push({ family: "psjp", via: "psjp-rated", id: `psjp:${id}`, rank: 1, genre, spec: { ...d.grid, genre }, url: `https://puzsq.logicpuzzle.app/puzzle/${id}`, setter: r.author != null ? `psjp:${r.author}` : undefined, labels: psjpLabels(r.difficulty, r.likes, r.solves, r.author) });
    }
for (const d of dirJsonl(`${R}psjp-links`))
  items.push({ family: "psjp", via: "psjp-links", id: `psjp:${d.id}`, rank: 2, genre: d.genre, spec: d.spec, url: `https://puzsq.logicpuzzle.app/puzzle/${d.id}`, setter: d.user != null ? `psjp:${d.user}` : undefined, labels: psjpLabels(d.difficulty, d.favorite_n, d.answered_n, d.user) });

// ---- puzz.link's database (its row may name the Puzzle Square JP id)
// puzz.link's database also indexes computer-made puzzles (its `generated` flag: mostly
// pzvSlitherBot's 1,947 Slitherlink): not human-made, so not in this corpus
let generatedLeftOut = 0;
for (const d of dirJsonl(`${R}puzzlink-db/converted`)) {
  if (d.meta?.generated) { generatedLeftOut++; continue; }
  const m = d.meta ?? {};
  items.push({ family: "puzzlink", via: "puzzlink-db", id: `puzzlink:${d.sourceId}`, rank: 0, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), setter: n(m.sourceName) ? `puzzlink:${m.sourceName}` : undefined, licence: d.licence,
    labels: { puzzlink: { difficulty: n(m.difficulty) ?? null, difficulty5: n(m.difficulty5) ?? null, solves: n(m.solves) ?? null } },
    also: m.psjp?.id != null ? [`psjp:${m.psjp.id}`] : undefined });
}
// ---- Logic Masters, the LMI Expo, Nikoli
for (const d of dirJsonl(`${R}lmd/specs`))
  items.push({ family: "lmd", via: "lmd", id: `lmd:${d.sourceId}`, rank: 0, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), setter: n(d.author) ? `lmd:${d.author}` : undefined, licence: d.licence,
    labels: { lmd: { beauty: n(d.beauty) ?? null, difficulty: n(d.difficulty) ?? null, difficultySource: n(d.difficultySource) ?? null, solvers: n(d.solvers) ?? null, watchers: n(d.watchers) ?? null } } });
for (const d of dirJsonl(`${R}lmi-expo/converted`))
  items.push({ family: "lmi", via: "lmi-expo", id: `lmi:${d.sourceId}`, rank: 0, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), setter: n(d.author) ? `lmi:${d.author}` : undefined, licence: d.licence, labels: { lmi: { ...(d.meta ?? {}) } } });
for (const d of dirJsonl(`${R}nikoli-100/converted`))
  items.push({ family: "nikoli", via: "nikoli-100", id: `nikoli:${d.sourceId}`, rank: 0, genre: d.genre, spec: d.spec, url: d.url, author: n(d.author), licence: d.licence, labels: { nikoli: { licence: d.licence } } });

// ---- the test sets: by id, and by the spec read back from the file each name points to
const testIds = new Set<string>(), testSpecs = new Set<string>();
const testNames: string[] = [];
for (const d of jsonl(`${R}ml/graphs-human.jsonl`)) testNames.push(d.name);
for (const d of jsonl(`${R}ml/graphs-human-labels.jsonl`)) if (d.split === "test") testNames.push(d.name);
for (const name of testNames) {
  let m = /^janko ([^/]+)\/(.+)\.txt$/.exec(name);
  if (m) {
    testIds.add(`janko:${m[1]}/${m[2]}`);
    const type = typeOfFolder.get(m[1]), file = `${JANKO_DIR}${m[1]}/${m[2]}.txt`;
    const j = type && existsSync(file) ? READERS[type](file) : null;
    if (j) testSpecs.add(specKey(j.spec, j.spec.genre ?? folderGenre.get(m[1])));
    continue;
  }
  m = /^psjp ([^/]+)\/(\d+)\.json$/.exec(name);
  if (m) {
    testIds.add(`psjp:${m[2]}`);
    const file = `${R}psjp/${m[1]}/${m[2]}.json`;
    if (existsSync(file)) { const d = JSON.parse(readFileSync(file, "utf8")); const genre = d.grid.genre ?? m[1]; testSpecs.add(specKey({ ...d.grid, genre }, genre)); }
  }
}

// ---- within one source id, the best reader's spec; the others are kept as labels only
const byId = new Map<string, Item[]>();
for (const it of items) { const l = byId.get(it.id) ?? []; l.push(it); byId.set(it.id, l); }
let idSpecsDiffer = 0;
const keyOf = new Map<Item, string>();
for (const list of byId.values()) {
  list.sort((a, b) => a.rank - b.rank);
  const best = specKey(list[0].spec, list[0].genre);
  if (list.some((x) => specKey(x.spec, x.genre) !== best)) idSpecsDiffer++;
  for (const x of list) keyOf.set(x, best);
}
// ---- union: one puzzle = spec keys joined by shared ids and the sources' cross-references
const parent = new Map<string, string>();
const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(k, r); return r; };
const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
const union = (a: string, b: string) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
const idKey = new Map<string, string>();
for (const [it, k] of keyOf) { add(k); idKey.set(it.id, k); }
for (const it of items) for (const o of it.also ?? []) if (idKey.has(o)) union(idKey.get(o)!, keyOf.get(it)!);

interface Rec {
  key: string; genre: string; spec: GridSpec; specKeys: string[];
  sources: string[]; ids: string[]; via: string[]; urls: string[]; authors: string[]; setters: string[]; licences: string[];
  labels: Record<string, Record<string, unknown>>; solver?: string; humanOrder?: [string, number][];
}
const FAMILY_ORDER = ["janko", "psjp", "puzzlink", "lmd", "lmi", "nikoli"];
const groups = new Map<string, Item[]>();
for (const it of items) { const r = find(keyOf.get(it)!); const l = groups.get(r) ?? []; l.push(it); groups.set(r, l); }
const recs: Rec[] = [];
const dropped = { byId: 0, bySpec: 0, genreClash: 0 };
const uniq = <T,>(xs: (T | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== undefined && x !== null && x !== ""))];
for (const list of groups.values()) {
  const keys = uniq(list.map((x) => keyOf.get(x)!));
  if (list.some((x) => testIds.has(x.id))) { dropped.byId++; continue; }
  if (keys.some((k) => testSpecs.has(k)) || list.some((x) => testSpecs.has(specKey(x.spec, x.genre)))) { dropped.bySpec++; continue; }
  // the spec to solve: the best family's best reader
  const lead = [...list].sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.rank - b.rank)[0];
  if (new Set(list.map((x) => x.genre)).size > 1) dropped.genreClash++;
  // labels: per family, the reader of best rank with the most solves (psjp ids reposted: the busiest)
  const labels: Record<string, Record<string, unknown>> = {};
  for (const fam of FAMILY_ORDER) {
    const ofFam = list.filter((x) => x.family === fam).sort((a, b) => a.rank - b.rank);
    if (!ofFam.length) continue;
    const pick = (lab: string) => ofFam.filter((x) => x.labels[lab]).sort((a, b) => Number(b.labels[lab].solves ?? -1) - Number(a.labels[lab].solves ?? -1))[0]?.labels[lab];
    for (const lab of uniq(ofFam.flatMap((x) => Object.keys(x.labels)))) labels[lab] = { ...pick(lab) };
  }
  const jankoWithOrder = list.find((x) => x.humanOrder);
  const solver = list.find((x) => x.solver)?.solver;
  recs.push({
    key: keyOf.get(lead)!, genre: lead.genre, spec: { ...lead.spec, genre: lead.genre }, specKeys: keys,
    sources: uniq(list.map((x) => x.family)).sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b)),
    ids: uniq(list.map((x) => x.id)).sort(), via: uniq(list.map((x) => x.via)).sort(), urls: uniq(list.map((x) => x.url)),
    authors: uniq(list.map((x) => x.author)), setters: uniq(list.map((x) => x.setter)), licences: uniq(list.map((x) => x.licence)),
    labels, ...(solver ? { solver } : {}), ...(jankoWithOrder ? { humanOrder: jankoWithOrder.humanOrder } : {}),
  });
}
recs.sort((a, b) => a.genre.localeCompare(b.genre) || a.key.localeCompare(b.key));

// ---- write, by genre
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".jsonl")) rmSync(`${out}${f}`);
const byGenre = new Map<string, Rec[]>();
for (const r of recs) { const l = byGenre.get(r.genre) ?? []; l.push(r); byGenre.set(r.genre, l); }
for (const [g, l] of byGenre) writeFileSync(`${out}${g}.jsonl`, l.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ---- the report: by genre and source, overlaps
const fams = FAMILY_ORDER.filter((f) => recs.some((r) => r.sources.includes(f)));
const vias = uniq(items.map((x) => x.via));
const lines: string[] = [`# Human corpus (${new Date().toISOString().slice(0, 10)})`, "",
  `${items.length} source records (${vias.map((v) => `${v} ${items.filter((x) => x.via === v).length}`).join(", ")}) → **${recs.length} distinct puzzles**.`,
  `Left out as test puzzles: ${dropped.byId} by id, ${dropped.bySpec} more by spec (${testNames.length} test names). ${idSpecsDiffer} source ids read differently by two readers (the best reader's spec kept); ${dropped.genreClash} merged groups with two genres.`, "",
  `| Genre | Puzzles | ${fams.join(" | ")} | in 2+ sources | ≤ 10 | ≤ 15 | ≤ 20 | > 20 |`, `|---|---|${fams.map(() => "---|").join("")}---|---|---|---|---|`];
const side = (r: Rec) => Math.max(...r.spec.size);
const row = (g: string, l: Rec[]) => `| ${g} | ${l.length} | ${fams.map((f) => l.filter((r) => r.sources.includes(f)).length).join(" | ")} | ${l.filter((r) => r.sources.length > 1).length} | ${l.filter((r) => side(r) <= 10).length} | ${l.filter((r) => side(r) > 10 && side(r) <= 15).length} | ${l.filter((r) => side(r) > 15 && side(r) <= 20).length} | ${l.filter((r) => side(r) > 20).length} |`;
for (const [g, l] of [...byGenre].sort()) lines.push(row(g, l));
lines.push(row("**all**", recs), "", "Overlaps (puzzles in exactly these sources):", "", "| Sources | Puzzles |", "|---|---|");
const combos = new Map<string, number>();
for (const r of recs) combos.set(r.sources.join(" + "), (combos.get(r.sources.join(" + ")) ?? 0) + 1);
for (const [c, k] of [...combos].sort((a, b) => b[1] - a[1])) lines.push(`| ${c} | ${k} |`);
lines.push("", `Left out as computer-made (puzz.link's generated flag): ${generatedLeftOut}.`);
lines.push("", `With labels: psjp difficulty ${recs.filter((r) => r.labels.psjp?.difficulty != null).length}, likes ${recs.filter((r) => r.labels.psjp?.likes != null).length}; puzz.link difficulty ${recs.filter((r) => r.labels.puzzlink?.difficulty != null).length}; both ${recs.filter((r) => r.labels.psjp?.difficulty != null && r.labels.puzzlink?.difficulty != null).length}; lmd beauty ${recs.filter((r) => r.labels.lmd?.beauty != null).length}; Janko with a recorded order ${recs.filter((r) => r.humanOrder).length}.`);
writeFileSync(`${out}summary.md`, lines.join("\n") + "\n");
console.log(lines.join("\n"));
