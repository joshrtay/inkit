// node --test puzzles/difficulty/routes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathCells, routes } from "./routes.ts";

/** A rows × cols grid's links, between open cells. */
const gridEdges = (rows: number, cols: number, closed: number[] = []) => {
  const out: [number, number][] = [], shut = new Set(closed);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (shut.has(i)) continue;
    if (c + 1 < cols && !shut.has(i + 1)) out.push([i, i + 1]);
    if (r + 1 < rows && !shut.has(i + cols)) out.push([i, i + cols]);
  }
  return out;
};
const adjOf = (n: number, edges: [number, number][]) => {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  return adj;
};
const cells = (b: Uint8Array) => [...b.keys()].filter((c) => b[c]);

test("a corridor: every cell on the way is a must", () => {
  // 1 × 4: 0 - 1 - 2 - 3
  const r = pathCells(4, adjOf(4, gridEdges(1, 4)), () => true, 0, 3)!;
  assert.deepEqual(cells(r.use), [0, 1, 2, 3]);
  assert.deepEqual(cells(r.must), [0, 1, 2, 3]);
});

test("a dead end off the way can't be used", () => {
  // 2 × 3 with cell 5 closed:  0 1 2 / 3 4 x ; from 3 to 2: the square 0 1 3 4 is a block, 2 hangs off 1
  const edges = gridEdges(2, 3, [5]);
  const r = pathCells(6, adjOf(6, edges), (c) => c !== 5, 3, 2)!;
  assert.deepEqual(cells(r.use), [0, 1, 2, 3, 4]);
  assert.deepEqual(cells(r.must), [1, 2, 3]);
  // from 0 to 1 the cell 2 beyond 1 is a dead end
  const q = pathCells(6, adjOf(6, edges), (c) => c !== 5, 0, 1)!;
  assert.deepEqual(cells(q.use), [0, 1, 3, 4]);
});

test("not joined: null", () => {
  assert.equal(pathCells(3, adjOf(3, [[0, 1]]), () => true, 0, 2), null);
});

test("routes: a must cell is kept from the other pairs, and cover gives the rest", () => {
  // 3 × 3, pair A from 0 to 2 along the top must pass 1 once 4 is held by pair B (3 to 5)
  //   A . A
  //   B b B      (4 held by B: a drawn piece)
  //   . . .
  const n = 9, owner = new Int32Array(n).fill(-1);
  owner[0] = owner[2] = 0; owner[3] = owner[4] = owner[5] = 1;
  const r = routes({ n, edges: gridEdges(3, 3), pairs: [[0, 2], [3, 5]], owner, cover: true });
  assert.equal(r.contradiction, undefined);
  assert.equal(r.owner[1], 0);
  // the bottom row only B can reach (A is walled off by B's row), so with cover it's B's
  assert.deepEqual([6, 7, 8].map((c) => r.owner[c]), [1, 1, 1]);
  assert.deepEqual(cells(r.use[0]), [0, 1, 2]);
});

test("routes: a cell no pair can reach is a contradiction under cover", () => {
  // 1 × 3, pair from 0 to 1; cell 2 is beyond the end
  const owner = new Int32Array(3).fill(-1); owner[0] = owner[1] = 0;
  assert.match(routes({ n: 3, edges: gridEdges(1, 3), pairs: [[0, 1]], owner, cover: true }).contradiction ?? "", /no pair/);
  assert.equal(routes({ n: 3, edges: gridEdges(1, 3), pairs: [[0, 1]], owner, cover: false }).contradiction, undefined);
});
