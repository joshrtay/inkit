// node --test puzzles/difficulty/walkthrough-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absorb, along, applyRefactor, type Audit, cellsOfRefs, citation, clean, descriptionLength, emptyLibrary, feedback, firstIn3, gap,
  type InsightCheck, type MenuStep, nearest, parseWalk, sameWalk, spearman, type Walk,
} from "./walkthrough-core.ts";

const ins = (concludes: [string, string][], extra: object = {}) => ({ idea: "i", clues: [], technique: "t", hint: "h", concludes: concludes.map(([at, value]) => ({ at, value })), ...extra });

test("parseWalk reads the last object with insights, around fences and prose", () => {
  const w = parseWalk('Sure:\n```json\n{"insights": [{"idea": "a", "clues": ["r1c1"], "concludes": [{"at": "r1c2", "value": "bulb"}], "technique": "t", "hint": "h"}], "elegance": 7}\n```\nDone {not json}');
  assert.equal(w?.insights.length, 1);
  assert.deepEqual(w?.insights[0].concludes, [{ at: "r1c2", value: "bulb" }]);
  assert.equal(w?.elegance, 7);
  assert.equal(parseWalk("no json here"), null);
  // missing fields become empty, not undefined
  assert.deepEqual(parseWalk('{"insights": [{"idea": "x"}]}')?.insights[0].clues, []);
});

test("cellsOfRefs reads cells, links, sides and lines", () => {
  assert.deepEqual(cellsOfRefs(["r1c1", "r2c3"], 3, 4), [0, 6]);
  assert.deepEqual(cellsOfRefs(["r1c1-r1c2"], 3, 4), [0, 1]);
  assert.deepEqual(cellsOfRefs(["r3c4 top"], 3, 4), [11]);
  assert.deepEqual(cellsOfRefs(["row 2"], 3, 4), [4, 5, 6, 7]);
  assert.deepEqual(cellsOfRefs(["column 1", "col 2"], 2, 3), [0, 1, 3, 4]);
  assert.deepEqual(cellsOfRefs(["rows 1-2"], 3, 2), [0, 1, 2, 3]);
  assert.deepEqual(cellsOfRefs(["r9c9", "the corner"], 3, 3), []);
});

test("gap and nearest go by king's moves, cheaper first among equals", () => {
  assert.equal(gap([0], [5], 4), 1);
  assert.equal(gap([0], [15], 4), 3);
  assert.equal(gap([], [1], 4), Infinity);
  const step = (cells: number[], cost: number): MenuStep => ({ facts: [{ mark: `m${cells[0]}`, value: true, text: `c${cells[0]}` }], cells, cost, where: "", clues: [], clueCells: [], kind: "k", tier: 0 });
  const menu = [step([15], 1), step([1], 3), step([4], 2)];
  assert.deepEqual(nearest(menu, [0], 4, 2).map((s) => s.cells[0]), [4, 1]);
  assert.deepEqual(nearest(menu, [], 4, 1).map((s) => s.cells[0]), [15]);
});

test("citation compares cited cells with the reason's", () => {
  assert.deepEqual(citation([1, 2], [2, 3]), { recall: 0.5, precision: 0.5 });
  assert.equal(citation([], [1]), null);
});

const check = (o: Partial<InsightCheck>): InsightCheck => ({ k: 0, unreadable: [], wrong: [], already: [], forced: [], split: [], notYet: [], trivial: false, citation: null, readerMarks: 0, simpler: true, ...o });
const menuStep: MenuStep = { facts: [{ mark: "shaded(1)", value: false, text: "r1c2 no bulb" }], cells: [1], cost: 2.5, where: "row 1", clues: ["lit (row 1)"], clueCells: [0, 1, 2], kind: "lit", tier: 0 };

test("feedback: A names errors only; B adds nearby steps where it's wrong; C lists the menu everywhere", () => {
  const a: Audit = {
    checks: [check({ k: 0, wrong: [{ at: "r1c1", value: "bulb" }], menu: [menuStep], cells: [0] }), check({ k: 1, menu: [menuStep], cells: [5] })],
    stall: null, order: [], ceiling: 3,
  };
  const A = feedback(a, "A", 3), B = feedback(a, "B", 3), C = feedback(a, "C", 3);
  assert.match(A, /Insight 1: r1c1 bulb is not right/);
  assert.doesNotMatch(A, /no bulb/);
  assert.match(B, /Near it, these do follow/);
  assert.match(B, /r1c2 no bulb: from lit \(row 1\)/);
  assert.doesNotMatch(B, /Insight 2/);
  assert.match(C, /Insight 2: fine\./);
  assert.equal((C.match(/r1c2 no bulb/g) ?? []).length, 2);
});

