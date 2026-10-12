// Every puzzle source we have, as our puzzles, for cross-type studies: the examples (src/games),
// and, local only, Puzzle Square JP, Simon Tatham's graded puzzles, Janko's Star Battles and Beast
// Academy's sets. Each source contributes up to `per` puzzles per type.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { genres } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { convert, GENRE, loadSets, ORDER } from "./ba-convert.ts";
import { readStarBattle } from "./janko.ts";
import { fromTatham, TATHAM } from "./tatham.ts";

export interface Item { source: string; genre: string; name: string; spec: GridSpec }

export function corpus(per = 20): Item[] {
  const repo = new URL("../../", import.meta.url).pathname, out: Item[] = [];
  for (const genre of readdirSync(`${repo}src/games`).sort().filter((x) => x in genres))
    for (const f of readdirSync(`${repo}src/games/${genre}`).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(`${repo}src/games/${genre}/${f}`, "utf8"));
      if (d.grid) out.push({ source: "example", genre, name: `${genre}/${f}`, spec: { genre, ...d.grid } });
    }
  const psjp = `${repo}references/psjp/`;
  if (existsSync(psjp))
    for (const type of readdirSync(psjp).filter((t) => !t.includes(".") && t !== "scripts").sort()) {
      const files = readdirSync(`${psjp}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
      const step = Math.max(1, Math.floor(files.length / per));
      for (const f of files.filter((_, i) => i % step === 0).slice(0, per)) {
        const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8"));
        out.push({ source: "psjp", genre: d.grid.genre ?? type, name: `psjp ${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } });
      }
    }
  const tatham = `${repo}references/tatham/puzzles/`;
  if (existsSync(tatham))
    for (const f of readdirSync(tatham).filter((x) => x.endsWith(".txt")).sort()) {
      const game = f.split("-")[0];
      if (!TATHAM[game]) continue;
      for (const id of readFileSync(tatham + f, "utf8").trim().split("\n").slice(0, Math.ceil(per / 4))) {
        const r = fromTatham(game, id);
        if (r) out.push({ source: "tatham", genre: r.spec.genre!, name: `tatham ${f} ${r.grade}`, spec: r.spec });
      }
    }
  const janko = `${repo}references/janko/Sternenschlacht/`;
  if (existsSync(janko))
    for (const f of readdirSync(janko).filter((x) => x.endsWith(".txt")).sort().slice(0, per)) {
      const j = readStarBattle(janko + f);
      if (j && j.spec.size[0] <= 10) out.push({ source: "janko", genre: "star-battle", name: `janko ${f}`, spec: j.spec });
    }
  for (const set of loadSets()) {
    const order = ORDER[set.t]?.find(([name]) => name === set.s);
    if (!order) continue;
    set.p.forEach((c, k) => out.push({ source: "beast-academy", genre: GENRE[set.t], name: `ba ${set.s} ${k + 1}`, spec: convert(set.t, c) as GridSpec }));
  }
  return out;
}
