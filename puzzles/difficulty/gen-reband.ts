// Re-band generated puzzles (gen-set.ts, gathered by puzzles/cloud/gather-gen.sh) under the bands
// as they are now (bands.ts): each puzzle's band (bandOf: the easiest that solves it with no
// search), the techniques it used there and those it requires (requiredOf). For genres banded
// before a change to their bands (Spiral Galaxies and Fill-in before Options.cellAtoms; the
// genres with techniques in hard, bands.ts HARD_TECHNIQUES).
//
//   node puzzles/difficulty/gen-reband.ts <gathered dir> <genre,...> [--sample N] [--no-required]
//                                         [--swap]
//
// Resumable: each worker appends its results to <dir>/reband/<genre>.<w>.jsonl ({i, band, ...}, i
// the line's index), and a rerun skips the lines done. DEDUCE_JOBS workers (processes) at a time,
// each taking every DEDUCE_JOBS-th line. --sample N does N lines spread evenly over the file (a
// time estimate, or a share of a genre too big to do whole).
//
// --swap, once every line of a genre is done: writes generated/<genre>.jsonl.new with the new
// band, used, required and status (ok: the target band; easier or harder than it), and the old
// band kept as oldBand; then graphs-gen.jsonl.new with the band of each matching record (by genre,
// size and seed) changed; then moves the old files to *.bak-<time> and the new ones into place.
// Prints the old → new band counts per genre.
import { spawn } from "node:child_process";
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { GridSpec } from "../../src/engine/types.ts";
import { BAND_LIST, bandOf, quickSolve, requiredOf } from "./bands.ts";
import { JOBS } from "./pool.ts";

const self = fileURLToPath(import.meta.url);
interface Result { i: number; band: string; used: string[]; required?: string[]; ms: number }

/** The band of one puzzle, the techniques it used there and (if asked) those it requires. */
export async function rebandOne(spec: GridSpec, required = true): Promise<Omit<Result, "i">> {
  const t = Date.now();
  const bi = await bandOf(spec);
  if (bi < 0) return { band: "none", used: [], ...(required ? { required: [] } : {}), ms: Date.now() - t };
  const band = BAND_LIST[bi], q = await quickSolve(spec, band, 20000);
  return { band: band.name, used: q.used, ...(required ? { required: await requiredOf(spec, band, q.used) } : {}), ms: Date.now() - t };
}

const linesOf = (file: string) => readFileSync(file, "utf8").split("\n").filter(Boolean);
const doneIn = (dir: string, genre: string): Map<number, Result> => {
  const out = new Map<number, Result>();
  for (let w = 0; w < 64; w++) {
    const f = `${dir}/reband/${genre}.${w}.jsonl`;
    if (existsSync(f)) for (const l of linesOf(f)) { const r = JSON.parse(l) as Result; out.set(r.i, r); }
  }
  return out;
};

// ---------- a worker (its own process): the lines given, appended as they finish ----------
if (process.argv[2] === "--worker") {
  const [, , , dir, genre, w, idxs, req] = process.argv;
  const lines = linesOf(`${dir}/generated/${genre}.jsonl`), out = `${dir}/reband/${genre}.${w}.jsonl`;
  for (const i of JSON.parse(readFileSync(idxs, "utf8")) as number[]) {
    const r = await rebandOne(JSON.parse(lines[i]).spec, req === "1");
    appendFileSync(out, JSON.stringify({ i, ...r }) + "\n");
  }
  process.exit(0);
}

const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === self && process.argv[2] !== "--worker";
if (isMain) await main();