test("feedback: a stall, a trivial insight, a leap and a case split with simpler moves open", () => {
  const a: Audit = { checks: [check({ trivial: true, already: ["r1c1 bulb"] }), check({ k: 1, notYet: ["r2c2 bulb"] }), check({ k: 2, split: ["r3c3 bulb"] })], stall: { open: 4, total: 9, grid: "GRID" }, order: [], ceiling: 3 };
  const t = feedback(a, "A", 3);
  assert.match(t, /Insight 1: everything it concludes/);
  assert.match(t, /Insight 2: r2c2 bulb is true, but doesn't follow yet/);
  assert.match(t, /Insight 3: r3c3 bulb only follows here by trying the other way/);
  assert.match(t, /stuck with 4 of 9 marks still open:\n\nGRID/);
  assert.equal(clean(a), false);
  const ok: Audit = { checks: [check({ forced: [{ text: "x", cost: 4, clues: [], kind: "k" }] }), check({ split: ["y"], simpler: false })], stall: null, order: [], ceiling: 3 };
  assert.equal(clean(ok), true);
  assert.match(feedback(ok, "A", 3), /found nothing wrong/);
});

test("sameWalk ignores wording and move order inside an insight", () => {
  const a: Walk = { insights: [ins([["r1c1", "bulb"], ["r1c2", "no bulb"]])] };
  const b: Walk = { insights: [ins([["R1C2", "No bulb "], ["r1 c1", "bulb"]], { idea: "other words" })] };
  assert.equal(sameWalk(a, { insights: [ins([["r1c2", "no bulb"], ["r1c1", "bulb"]])] }), true);
  assert.equal(sameWalk(a, b), true);
  assert.equal(sameWalk(a, { insights: [ins([["r1c1", "bulb"]])] }), false);
});

test("human-order measures", () => {
  const human: [string, boolean][] = [["a", true], ["b", true], ["c", false], ["d", true], ["e", true]];
  const value = (m: string) => m !== "c";
  assert.equal(firstIn3(human, [["c", false]], new Set()), true);
  assert.equal(firstIn3(human, [["d", true]], new Set()), false);
  assert.equal(firstIn3(human, [["a", true], ["d", true]], new Set(["a"])), true);
  // d: not in a b c; a: yes; b: yes (d is known by then, so next 3 are b c e)
  assert.deepEqual(along(human, [["d", true], ["a", true], ["b", true]], new Set(), value, 20), { hits: 2, n: 3 });
  // a mark the person never settles is skipped with peopleKinds
  assert.deepEqual(along(human, [["z", true], ["a", true]], new Set(), () => true, 20, true), { hits: 1, n: 1 });
  assert.equal(spearman(human, human), 1);
  assert.equal(spearman(human, [...human].reverse()), -1);
  assert.ok(Number.isNaN(spearman(human, human.slice(0, 3))));
});

test("the library: absorb, refactor, description length", () => {
  const walk: Walk = { insights: [
    ins([["r1c1", "bulb"]], { idea: "a 3 in the corner lights both edges", new_entry: { name: "corner 3", template: "a {n} in a corner forces both outer edges", when: "a 3 in a corner", concludes: "two lines" } }),
    ins([["r2c2", "bulb"]], { idea: "plain words, no entry" }),
  ] };
  let lib = absorb(emptyLibrary(), walk, "p1", "slitherlink");
  assert.equal(lib.entries.length, 1);
  assert.equal(lib.free.length, 1);
  assert.equal(lib.entries[0].id, "L1");
  const again: Walk = { insights: [ins([], { idea: "a 3 in the corner forces both outer edges", uses: "L1" }), ins([], { idea: "x", uses: "L99" })] };
  lib = absorb(lib, again, "p2", "slitherlink");
  assert.equal(lib.entries[0].examples.length, 2);
  assert.match(lib.log.join(), /unknown entry L99/);
  assert.equal(lib.puzzles, 2);
  // another genre's entry isn't reachable from this one
  assert.equal(absorb(lib, again, "p3", "akari").entries[0].examples.length, 2);

  // a near-duplicate merged costs less than two entries
  const dup: Walk = { insights: [ins([], { idea: "corner three: both outer edges", new_entry: { name: "3 in corner", template: "a three in a corner has both outer edges as lines", when: "a 3 in a corner", concludes: "two lines" } })] };
  lib = absorb(lib, dup, "p3", "slitherlink");
  const before = descriptionLength(lib, "slitherlink");
  const { lib: merged, skipped } = applyRefactor(lib, "slitherlink", [{ op: "merge", ids: ["L1", "L2"], into: lib.entries[0] }, { op: "drop", id: "L42" }]);
  assert.deepEqual(skipped, ["drop L42"]);
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].examples.length, 3);
  assert.ok(descriptionLength(merged, "slitherlink").total < before.total);
  // the original isn't changed
  assert.equal(lib.entries.length, 2);
  // drop: its examples become free text; split: examples go where they're claimed
  const dropped = applyRefactor(merged, "slitherlink", [{ op: "drop", id: merged.entries[0].id }]).lib;
  assert.equal(dropped.entries.length, 0);
  assert.equal(dropped.free.length, 5);   // 2 free before (p1, and p2's unknown entry) + 3 dropped
  const id = merged.entries[0].id;
  const split = applyRefactor(merged, "slitherlink", [{ op: "split", id, into: [
    { name: "a", template: "a", when: "", concludes: "", examples: [] },
    { name: "b", template: "b", when: "", concludes: "", examples: ["p3#1"] },
  ] }]).lib;
  assert.deepEqual(split.entries.map((e) => e.examples.length), [2, 1]);
});
