// Puzzle Square JP's puzzles from their links: data.json's `url` (a puzz.link or pzprxs link, for
// most of the 11,229 of its 75,002 puzzles that have one; Penpa+ links are left out) read by the site's puzz.link reader (app/app/lib/import-link.ts),
// for the types we have. Each keeps Puzzle Square JP's difficulty, likes (favorite_n), solves
// (answered_n) and author id. Puzzles already in references/psjp/<genre>/ (the rated set, built
// from other links) are left out, by id or by content, and so is a puzzle twice among the links;
// the rest are checked for exactly one solution by the engine's solver, each solve in its own
// process, killed at --cap-s. Nothing is fetched.
// → references/psjp-links/<genre>.jsonl (local only: others' puzzles), with summary.json
//
//   DEDUCE_JOBS=2 node puzzles/difficulty/psjp-links.ts [--cap-s 60] [--max 30] [--count]
//
// --count: decode and count, no solving. Verdicts are cached (references/psjp-links/verdicts.json),
// so a rerun picks up where the last stopped.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { REFS_DIR } from "./janko.ts";
import { mapPool } from "./pool.ts";

const self = fileURLToPath(import.meta.url);
type Verdict = "unique" | "none" | "several" | "timeout" | `error: ${string}`;

/** A puzzle's content, whatever its id: genre, size, areas and givens (in a fixed order). Not its
 *  rules: the rated set's decoder writes out some that the site's leaves to the genre. */
function specKey(spec: GridSpec): string {
  const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon)
    : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x;
  const givens = (spec.givens ?? []).map((g) => JSON.stringify(canon(g))).sort();
  return JSON.stringify([spec.genre, spec.size, spec.areas ?? null, givens]);
}

if (process.argv[2] === "--child") {
  const spec = JSON.parse(Buffer.from(process.argv[3], "base64").toString()) as GridSpec;
  const boards = await solve(makePuzzle(spec), 2);
  process.stdout.write(boards.length === 0 ? "none" : boards.length > 1 ? "several" : "unique");
  process.exit(0);
}

const argv = process.argv.slice(2);
const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
const CAP = opt("--cap-s", 60) * 1000, MAX = opt("--max", 30);
const psjp = `${REFS_DIR}psjp/`, out = `${REFS_DIR}psjp-links/`;
mkdirSync(out, { recursive: true });

// the site's puzz.link reader (its aliases resolved for Node: app-resolve.mjs); a dynamic import, so
// the root type-check doesn't follow it into the site's code
const resolver = "./app-resolve.mjs";
await import(resolver);
const site = new URL("../../app/app/lib/import-link.ts", import.meta.url).href;
const { readLink, parsePuzzlink } = (await import(site)) as { readLink: (link: string) => Promise<{ kind: string; spec?: GridSpec; genreName?: string; variant?: string }>; parsePuzzlink: (link: string) => { pid: string } | null };

interface Psjp { id: string; kind: number; difficulty: number; variation: number; url?: string; registered: string; user: number; favorite_n?: number; answered_n?: number }
const data = JSON.parse(readFileSync(`${psjp}data.json`, "utf8")) as Record<string, Psjp>;
const kinds = JSON.parse(readFileSync(`${psjp}kind.json`, "utf8")) as Record<string, { name_e?: string }>;

// the rated set: ids and contents
const haveIds = new Set<string>(), haveKeys = new Set<string>();
for (const g of readdirSync(psjp).filter((d) => !d.includes(".") && d !== "scripts"))
  for (const f of readdirSync(`${psjp}${g}`).filter((f) => /^\d+\.json$/.test(f))) {
    haveIds.add(f.replace(".json", ""));
    const d = JSON.parse(readFileSync(`${psjp}${g}/${f}`, "utf8"));
    if (d.grid) haveKeys.add(specKey({ ...d.grid, genre: d.grid.genre ?? g }));
  }

