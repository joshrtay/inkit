// A blind solve of makers at matched size (docs/plan-generator-and-hints.md, "G0 result"): Opus
// designer puzzles, the generator's and human-made ones, shuffled and labelled A, B, C… as
// puzz.link links, so Josh and Wyatt can solve and rate them without knowing which is which. The
// key (label → maker) is written apart from the links.
//
//   node --no-warnings puzzles/ai/blind-set.ts --in picks.jsonl --out <dir> [--seed 7]
//       picks.jsonl: one { maker, spec } per line (Masyu, Slitherlink or Akari)
//       writes <dir>/links.json (label, type, size, link) and <dir>/key.json (label → maker)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Given, GridSpec } from "../../src/engine/types.ts";

/** pzprjs encode4Cell: 0-4 with the following gap (one or two cells) folded in; runs of 1-20 empty
 *  cells as g-z; "." a cell with no number (Akari's plain black square). */
export function four(vals: (number | undefined)[]): string {
  let out = "";
  for (let c = 0; c < vals.length;) {
    const v = vals[c];
    if (v === undefined) {
      let k = 0;
      while (c + k < vals.length && vals[c + k] === undefined && k < 20) k++;
      out += (k + 15).toString(36);
      c += k;
    } else if (v < 0) { out += "."; c++; }
    else {
      const gap = vals[c + 1] === undefined && c + 1 < vals.length ? (vals[c + 2] === undefined && c + 2 < vals.length ? 2 : 1) : 0;
      out += (v + [0, 5, 10][gap]).toString(16);
      c += 1 + gap;
    }
  }
  return out;
}

/** pzprjs encodeCircle: three cells to a base-27 digit, each 0, 1 (white) or 2 (black). */
export function three(vals: number[]): string {
  let out = "";
  for (let i = 0; i < vals.length; i += 3) out += ((vals[i] ?? 0) * 9 + (vals[i + 1] ?? 0) * 3 + (vals[i + 2] ?? 0)).toString(27);
  return out;
}

/** A puzz.link link for a Masyu, Slitherlink or Akari spec. */
export function linkOf(spec: GridSpec): string {
  const [rows, cols] = spec.size, n = rows * cols;
  const idx = (g: Given) => { const [r, c] = (g as { cell: [number, number] }).cell; return r * cols + c; };
  const gs = spec.givens ?? [];
  if (spec.genre === "masyu") {
    const v = new Array(n).fill(0);
    for (const g of gs) if (g.kind === "pearl") v[idx(g)] = (g as { value: string }).value === "white" ? 1 : 2;
    return `https://puzz.link/p?mashu/${cols}/${rows}/${three(v)}`;
  }
  const v: (number | undefined)[] = new Array(n).fill(undefined);
  if (spec.genre === "slitherlink") {
    for (const g of gs) if (g.kind === "number") v[idx(g)] = (g as { value: number }).value;
    return `https://puzz.link/p?slither/${cols}/${rows}/${four(v)}`;
  }
  if (spec.genre === "akari") {
    for (const g of gs) if (g.kind === "block" && v[idx(g)] === undefined) v[idx(g)] = -2;
    for (const g of gs) if (g.kind === "number") v[idx(g)] = (g as { value: number }).value;
    return `https://puzz.link/p?lightup/${cols}/${rows}/${four(v)}`;
  }
  throw new Error(`no puzz.link encoding here for ${spec.genre}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const picks = readFileSync(arg("in")!, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { maker: string; spec: GridSpec });
  let s = Number(arg("seed", "7"));
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  const label = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
  const out = arg("out")!;
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/links.json`, JSON.stringify(picks.map((p, i) => ({ label: label(i), type: p.spec.genre, size: p.spec.size.join("×"), link: linkOf(p.spec) })), null, 1) + "\n");
  writeFileSync(`${out}/key.json`, JSON.stringify(Object.fromEntries(picks.map((p, i) => [label(i), p.maker])), null, 1) + "\n");
  console.log(`${picks.length} puzzles → ${out}/links.json (key in key.json)`);
}