async function main() {
  const args = process.argv.slice(2), dir = args[0], genres = (args[1] ?? "").split(",").filter(Boolean);
  if (!dir || !genres.length) { console.error("usage: gen-reband.ts <gathered dir> <genre,...> [--sample N] [--no-required] [--swap]"); process.exit(1); }
  const flag = (f: string) => args.includes(f), val = (f: string) => args[args.indexOf(f) + 1];
  const sample = flag("--sample") ? Number(val("--sample")) : 0, required = !flag("--no-required");
  mkdirSync(`${dir}/reband`, { recursive: true });
  const live = new Set<ReturnType<typeof spawn>>();
  process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));

  for (const genre of genres) {
    const n = linesOf(`${dir}/generated/${genre}.jsonl`).length;
    const want = sample && sample < n ? [...new Set(Array.from({ length: sample }, (_, k) => Math.floor((k * n) / sample)))] : Array.from({ length: n }, (_, i) => i);
    const done = doneIn(dir, genre), todo = want.filter((i) => !done.has(i));
    console.error(`${genre}: ${n} lines, ${want.length} wanted, ${want.length - todo.length} done, ${todo.length} to do (${JOBS} workers)`);
    const t0 = Date.now();
    if (todo.length) {
      // worker w takes every JOBS-th line; it appends to its own file (a file per worker, numbered
      // past those already there, so a rerun with fewer or more workers never shares one)
      let w0 = 0;
      while (existsSync(`${dir}/reband/${genre}.${w0}.jsonl`)) w0++;
      const timer = setInterval(() => {
        const d = doneIn(dir, genre), now = want.filter((i) => d.has(i)).length - (want.length - todo.length);
        const per = (Date.now() - t0) / Math.max(1, now);
        console.error(`  ${genre}: ${now}/${todo.length}, ${(per / 1000).toFixed(1)} s each (wall), ~${((todo.length - now) * per / 60000).toFixed(0)} min left`);
      }, 60000);
      await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, (_, k) => new Promise<void>((resolve) => {
        const idxFile = `${dir}/reband/.todo-${genre}-${w0 + k}.json`;
        writeFileSync(idxFile, JSON.stringify(todo.filter((_, j) => j % JOBS === k)));
        const child = spawn(process.execPath, [self, "--worker", dir, genre, String(w0 + k), idxFile, required ? "1" : "0"], { stdio: ["ignore", "ignore", "inherit"] });
        live.add(child);
        child.on("close", () => { live.delete(child); resolve(); });
      })));
      clearInterval(timer);
    }
    const all = doneIn(dir, genre), got = want.filter((i) => all.has(i));
    const lines = linesOf(`${dir}/generated/${genre}.jsonl`);
    const moves = new Map<string, number>();
    let ms = 0;
    for (const i of got) { const old = JSON.parse(lines[i]).band, r = all.get(i)!; ms += r.ms; const k = `${old} → ${r.band}`; moves.set(k, (moves.get(k) ?? 0) + 1); }
    const count = (f: (i: number) => string) => { const m = new Map<string, number>(); for (const i of got) m.set(f(i), (m.get(f(i)) ?? 0) + 1); return [...BAND_LIST.map((b) => b.name), "none"].filter((b) => m.has(b)).map((b) => `${b} ${m.get(b)}`).join(", "); };
    console.log(`${genre}: ${got.length} of ${n} re-banded, ${(ms / Math.max(1, got.length) / 1000).toFixed(2)} s each (one worker)`);
    console.log(`  old: ${count((i) => JSON.parse(lines[i]).band)}`);
    console.log(`  new: ${count((i) => all.get(i)!.band)}`);
    console.log(`  moves: ${[...moves].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  }

  if (!flag("--swap")) return;
  // ---------- swap in the new bands ----------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), newBand = new Map<string, string>();
  for (const genre of genres) {
    const lines = linesOf(`${dir}/generated/${genre}.jsonl`), all = doneIn(dir, genre);
    if (lines.some((_, i) => !all.has(i))) { console.error(`${genre}: not every line is done; not swapped`); continue; }
    const out = lines.map((l, i) => {
      const r = JSON.parse(l), x = all.get(i)!;
      const ti = BAND_LIST.findIndex((b) => b.name === r.target), bi = BAND_LIST.findIndex((b) => b.name === x.band);
      newBand.set(`${r.genre}|${r.size}|${r.seed}`, x.band);
      return JSON.stringify({ ...r, oldBand: r.oldBand ?? r.band, band: x.band, used: x.used, ...(x.required ? { required: x.required } : {}), status: bi === ti ? "ok" : bi < 0 ? "none" : bi < ti ? "easier" : "harder", rebanded: true });
    });
    writeFileSync(`${dir}/generated/${genre}.jsonl.new`, out.join("\n") + "\n");
    renameSync(`${dir}/generated/${genre}.jsonl`, `${dir}/generated/${genre}.jsonl.bak-${stamp}`);
    renameSync(`${dir}/generated/${genre}.jsonl.new`, `${dir}/generated/${genre}.jsonl`);
    console.error(`${genre}: swapped in (old kept as ${genre}.jsonl.bak-${stamp})`);
  }
  if (!newBand.size) return;
  // graphs-gen.jsonl: streamed (it's large); only the band of matching records changes
  const gf = `${dir}/graphs-gen.jsonl`, ws = createWriteStream(`${gf}.new`);
  let changed = 0, seen = 0;
  const rl = createInterface({ input: createReadStream(gf), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    seen++;
    let out = line;
    const head = line.slice(0, 400), g = /"genre":"([^"]+)"/.exec(head)?.[1];
    if (g && genres.includes(g)) {
      const r = JSON.parse(line), b = newBand.get(`${r.genre}|${r.size}|${r.seed}`);
      if (b !== undefined && b !== r.band) { r.oldBand = r.oldBand ?? r.band; r.band = b; out = JSON.stringify(r); changed++; }
    }
    if (!ws.write(out + "\n")) await new Promise((res) => ws.once("drain", res));
  }
  await new Promise<void>((res) => ws.end(res));
  renameSync(gf, `${gf}.bak-${stamp}`);
  renameSync(`${gf}.new`, gf);
  console.error(`graphs-gen.jsonl: ${seen} records, ${changed} bands changed (old kept as graphs-gen.jsonl.bak-${stamp})`);
}