const tally = new Map<string, Record<string, number>>();
const bump = (genre: string, k: string) => { const t = tally.get(genre) ?? {}; t[k] = (t[k] ?? 0) + 1; tally.set(genre, t); };
const unsupported = new Map<string, number>();
interface Item { p: Psjp; spec: GridSpec; key: string }
const items: Item[] = [], seen = new Set<string>();
let links = 0;
for (const p of Object.values(data)) {
  if (!p.url) continue;
  links++;
  // puzz.link's format only (puzz.link, pzprxs and their kin): Penpa+ links don't say their type,
  // and most of those read here had no solution under ours
  if (!parsePuzzlink(p.url)?.pid) { unsupported.set("Penpa+ or a type puzz.link doesn't name", (unsupported.get("Penpa+ or a type puzz.link doesn't name") ?? 0) + 1); continue; }
  const r = await readLink(p.url).catch(() => ({ kind: "unreadable" }) as { kind: string; spec?: GridSpec; genreName?: string; variant?: string });
  if (r.kind !== "puzzle" || !r.spec) {
    const why = r.kind === "unsupported" ? `${r.genreName ?? "?"}${r.variant ? ` (${r.variant})` : ""}` : r.kind;
    unsupported.set(why, (unsupported.get(why) ?? 0) + 1);
    continue;
  }
  const spec = r.spec, genre = spec.genre!;
  bump(genre, "decoded");
  // a variant on Puzzle Square JP's side (its rules differ from the type's), or too big for our studies
  if (p.variation) { bump(genre, "variant"); continue; }
  if (spec.size[0] > MAX || spec.size[1] > MAX) { bump(genre, "too big"); continue; }
  const key = specKey(spec);
  if (haveIds.has(p.id) || haveKeys.has(key)) { bump(genre, "in the rated set"); continue; }
  if (seen.has(key)) { bump(genre, "twice"); continue; }
  seen.add(key);
  items.push({ p, spec, key });
}
console.error(`${links} links; ${items.length} new puzzles of our types to check`);

const verdictsFile = `${out}verdicts.json`;
const verdicts: Record<string, Verdict> = existsSync(verdictsFile) ? JSON.parse(readFileSync(verdictsFile, "utf8")) : {};
const solveOne = (spec: GridSpec) => new Promise<Verdict>((resolve) => {
  const c = spawn(process.execPath, ["--no-warnings", self, "--child", Buffer.from(JSON.stringify(spec)).toString("base64")], { stdio: ["ignore", "pipe", "pipe"] });
  let o = "", e = "";
  const timer = setTimeout(() => { c.kill("SIGKILL"); resolve("timeout"); }, CAP);
  c.stdout.on("data", (d) => { o += d; });
  c.stderr.on("data", (d) => { e += d; });
  c.on("close", () => { clearTimeout(timer); resolve((o || `error: ${e.trim().split("\n").pop() ?? "?"}`) as Verdict); });
});
if (!argv.includes("--count")) {
  let done = 0;
  await mapPool(items, async (it) => {
    // a timeout is tried again only with a longer cap
    if (!verdicts[it.p.id] || (verdicts[it.p.id] === "timeout" && CAP > 60000)) verdicts[it.p.id] = await solveOne(it.spec);
    if (++done % 100 === 0) { console.error(`${done}/${items.length}`); writeFileSync(verdictsFile, JSON.stringify(verdicts)); }
  });
  writeFileSync(verdictsFile, JSON.stringify(verdicts));
}

const byGenre = new Map<string, string[]>();
for (const it of items) {
  const v = verdicts[it.p.id], genre = it.spec.genre!;
  if (!v) continue;
  bump(genre, v.startsWith("error") ? "error" : v);
  if (v !== "unique") continue;
  const { p } = it;
  const line = JSON.stringify({
    source: "psjp-links", id: p.id, genre, name: `psjp-links ${genre}/${p.id}`, url: p.url, kind: p.kind, kindName: kinds[p.kind]?.name_e ?? "",
    difficulty: p.difficulty, favorite_n: p.favorite_n ?? 0, answered_n: p.answered_n ?? 0, user: p.user, registered: p.registered, spec: it.spec,
  });
  byGenre.set(genre, [...(byGenre.get(genre) ?? []), line]);
}
for (const f of readdirSync(out).filter((f) => f.endsWith(".jsonl"))) if (!byGenre.has(f.replace(".jsonl", ""))) writeFileSync(`${out}${f}`, "");
for (const [genre, ls] of byGenre) writeFileSync(`${out}${genre}.jsonl`, ls.join("\n") + "\n");

const cols = ["decoded", "variant", "too big", "in the rated set", "twice", "unique", "several", "none", "timeout", "error"];
const table = "| Genre | " + cols.join(" | ") + " |\n|---" + "|---".repeat(cols.length) + "|\n"
  + [...tally].sort().map(([g, t]) => `| ${g} | ${cols.map((c) => t[c] ?? 0).join(" | ")} |`).join("\n")
  + `\n| all | ${cols.map((c) => [...tally.values()].reduce((a, t) => a + (t[c] ?? 0), 0)).join(" | ")} |`;
console.log(table);
console.log(`\nnot ours (links): ${[...unsupported].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} ${n}`).join(", ")}${unsupported.size > 15 ? ", …" : ""}`);
writeFileSync(`${out}summary.json`, JSON.stringify({ links, byGenre: Object.fromEntries(tally), notOurs: Object.fromEntries(unsupported) }, null, 1));
