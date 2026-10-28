// node --test puzzles/hints/hints.test.ts
// The hint writer on the repo's examples: the solver's ladder is well formed, names no cell, and
// a player who has solved the puzzle is past every stuck point (the marks tell the page so); Opus's
// rungs that break the house rules fall back to the solver's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardOf, program } from "../../src/engine/encode.ts";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { firstOpen, nextHint, nothingShown, readLadder, styleProblems } from "../../src/lib/hint-ladder.ts";
import { clingoJson, loadClingo } from "../difficulty/clingo.ts";
import { stuckPoints } from "./stuck.ts";
import { ladderFromReply, parseReply, solverLadder } from "./words.ts";

const example = (name: string): GridSpec => {
  const d = JSON.parse(readFileSync(new URL(`../../src/games/${name}.json`, import.meta.url), "utf8"));
  return { ...d.grid, genre: d.grid.genre ?? name.split("/")[0] };
};
/** the answer as a player who finished would leave it: every "no" dotted or crossed */
async function solvedBoard(spec: GridSpec) {
  await loadClingo();
  const p = makePuzzle(spec), w = clingoJson(program(p), 2).Call?.[0]?.Witnesses ?? [];
  assert.equal(w.length, 1);
  const b = boardOf(p, w[0].Value as string[]);
  for (const k of ["shade", "fence", "loop"] as const) b[k] = b[k].map((v) => v || 2);
  return b;
}

for (const name of ["akari/1", "sudoku/1", "slitherlink/1", "star-battle/1"]) {
  test(`${name}: the solver's ladder`, async () => {
    const spec = example(name), stuck = await stuckPoints(spec);
    const ladder = solverLadder(spec, stuck);
    assert.ok(stuck.points.length >= 2);
    assert.deepEqual(readLadder(JSON.parse(JSON.stringify(ladder))), ladder);
    assert.deepEqual(styleProblems(ladder), []);
    for (const r of [...ladder.opening, ...ladder.points.flatMap((p) => p.rungs)]) assert.doesNotMatch(r.text, /\br\d+c\d+\b/);
    const done = await solvedBoard(spec);
    assert.equal(firstOpen(ladder, done), ladder.points.length, "a solved board is past every stuck point");
    assert.equal(nextHint(ladder, nothingShown(), done), null);
    assert.equal(firstOpen(ladder, {}), 0);
  });
}

test("Opus's rungs fall back to the solver's where they break the rules", async () => {
  const spec = example("akari/1"), stuck = await stuckPoints(spec);
  const reply = parseReply(`Here you go:\n${JSON.stringify({
    start: "Begin at the numbered black squares.", habit: "Mark r1c1 with a dot.",
    points: stuck.points.map((_, k) => ({ where: "Once the corners are done, look along this row.", rule: k ? "word ".repeat(50) : "Whenever a number is full, its other neighbours are empty. Which neighbours are left?", technique: "Full number", short: "Full again.", step: "These squares are empty: the number already has its bulbs." })),
  })}`);
  const { ladder, problems } = ladderFromReply(spec, stuck, reply);
  assert.equal(ladder.opening[0].text, "Begin at the numbered black squares.");
  assert.notEqual(ladder.opening[1].text, "Mark r1c1 with a dot.");
  assert.deepEqual(problems.slice(0, 2), ["habit", "point 2 rule"]);
  assert.equal(ladder.points[0].rungs[1].technique, "full number");
  assert.equal(ladder.points[1].rungs[1].text, solverLadder(spec, stuck).points[1].rungs[1].text);
  assert.deepEqual(ladderFromReply(spec, stuck, null).ladder.points, solverLadder(spec, stuck).points);
});
