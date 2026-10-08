// The track cursor (src/game-types/grid/line-input.ts): the line's head moves continuously along
// the tracks, slides round corners, backs up, stops at gaps, its own line and the mirror line.
import { describe, expect, it } from "vitest";
import { squareGrid } from "~site/engine/geometry.ts";
import { mirrorCorner } from "~site/engine/panel.ts";
import * as L from "~site/game-types/grid/line-input.ts";

const S = 10;
const g = squareGrid(3, 3);                       // corners 0..15, 4 per row
const at = (v: number): L.XY => { const [r, c] = g.cornerRC(v); return [c * S, r * S]; };
const corners = L.cornerTrack(g, at);
const block: L.Rules = { revisit: "block" };
const v = (r: number, c: number) => g.corner(r, c);
const go = (track: L.Track, rules: L.Rules, c: L.Cursor, ...pts: L.XY[]) => pts.reduce((cur, p) => L.moveTo(track, rules, cur, p), c);

describe("moving along the tracks", () => {
  it("moves part of the way along a segment", () => {
    const c = L.moveTo(corners, block, L.begin(v(0, 0)), [4, 1]);
    expect(c).toEqual({ path: [v(0, 0)], toward: v(0, 1), t: 0.4 });
    expect(L.headXY(corners, c)).toEqual([4, 0]);
  });
  it("crosses many junctions in one fast move", () => {
    const c = L.moveTo(corners, block, L.begin(v(0, 0)), [25, 0]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(0, 2)]);
    expect(c.toward).toBe(v(0, 3));
    expect(c.t).toBeCloseTo(0.5);
  });
  it("slides round a corner on a diagonal push", () => {
    // halfway along the top, then a push down and right: nearer the line down from (0,1)
    const c = go(corners, block, L.begin(v(0, 0)), [5, 0], [9, 6]);
    expect(c.path).toEqual([v(0, 0), v(0, 1)]);
    expect(c.toward).toBe(v(1, 1));
    expect(c.t).toBeCloseTo(0.6);
  });
  it("makes a staircase from one long diagonal move", () => {
    const c = L.moveTo(corners, block, L.begin(v(0, 0)), [30, 30]);
    expect(L.headXY(corners, c)).toEqual([30, 30]);
    expect(c.path.length).toBe(7);
  });
  it("stays on the node when pushed where no track goes", () => {
    const c = L.moveTo(corners, block, L.begin(v(0, 0)), [-5, -5]);
    expect(c).toEqual({ path: [v(0, 0)], toward: -1, t: 0 });
  });
});

describe("backing up", () => {
  it("eats the line when the head moves back", () => {
    let c = L.moveTo(corners, block, L.begin(v(0, 0)), [20, 0]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(0, 2)]);
    c = L.moveTo(corners, block, c, [7, 0]);
    expect(c.path).toEqual([v(0, 0)]);
    expect(c.toward).toBe(v(0, 1));
    expect(c.t).toBeCloseTo(0.7);
    c = L.moveTo(corners, block, c, [0, 0]);
    expect(c).toEqual({ path: [v(0, 0)], toward: -1, t: 0 });
  });
  it("backs up round a corner", () => {
    let c = go(corners, block, L.begin(v(0, 0)), [10, 0], [10, 10]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(1, 1)]);
    c = L.moveTo(corners, block, c, [0, 0]);
    expect(c.path).toEqual([v(0, 0)]);
  });
});

