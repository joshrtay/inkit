// Make a grid-engine puzzle (src/games/<genre>/<n>.json) with exactly one solution.
//
//   node puzzles/grid/new.ts --genre slitherlink --size 5x5 --number 1 --name "First Loop" [--seed 3]
//   node puzzles/grid/new.ts --genre nurikabe --size 5x5 --number 1 --name "Islands"
//   node puzzles/grid/new.ts --genre panes --size 4x5 --number 1 --name "First Window" --rules "size=4,twins,opposites,compass"
//   node puzzles/grid/new.ts --genre sudoku --size 9x9 --number 1 --name "Classic"
//   node puzzles/grid/new.ts --genre simple-path --size 6x6 --number 1 --name "First Steps"
//   node puzzles/grid/new.ts --genre star-battle --size 6x6 --number 1 --name "First Stars"
//   node puzzles/grid/new.ts --genre cave --size 7x7 --number 1 --name "Grotto"
//   node puzzles/grid/new.ts --genre aquarium --size 6x6 --number 1 --name "Fish Tank"
//   node puzzles/grid/new.ts --genre numberlink --size 6x6 --number 1 --name "Pairs"
//   node puzzles/grid/new.ts --genre masyu --size 6x6 --number 1 --name "Pearls"
//   node puzzles/grid/new.ts --genre akari --size 7x7 --number 1 --name "Lights On"
//   node puzzles/grid/new.ts --genre shikaku --size 6x6 --number 1 --name "Boxes"
//   node puzzles/grid/new.ts --genre irregular-sudoku --size 6x6 --number 1 --name "Jigsaw"
//   node puzzles/grid/new.ts --genre panel --mix squares --size 4x4 --number 8 --name "Two Tones"   (mixes: panels.ts)
//
// How a puzzle is made is in ./generate.ts (also used by puzzles/ai/week.ts, the AI creators'
// weekly batch). The site build re-proves the result is unique.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { generate } from "./generate.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const genre = arg("genre")!, [rows, cols] = (arg("size", "5x5")!).split("x").map(Number);
const number = Number(arg("number")), name = arg("name") ?? `${genre} ${number}`;
if (!genre || !number) { console.error("usage: --genre <g> --size RxC --number <n> --name <name> [--rules ...] [--seed s]"); process.exit(1); }
const result = await generate({ genre, rows, cols, seed: Number(arg("seed", "1")), rules: arg("rules"), mix: arg("mix"), stars: arg("stars") ? Number(arg("stars")) : undefined });
if (!result) { console.error("no unique puzzle found; try another --seed or size"); process.exit(1); }

const { genre: _g, ...grid } = result;
const path = new URL(`../../src/games/${genre}/${number}.json`, import.meta.url).pathname;
const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const instance = { type: "grid", name: prev.name ?? name, meta: `${rows} × ${cols}`, ...prev, grid };
writeFileSync(path, JSON.stringify(instance, null, 2) + "\n");
console.log(`wrote src/games/${genre}/${number}.json: ${(result.givens ?? []).length} clues, rules ${(makePuzzle(result).rules.map((r) => r.rule)).join(", ")}`);
