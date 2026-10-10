// Slate's lessons (puzzles/ai/lesson.ts, docs/research-tutorials.md §4): the curriculum walks one
// subject a week in order and wraps round, each weekday is one step, the checks let a good lesson
// through and reject one a wrong reading also solves, and the words never state the rule.
import { describe, expect, it } from "vitest";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { personaByHandle, SLATE_CURRICULUM } from "~/ai/personas";
import { lessonFor, lessonSettings, lessonSizes, planFor, slotsBetween, mondayOf } from "~/ai/schedule";
import { checkLesson, contrastEdits, givensApart, rivalsOf, ruleWords, swapped, tellsRule, titlePrefix } from "../../../puzzles/ai/lesson.ts";
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