describe("blocking", () => {
  it("stops partway into a gap", () => {
    const gap = g.cornerBorders[v(0, 1)].find((e) => g.borders[e].corners.includes(v(0, 2)))!;
    const t = L.cornerTrack(g, at, { gaps: new Set([gap]) });
    const c = L.moveTo(t, block, L.begin(v(0, 0)), [30, 0]);
    expect(c.path).toEqual([v(0, 0), v(0, 1)]);
    expect(c.t).toBeCloseTo(L.GAP_REACH);
  });
  it("can't run into its own line", () => {
    // a U: right, down, left; then a push up runs into the start
    const c = go(corners, block, L.begin(v(0, 0)), [10, 0], [10, 10], [0, 10], [0, 0]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(1, 1), v(1, 0)]);
    expect(c.t).toBeCloseTo(L.BUMP_REACH);
  });
  it("closes a loop when the rules allow it", () => {
    const loop: L.Rules = { revisit: "close" };
    const c = go(corners, loop, L.begin(v(0, 0)), [10, 0], [10, 10], [0, 10], [0, 0]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(1, 1), v(1, 0), v(0, 0)]);
    expect(L.closed(c)).toBe(true);
    // a closed loop goes nowhere but back
    expect(L.moveTo(corners, loop, c, [0, -20]).path).toEqual(c.path);
  });
  it("stops each line short of its mirror image", () => {
    // left-right symmetry on 3 columns: the middle column of segments crosses the axis
    const rules: L.Rules = { revisit: "block", mirror: (n) => mirrorCorner(g, n, "left-right") };
    const c = L.moveTo(corners, rules, L.begin(v(3, 0)), [30, 30]);
    expect(c.path).toEqual([v(3, 0), v(3, 1)]);
    expect(c.toward).toBe(v(3, 2));
    expect(c.t).toBeCloseTo(L.MEET_REACH);
  });
  it("stops short of the mirror axis's corners", () => {
    const g4 = squareGrid(2, 2), at4 = (n: number): L.XY => { const [r, c] = g4.cornerRC(n); return [c * S, r * S]; };
    const t = L.cornerTrack(g4, at4), rules: L.Rules = { revisit: "block", mirror: (n) => mirrorCorner(g4, n, "left-right") };
    const c = L.moveTo(t, rules, L.begin(g4.corner(2, 0)), [20, 20]);
    expect(c.path).toEqual([g4.corner(2, 0)]);
    expect(c.t).toBeCloseTo(L.BUMP_REACH);
  });
});

describe("ends and release", () => {
  it("pushes out into an end's stub", () => {
    const t = L.cornerTrack(g, at, { ends: [v(0, 3)], stub: 3 });
    const c = L.moveTo(t, block, L.begin(v(0, 0)), [30, -10]);
    expect(c.path).toEqual([v(0, 0), v(0, 1), v(0, 2), v(0, 3), g.cornerCount]);
    expect(L.edgesOf(t, c.path)).toHaveLength(3);
  });
  it("mirrors a stub to the stub at the mirrored corner", () => {
    const t = L.cornerTrack(g, at, { ends: [v(0, 0), v(0, 3)], stub: 3 });
    const m = L.trackMirror(t, g.cornerCount, (n) => mirrorCorner(g, n, "left-right"));
    expect(m(g.cornerCount)).toBe(g.cornerCount + 1);
    expect(m(v(1, 1))).toBe(v(1, 2));
  });
  it("snaps a partial segment to the nearer node", () => {
    const on = L.moveTo(corners, block, L.begin(v(0, 0)), [6, 0]);
    expect(L.settle(corners, block, on)).toEqual({ path: [v(0, 0), v(0, 1)], toward: -1, t: 0 });
    const off = L.moveTo(corners, block, L.begin(v(0, 0)), [4, 0]);
    expect(L.settle(corners, block, off)).toEqual({ path: [v(0, 0)], toward: -1, t: 0 });
  });
  it("doesn't snap through a gap or into its own line", () => {
    const gap = g.cornerBorders[v(0, 0)].find((e) => g.borders[e].corners.includes(v(0, 1)))!;
    const t = L.cornerTrack(g, at, { gaps: new Set([gap]) });
    const c = L.moveTo(t, block, L.begin(v(0, 0)), [9, 0]);
    expect(L.settle(t, block, c).path).toEqual([v(0, 0)]);
  });
});

describe("cell tracks and strokes", () => {
  const centre = (i: number): L.XY => { const [r, c] = g.rc(i); return [c * S + S / 2, r * S + S / 2]; };
  it("runs through open links only", () => {
    const wall = g.links.find((l) => l.cells.includes(0) && l.cells.includes(1))!.id;
    const t = L.cellTrack(g, centre, (l) => l !== wall);
    const c = L.moveTo(t, { revisit: "close" }, L.begin(0), [25, 5]);
    expect(c).toEqual({ path: [0], toward: -1, t: 0 });
    expect(L.edgesOf(L.cellTrack(g, centre), [0, 1, 4])).toEqual([g.borders[g.borderBetween(0, 1)].link, g.borders[g.borderBetween(1, 4)].link]);
  });
  it("tells a stroke what it added and took back", () => {
    const t = L.cellTrack(g, centre);
    expect(L.diffPaths(t, [0], [0, 1, 2]).added).toHaveLength(2);
    const d = L.diffPaths(t, [0, 1, 2], [0, 1, 4]);
    expect(d.removed).toEqual(L.edgesOf(t, [1, 2]));
    expect(d.added).toEqual(L.edgesOf(t, [1, 4]));
    expect(L.diffPaths(t, [0, 1], [0, 1])).toEqual({ removed: [], added: [] });
  });
  it("finds the node nearest a point", () => {
    expect(L.nearestNode(corners, [11, 19]).n).toBe(v(2, 1));
  });
});
