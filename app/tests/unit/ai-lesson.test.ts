// Slate's lessons (puzzles/ai/lesson.ts, docs/research-tutorials.md §4): the curriculum walks one
// subject a week in order and wraps round, each weekday is one step, the checks let a good lesson
// through and reject one a wrong reading also solves, and the words never state the rule.
import { describe, expect, it } from "vitest";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { personaByHandle, SLATE_CURRICULUM } from "~/ai/personas";
import { historySlots, lessonFor, lessonSettings, lessonSizes, localDate, planFor, slotsBetween, mondayOf } from "~/ai/schedule";
import { areaOf, checkLesson, contrastEdits, givensApart, pointsTooMuch, rivalsOf, ruleWords, swapped, tellsRule, titlePrefix } from "../../../puzzles/ai/lesson.ts";
import { RIVALS } from "../../../puzzles/ai/rivals.ts";

const slate = personaByHandle("slate")!;
const subject = (id: string) => SLATE_CURRICULUM.find((s) => s.id === id)!;
const DAY = 86400e3;

describe("Slate's curriculum", () => {
  it("takes one subject a week, in order, Monday to Friday, and wraps round", () => {
    const start = Date.parse(`${slate.curriculumStart}T00:00:00Z`), n = SLATE_CURRICULUM.length;
    const weeks = Array.from({ length: n + 2 }, (_, w) => slotsBetween(slate, new Date(start + w * 7 * DAY), new Date(start + (w + 1) * 7 * DAY)));
    weeks.forEach((slots, w) => {
      expect(slots.map((s) => s.weekday)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
      const subject = SLATE_CURRICULUM[w % n];
      expect(slots.map((s) => lessonFor(slate, s)!.step)).toEqual(subject.review ? Array(5).fill("review")
        : ["introduce", "contrast", "second-contrast", "trap", subject.with ? "combine" : "review"]);
      for (const s of slots) expect(lessonFor(slate, s)!.subject.id).toBe(subject.id);
      // a review week takes its earlier subjects in turn; a Friday with nothing to combine reviews the week before's
      if (subject.review) expect(slots.map((s) => lessonFor(slate, s)!.focus.id)).toEqual([0, 1, 2, 3, 4].map((d) => subject.review![d % subject.review!.length]));
      else if (!subject.with && w % n > 0) expect(lessonFor(slate, slots[4])!.focus.id).toBe(SLATE_CURRICULUM.slice(0, w % n).filter((s) => !s.review).at(-1)!.id);
    });
    expect(lessonFor(slate, { date: "2026-10-12", weekday: "mon" })!.round).toBe(1);
  });
  it("has the whole curriculum posted by the week of 5 October 2026, the next week starting again", () => {
    expect(mondayOf(slate.curriculumStart!)).toBe(slate.curriculumStart);
    expect(lessonFor(slate, { date: "2026-10-09", weekday: "fri" })!.index).toBe(SLATE_CURRICULUM.length - 1);
    expect(lessonFor(slate, { date: "2026-10-12", weekday: "mon" })!.index).toBe(0);
  });
  it("tells its back catalogue a week a day, from 10 August to 9 October 2026, in order", () => {
    const slots = historySlots(slate), n = SLATE_CURRICULUM.length;
    expect(slots).toHaveLength(n * 5);
    expect(new Set(slots.map((s) => s.at.getTime())).size).toBe(slots.length);
    const day = (s: { at: Date }) => localDate(s.at, slate.schedule.timezone).date;
    expect(day(slots[0])).toBe("2026-08-10");
    expect(day(slots.at(-1)!)).toBe("2026-10-09");
    const perDay = new Map<string, number>();
    for (const s of slots) perDay.set(day(s), (perDay.get(day(s)) ?? 0) + 1);
    expect(perDay.size).toBe(61);
    expect([...perDay.values()].filter((k) => k === 10)).toHaveLength(n - 61);
    expect([...perDay.values()].every((k) => k === 5 || k === 10)).toBe(true);
    // in curriculum order and in time order alike, each post the curriculum day it stands for
    for (let i = 1; i < slots.length; i++) expect(slots[i].at.getTime()).toBeGreaterThan(slots[i - 1].at.getTime());
    slots.forEach((s, i) => { const l = lessonFor(slate, s)!; expect(l.week).toBe(Math.floor(i / 5)); expect(l.day).toBe(i % 5); });
    // and the live schedule carries on the next Monday with the curriculum's first week
    expect(lessonFor(slate, { date: "2026-10-12", weekday: "mon" })).toMatchObject({ index: 0, round: 1 });
  });
  it("puts every subject after the ones it needs, and gives each its rivals", () => {
    const at = new Map(SLATE_CURRICULUM.map((s, i) => [s.id, i]));
    expect(at.size).toBe(SLATE_CURRICULUM.length);
    for (const s of SLATE_CURRICULUM) {
      for (const r of [...(s.requires ?? []), ...(s.with ? [s.with] : []), ...(s.partner ? [s.partner] : []), ...(s.review ?? [])]) expect(at.get(r), `${s.id} needs ${r}`).toBeLessThan(at.get(s.id)!);
      if (!s.review) expect(rivalsOf(s).length, s.id).toBeGreaterThan(0);
    }
    // every rival set is some subject's
    const used = new Set(SLATE_CURRICULUM.map((s) => s.rivals ?? s.id));
    for (const k of Object.keys(RIVALS)) expect(used.has(k), k).toBe(true);
  });
  it("follows docs/tutorial-sequences.md: two or more weeks a panel symbol, a review week every four to six", () => {
    const panel = SLATE_CURRICULUM.filter((s) => s.genre === "panel" && !s.review);
    expect(panel.length).toBeGreaterThanOrEqual(16);
    expect(panel.filter((s) => s.sizes[0][0] * s.sizes[0][1] <= 2).length).toBeGreaterThanOrEqual(4);   // 2 × 1 and 1 × 2 openers
    const reviews = SLATE_CURRICULUM.flatMap((s, i) => (s.review ? [i] : []));
    reviews.forEach((i, k) => expect(i - (k ? reviews[k - 1] : -1)).toBeLessThanOrEqual(7));
    expect(SLATE_CURRICULUM.length - reviews.at(-1)!).toBeLessThanOrEqual(7);
  });
  it("makes every type it lists, and only from its curriculum", () => {
    expect(new Set(slate.genres.map((g) => g.genre))).toEqual(new Set(SLATE_CURRICULUM.map((s) => s.genre)));
  });
  it("plans the week's subject at the day's step: the smallest board first, Friday's company", () => {
    const week = (d: string) => slotsBetween(slate, new Date(`${d}T00:00:00Z`), new Date(Date.parse(`${d}T00:00:00Z`) + 7 * DAY));
    const squares = week(slate.curriculumStart!);   // week 1
    const plans = squares.map((s) => planFor(slate, s));
    expect(plans.map((x) => x.lesson!.subject.id)).toEqual(Array(5).fill("panel:squares"));
    expect(plans[0].plan.sizes).toEqual([[2, 1]]);
    expect(plans.map((x) => x.mix)).toEqual(Array(5).fill("squares"));
    expect(lessonSizes(subject("panel:detours"), "combine").every(([r, c]) => r * c > 4)).toBe(true);
    // a symbol's last week meets an earlier one on Friday: erasers go first in a mix; Panes rules merge
    expect(lessonSettings(slate, { focus: subject("panel:detours"), step: "combine" }).mix).toBe("dots+squares");
    expect(lessonSettings(slate, { focus: subject("panel:eraser-squares"), step: "combine" }).mix).toBe("erasers+triangles");
    expect(lessonSettings(slate, { focus: subject("panes:opposites"), step: "combine" }).rules).toBe("size=3,opposites,twins");
  });
});

// The Witness's first black-and-white panel: two cells, one line
const witness: GridSpec = { genre: "panel", size: [2, 1], givens: [
  { at: "cell", cell: [0, 0], kind: "square", color: "black" }, { at: "cell", cell: [1, 0], kind: "square", color: "white" },
  { at: "corner", corner: [1, 0], kind: "start" }, { at: "corner", corner: [1, 1], kind: "end" }] };

describe("the lesson checks", () => {
  it("let a good Monday through", async () => {
    const c = await checkLesson(witness, { focus: subject("panel:squares"), step: "introduce" });
    expect(c.ok, c.notes.join("; ")).toBe(true);
  });
  it("reject a Thursday trap that a wrong reading also solves", async () => {
    // every square on its own gives the same line here, so a player who reads it that way passes
    const c = await checkLesson(witness, { focus: subject("panel:squares"), step: "trap" });
    expect(c.ok).toBe(false);
    expect(c.notes.at(-1)).toMatch(/rival "every square ends up on its own" isn't broken/);
  });
  it("reject a board where the new symbol isn't needed", async () => {
    const plain: GridSpec = { genre: "panel", size: [1, 1], givens: [{ at: "cell", cell: [0, 0], kind: "square", color: "black" }, { at: "corner", corner: [1, 0], kind: "start" }, { at: "corner", corner: [0, 0], kind: "end" }] };
    const c = await checkLesson(plain, { focus: subject("panel:squares"), step: "introduce" });
    expect(c.ok).toBe(false);
  });
  it("take Tuesday from Monday's board with the endpoints moved, as The Witness's Tree Row 1 and 2 do", async () => {
    const edits = contrastEdits(witness, subject("panel:squares"), "endpoint");
    expect(edits.length).toBeGreaterThan(3);
    for (const e of edits) expect(givensApart(witness, e)).toBeLessThanOrEqual(2);
    const row2: GridSpec = { ...witness, givens: [witness.givens![0], witness.givens![1], { at: "corner", corner: [2, 0], kind: "start" }, { at: "corner", corner: [0, 1], kind: "end" }] };
    const c = await checkLesson(row2, { focus: subject("panel:squares"), step: "contrast" }, { previous: witness });
    expect(c.ok, c.notes.join("; ")).toBe(true);
    // the same board isn't a contrast
    expect((await checkLesson(witness, { focus: subject("panel:squares"), step: "contrast" }, { previous: witness })).ok).toBe(false);
  });
  it("take Wednesday from Tuesday's board with a symbol moved: Tree Row 3 and 4, one cut becoming a pocket", async () => {
    const strip = (colors: string[]): GridSpec => ({ genre: "panel", size: [3, 1], givens: [{ at: "corner", corner: [0, 1], kind: "end" }, { at: "corner", corner: [3, 0], kind: "start" },
      ...colors.map((color, r) => ({ at: "cell", cell: [r, 0], kind: "square", color }) as Given)] });
    const row3 = strip(["black", "black", "white"]), row4 = strip(["black", "white", "black"]);
    expect((await checkLesson(row3, { focus: subject("panel:squares"), step: "introduce" })).ok).toBe(true);
    // the two squares trading places is one move; it's the pockets reading, not the one-cut one
    expect(swapped(row3, row4)).toBe(true);
    expect(contrastEdits(row3, subject("panel:squares")).some((e) => givensApart(e, row4) === 0)).toBe(true);
    expect((await checkLesson(row4, { focus: subject("panel:squares"), step: "second-contrast" }, { previous: row3 })).notes.at(-1)).toMatch(/not one cut/);
    // (The Witness's panels may have several lines, and these two share one: ours need a different answer)
    const c = await checkLesson(row4, { focus: subject("panel:pockets"), step: "second-contrast" }, { previous: row3 });
    expect(c.notes.at(-1)).toMatch(/the same answer as the day before's/);
  });
  it("pass a Thursday trap: every reading breaks, and one offers a wrong answer in place of the true one", async () => {
    // a 3 × 3 with two black squares and two white ones (a Thursday Slate made)
    const sq = (r: number, c: number, color: string) => ({ at: "cell", cell: [r, c], kind: "square", color }) as Given;
    const spec: GridSpec = { genre: "panel", size: [3, 3], givens: [
      { at: "corner", corner: [1, 1], kind: "start" }, { at: "corner", corner: [0, 3], kind: "end" },
      sq(1, 2, "black"), sq(0, 1, "black"), sq(0, 2, "white"), sq(2, 2, "white"),
      { at: "line", corners: [[1, 0], [2, 0]], kind: "gap" }, { at: "line", corners: [[2, 1], [3, 1]], kind: "gap" }] };
    const c = await checkLesson(spec, { focus: subject("panel:squares"), step: "trap" });
    expect(c.ok, c.notes.join("; ")).toBe(true);
    expect(c.rivals.every((v) => v.broken)).toBe(true);
    expect(c.notes.join(" ")).toMatch(/trap: .* turns the true one down/);
  });
});

describe("pointing, never telling", () => {
  const squares = subject("panel:squares");
  it("knows the words that state the rule, from the guide and the rivals", () => {
    const words = ruleWords(squares);
    for (const w of ["region", "different", "together"]) expect(words.has(w), w).toBe(true);
    for (const w of ["square", "line", "corner"]) expect(words.has(w), w).toBe(false);
  });
  it("rejects a title or description that states it, and passes one that points", () => {
    expect(tellsRule("Different colours, different regions.", squares)).toEqual(expect.arrayContaining(["different", "regions"]));
    expect(tellsRule("Keep them together.", squares)).toEqual(["together"]);
    expect(titlePrefix({ subject: squares, day: 2 })).toBe("Squares III · ");
    expect(tellsRule(`${titlePrefix({ subject: squares, day: 0 })}Two`, squares)).toEqual([]);
    expect(tellsRule("Two squares. Draw a line.", squares)).toEqual([]);
    expect(tellsRule("Yesterday's board. One square has moved.", squares)).toEqual([]);
  });
});

describe("pointing, never solving", () => {
  // real notes from the first Slate batch (puzzles/ai/out/slate.json), each handing over the solve
  const BAD: [string, Parameters<typeof pointsTooMuch>[1], string][] = [
    ["Yesterday's board. One letter has changed. Start at row 4, column 1, then look at row 3, column 3.", "contrast", "a row or column number"],
    ["Yesterday's board. One block has moved. Look at the bottom row, all four cells, left to right.", "second-contrast", "a scan across the board"],
    ["The smallest board. Find the clue with the fewest open cells next to it. Put your pencil there.", "introduce", "a hand-held move (your pencil, your finger)"],
    ["Two stars on the board. Look at the top row first. Put your finger on the left cell.", "introduce", "more than one instruction"],
    ["Yesterday's board again. The start has moved. Find the circle, then look at row 1, column 1 and row 2, column 1.", "second-contrast", "a row or column number"],
    ["Galaxies again. Start in the second row and go across it, left to right.", "review", "a numbered row or column"],
    ["A new board. Go to the first column. Start at the top and go down.", "trap", "a numbered row or column"],
    ["Yesterday's board again. Find the block. Look at where it sits now, then look at the cells next to it.", "second-contrast", "more than one instruction"],
    ["Number Snake again. Count the cells on the board. Find the clue with the highest number and look at what sits beside it.", "review", "23 words (at most 12)"],
    ["Yesterday's board. One peg is somewhere else. Look at the second square from the left.", "contrast", "a counted position"],
  ];
  it("rejects coordinates, chains of steps, a hand on the pencil and long notes", () => {
    for (const [text, step, why] of BAD) expect(pointsTooMuch(text, step), text).toContain(why);
    expect(pointsTooMuch("Look at r3c4.")).toContain("a cell reference");
    expect(pointsTooMuch("Start at (3, 4).")).toContain("a cell reference");
    expect(pointsTooMuch("The answer is a loop.")).toContain("what the answer is");
    expect(pointsTooMuch("A single dot. The line goes to it.")).toContain("what the answer is");
  });
  it("passes a note that points once, or says nothing", () => {
    const GOOD: [string, Parameters<typeof pointsTooMuch>[1]][] = [
      ["Two squares. Draw a line.", "introduce"], ["Yesterday's board. One square has moved.", "contrast"],
      ["The short way round is tempting.", "second-contrast"], ["", "trap"], ["The corner clue.", "trap"],
      ["The pair of stars is back.", "review"], ["Which letter is alone?", "introduce"], ["Begin at the edge.", "introduce"],
      ["Yesterday's board. Something moved near the top.", "second-contrast"],
    ];
    for (const [text, step] of GOOD) expect(pointsTooMuch(text, step), text).toEqual([]);
  });
  it("checks a title for positions only", () => {
    expect(pointsTooMuch("Row Two", "review", { title: true })).toEqual(["a row or column number"]);
    expect(pointsTooMuch("Second Column", "review", { title: true })).toEqual(["a numbered row or column"]);
    expect(pointsTooMuch("The Long Way", "second-contrast", { title: true })).toEqual([]);
    expect(pointsTooMuch("Yesterday's board. One square has moved.", "contrast", { sameDay: true })).toHaveLength(1);
  });
  it("points at an area of the board, not a cell, and not at all on the tiniest boards", () => {
    expect(areaOf([0], 4, 4)).toBe("the top-left corner");
    expect(areaOf([1, 2], 4, 4)).toBe("the top edge");
    expect(areaOf([5, 6, 9, 10], 4, 4)).toBe("the middle");
    expect(areaOf([13, 18], 5, 5)).toBe("the right side");
    expect(areaOf([0], 2, 3)).toBeNull();
    expect(areaOf([5, 18], 5, 5)).toBeNull();
  });
});
