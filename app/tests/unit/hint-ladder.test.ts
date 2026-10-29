import { describe, expect, it } from "vitest";
import { expose, FADE_AFTER, firstOpen, type Ladder, nextHint, nothingShown, passed, readLadder, reveal, skipped, styleProblems, textFor } from "~site/lib/hint-ladder";

const ladder = (): Ladder => ({
  version: "test-1",
  opening: [{ kind: "start", text: "Start with the corners." }, { kind: "habit", text: "Dot every square you know is empty." }],
  points: [
    { marks: [["shade", 0, 1], ["shade", 1, 2], ["shade", 2, 1]], rungs: [
      { kind: "where", text: "Early on, look here.", area: [0, 1, 2] },
      { kind: "rule", text: "Whenever a 3 sits in a corner, two of its sides are lit. Which?", technique: "corner-3", short: "A corner-3 spot." },
      { kind: "step", text: "This square has a bulb.", area: [0] },
    ] },
    { marks: [["digit", 5, 4]], rungs: [{ kind: "where", text: "Midway, look at this row." }, { kind: "step", text: "This square is 4." }] },
  ],
});

describe("reading a ladder", () => {
  it("keeps a good ladder as it is", () => {
    expect(readLadder(JSON.parse(JSON.stringify(ladder())))).toEqual(ladder());
  });
  it("drops what's off the board, the wrong kind, or malformed", () => {
    const l = readLadder({
      version: "v", opening: [{ kind: "where", text: "not an opening kind" }, { kind: "start", text: "ok" }],
      points: [
        { marks: [["shade", 0, 1], ["bogus", 1, 1], ["digit", -1, 2]], rungs: [{ kind: "where", text: "here", area: [0, 99, -1, 1.5] }, { kind: "start", text: "x" }] },
        { marks: [], rungs: [] },
      ],
    }, 10);
    expect(l?.opening).toEqual([{ kind: "start", text: "ok" }]);
    expect(l?.points).toEqual([{ marks: [["shade", 0, 1]], rungs: [{ kind: "where", text: "here", area: [0] }] }]);
  });
  it("refuses nothing usable", () => {
    expect(readLadder(null)).toBeNull();
    expect(readLadder({ version: "v", opening: [], points: [] })).toBeNull();
    expect(readLadder({ opening: [{ kind: "start", text: "x" }], points: [] })).toBeNull();
  });
  it("flags long, formatted, or untagged rungs", () => {
    const l = ladder();
    l.points[0].rungs[1] = { kind: "rule", text: `**${Array(45).fill("word").join(" ")}**` };
    expect(styleProblems(l)).toEqual(["point 1 rung 2: 45 words (at most 40)", "point 1 rung 2: formatting characters (plain text only)", "point 1 rung 2: a rule rung names no technique"]);
    expect(styleProblems(ladder())).toEqual([]);
  });
});

describe("where the player is", () => {
  it("passes a point once two thirds of its marks are made", () => {
    const p = ladder().points[0];
    expect(passed(p, { shade: [1, 0, 0] })).toBe(false);
    expect(passed(p, { shade: [1, 2, 0] })).toBe(true);
    expect(passed(p, null)).toBe(false);
    expect(passed({ marks: [], rungs: [] }, { shade: [1] })).toBe(false);
  });
  it("counts a later point as passing the earlier ones", () => {
    const l = ladder();
    expect(firstOpen(l, {})).toBe(0);
    expect(firstOpen(l, { digit: [0, 0, 0, 0, 0, 4] })).toBe(2);
    expect(firstOpen(l, { shade: [1, 0, 1] })).toBe(1);
  });
});

describe("the next hint", () => {
  it("opens the opening, then the first point's rungs in order, then hands over to show me", () => {
    const l = ladder();
    let shown = nothingShown();
    const order: string[] = [];
    for (let n = nextHint(l, shown, {}); n; n = nextHint(l, shown, {})) {
      order.push(n.section === "opening" ? `o${n.rung}` : `p${n.point}r${n.rung}`);
      shown = reveal(shown, n);
    }
    expect(order).toEqual(["o0", "o1", "p0r0", "p0r1", "p0r2"]);
  });
  it("skips the opening and passed points once the player is past one", () => {
    const l = ladder(), board = { shade: [1, 2, 1] };
    expect(nextHint(l, nothingShown(), board)).toEqual({ section: "point", point: 1, rung: 0 });
    expect(skipped(l, nothingShown(), board)).toEqual([0]);
    // a point whose every hint was opened isn't counted as skipped
    expect(skipped(l, { opening: 2, points: [3] }, board)).toEqual([]);
  });
  it("moves on to the next point once the player passes the one they were on", () => {
    const l = ladder();
    const shown: ReturnType<typeof nothingShown> = { opening: 2, points: [3] };
    expect(nextHint(l, shown, {})).toBeNull();
    expect(nextHint(l, shown, { shade: [1, 2, 0] })).toEqual({ section: "point", point: 1, rung: 0 });
  });
  it("has nothing past the last point", () => {
    expect(nextHint(ladder(), nothingShown(), { shade: [1, 2, 1], digit: [0, 0, 0, 0, 0, 4] })).toBeNull();
  });
});

describe("fading", () => {
  it("shrinks a rule to its short form after it's been shown often", () => {
    const r = ladder().points[0].rungs[1];
    let seen = {};
    for (let k = 0; k < FADE_AFTER; k++) { expect(textFor(r, seen).faded).toBe(false); seen = expose(seen, r); }
    expect(textFor(r, seen)).toEqual({ text: "A corner-3 spot.", faded: true });
    // a where or a step never fades
    expect(textFor(ladder().points[0].rungs[0], { "corner-3": 10 }).faded).toBe(false);
  });
});
