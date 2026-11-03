// node --test puzzles/hints/tutor.test.ts
// The tutor's read of a board (tutor.ts), on a Masyu position a player was stuck in (2026-11-02):
// the cheapest move open is the black pearl's left leg, and a wrong line is caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { emptyBoard, type GridSpec } from "../../src/engine/types.ts";
import { readBoard } from "./tutor.ts";

const d = JSON.parse(readFileSync(new URL("../../src/games/masyu/2.json", import.meta.url), "utf8"));
const spec: GridSpec = { ...d.grid, genre: d.grid.genre ?? "masyu" };
const g = makePuzzle(spec).grid, cols = spec.size[1];
const link = (a: [number, number], b: [number, number]) => g.links.findIndex((l) => l.cells.includes(a[0] * cols + a[1]) && l.cells.includes(b[0] * cols + b[1]));
const board = (extra: [number, number, number, number][] = []) => {
  const b = emptyBoard(g);
  const lines: [number, number, number, number][] = [[0, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 0], [1, 0, 2, 0], [0, 7, 0, 6], [0, 6, 0, 5], [0, 7, 1, 7], [1, 7, 2, 7], [2, 7, 2, 6],
    [4, 1, 4, 0], [4, 0, 5, 0], [5, 0, 6, 0], [6, 0, 7, 0], [7, 0, 7, 1], [7, 1, 7, 2], ...extra];
  for (const [r1, c1, r2, c2] of lines) b.loop[link([r1, c1], [r2, c2])] = 1;
  return b;
};

test("the cheapest move first, and nothing wrong", async () => {
  const r = await readBoard(spec, board());
  assert.deepEqual(r.mistakes, []);
  assert.equal(r.moves[0].facts.map((f) => f.text).join(), "line r3c6–r3c7");
  assert.ok(r.moves[0].focus.length <= 12, "outlines the spot, not the grid");
});

test("a wrong line is a mistake", async () => {
  const r = await readBoard(spec, board([[3, 3, 3, 4]]));
  assert.equal(r.mistakes.length, 1);
  assert.match(r.mistakes[0].text, /r4c4 and r4c5/);
});
