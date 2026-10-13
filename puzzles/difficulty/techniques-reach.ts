// How far the per-genre techniques reach: plain generated puzzles (made unique by the generator,
// with no solver in the loop, so as hard as they come), each put in its band with the techniques
// and without them. A technique that moves puzzles out of "search" (-) into expert widens what the
// generator's expert band can make.
//
//   node puzzles/difficulty/techniques-reach.ts <genre> <size> [count] [firstSeed]
import { generate } from "../grid/generate.ts";
import { BAND_LIST, quickSolve, without } from "./bands.ts";
import { TECHNIQUES } from "./deduce.ts";

const [genre, size, count = "10", first = "1"] = process.argv.slice(2);
const expert = BAND_LIST.at(-1)!;
const bare = Object.keys(TECHNIQUES).reduce((b, t) => without(b, t), expert);
const tally = new Map<string, number>();
for (let k = 0; k < +count; k++) {
  const seed = +first + k;
  const spec = await generate({ genre, rows: +size, cols: +size, seed });
  if (!spec) { console.log(`#${seed}: none`); continue; }
  let band = "-";
  for (const b of BAND_LIST.slice(0, -1)) if ((await quickSolve(spec, b, 30000)).solved) { band = b.name; break; }
  const t = Date.now();
  const withT = band === "-" ? await quickSolve(spec, expert, 60000) : null;
  const ms = Date.now() - t;
  const withoutT = band === "-" ? await quickSolve(spec, bare, 60000) : null;
  const key = band !== "-" ? band : `${withoutT!.solved ? "expert" : "-"} → ${withT!.solved ? "expert" : "-"}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
  console.log(`#${seed}: ${key}${withT ? ` (${(ms / 1000).toFixed(1)} s${withT.error ? `, ${withT.error}` : ""}; ${withT.used.join(" ")})` : ""}`);
}
console.log([...tally].map(([k, v]) => `${k}: ${v}`).join(", "));
