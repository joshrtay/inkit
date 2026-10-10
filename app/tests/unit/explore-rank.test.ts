// Explore's formulas (app/lib/rank.ts) and each game's difficulty estimate (app/games/estimate.ts).
import { describe, expect, it } from "vitest";
import { activity, ago, averageLikes, cantRecommend, creatorScore, dedupeByName, firstLine, MAX_RECOMMENDATIONS, nameKey, pickOfTheDay, pickVaried, rankCreators, rankToday, todayScore } from "~/lib/rank";
import { estimate, levelOf, minutesOf } from "~/games/estimate";
import { PERSONAS } from "~/ai/personas";

const H = 3600e3, D = 86400e3, NOW = Date.parse("2026-10-09T18:00:00Z");

describe("Today", () => {
  it("is (likes + 1) / (hours + 2)^1.2", () => {
    expect(todayScore(0, 0)).toBeCloseTo(1 / 2 ** 1.2);
    expect(todayScore(3, 24)).toBeCloseTo(4 / 26 ** 1.2);
  });
  it("newer beats older at equal likes, and likes keep a puzzle up", () => {
    expect(todayScore(0, 1)).toBeGreaterThan(todayScore(0, 5));
    expect(todayScore(5, 5)).toBeGreaterThan(todayScore(0, 5));
  });
  it("a day-old puzzle with a few likes outranks unliked ones more than about six hours old", () => {
    expect(todayScore(3, 24)).toBeGreaterThan(todayScore(0, 7));
    expect(todayScore(3, 24)).toBeLessThan(todayScore(0, 5));
  });
  it("ranks, at most two from one creator, people and AI mixed", () => {
    const p = (id: string, authorId: string, hours: number, likes = 0) => ({ id, authorId, likes, publishedAt: NOW - hours * H });
    const items = [p("a1", "ai", 1), p("a2", "ai", 2), p("a3", "ai", 3), p("h1", "maren", 30, 6), p("h2", "june", 10)];
    const ranked = rankToday(items, NOW, 10);
    expect(ranked.map((x) => x.id)).toEqual(["a1", "a2", "h1", "h2"]);
    expect(rankToday(items, NOW, 2).map((x) => x.id)).toEqual(["a1", "a2"]);
  });
});

describe("creators", () => {
  const c = (id: string, name: string, puzzles: number, likes: number, recentDays: number[] = []) => ({ id, name, puzzles, likes, recent: recentDays.map((d) => NOW - d * D) });

  it("activity: each puzzle of the last 30 days, worth less as it ages", () => {
    expect(activity([NOW], NOW)).toBeCloseTo(1);
    expect(activity([NOW - 14 * D], NOW)).toBeCloseTo(Math.exp(-1));
    expect(activity([NOW - 31 * D], NOW)).toBe(0);
  });
  it("a Bayesian average: one lucky puzzle doesn't beat a steady record", () => {
    const avg = 2;
    const lucky = creatorScore(c("a", "A", 1, 10), avg, NOW);
    const steady = creatorScore(c("b", "B", 20, 120), avg, NOW);
    expect(steady).toBeGreaterThan(lucky);
    // with no likes and no activity: below the average
    expect(creatorScore(c("z", "Z", 3, 0), avg, NOW)).toBeLessThan(avg);
  });
  it("recent activity lifts a creator, saturating", () => {
    const avg = 2;
    const quiet = creatorScore(c("a", "A", 10, 20), avg, NOW);
    const active = creatorScore(c("b", "B", 10, 20, [1, 3, 5]), avg, NOW);
    const busy = creatorScore(c("c", "C", 10, 20, Array.from({ length: 30 }, (_, i) => i)), avg, NOW);
    expect(active).toBeGreaterThan(quiet);
    expect(busy - quiet).toBeLessThanOrEqual(Math.max(1, avg) + 1e-9);
  });
  it("leaves out empty accounts and keeps each person once, at their best place", () => {
    const cs = [c("1", "Arlo Tabak", 1, 0), c("2", "Arlo Tabak", 2, 9, [2]), c("3", "Josh Taylor", 0, 0), c("4", "June", 3, 3)];
    const ranked = rankCreators(cs, NOW);
    expect(ranked.map((x) => x.id)).toEqual(["2", "4"]);
    expect(averageLikes(cs)).toBeCloseTo(12 / 6);
  });
  it("names match ignoring case, spaces and punctuation", () => {
    expect(nameKey("Arlo  Tabak")).toBe(nameKey("arlo-tabak"));
    expect(dedupeByName([{ name: "Sam R." }, { name: "sam r" }, { name: "Sam Rivera" }]).map((x) => x.name)).toEqual(["Sam R.", "Sam Rivera"]);
  });
});

describe("shelves", () => {
  it("picks a different type each, then fills up", () => {
    const xs = ["a", "a", "b", "c", "b"].map((kind, i) => ({ kind, i }));
    expect(pickVaried(xs, 3).map((x) => x.i)).toEqual([0, 2, 3]);
    expect(pickVaried(xs, 4).map((x) => x.i)).toEqual([0, 2, 3, 1]);
  });
  it("one recommender a day", () => {
    expect(pickOfTheDay([], NOW)).toBeUndefined();
    expect(pickOfTheDay(["a", "b"], NOW)).not.toBe(pickOfTheDay(["a", "b"], NOW + D));
  });
  it("says how long ago", () => {
    expect(ago(NOW - 10 * 60e3, NOW)).toBe("just now");
    expect(ago(NOW - 2 * H, NOW)).toBe("2 h ago");
    expect(ago(NOW - 3 * D, NOW)).toBe("3 d ago");
    expect(ago(NOW - 70 * D, NOW)).toBe("2 mo ago");
  });
  it("a verse bio's first line, with no ' / '", () => {
    expect(firstLine("Sums and paths; / Gentle in September")).toBe("Sums and paths;");
    expect(firstLine("One line.")).toBe("One line.");
  });
});

describe("recommendations", () => {
  it("not yourself, not twice, not someone missing, at most five", () => {
    expect(cantRecommend("me", { id: "me", deleted: false }, [])).toMatch(/yourself/);
    expect(cantRecommend("me", null, [])).toMatch(/no one/);
    expect(cantRecommend("me", { id: "x", deleted: true }, [])).toMatch(/no one/);
    expect(cantRecommend("me", { id: "x", deleted: false }, ["x"])).toMatch(/already/);
    expect(cantRecommend("me", { id: "x", deleted: false }, ["a", "b", "c", "d", "e"])).toMatch(/up to 5/);
    expect(cantRecommend("me", { id: "x", deleted: false }, ["a"])).toBeNull();
  });
  it("every AI creator's picks are other creators, at most five", () => {
    const handles = new Set(PERSONAS.map((p) => p.handle));
    for (const p of PERSONAS) {
      const picks = p.recommends ?? [];
      expect(picks.length, p.handle).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
      expect(picks.every((r) => r.handle !== p.handle && handles.has(r.handle) && r.note.length > 0), p.handle).toBe(true);
    }
  });
});

describe("the difficulty estimate", () => {
  const sudoku = (n: number, clues: number) => ({ size: [n, n] as [number, number], givens: Array.from({ length: clues }, (_, i) => ({ kind: "digit", at: "cell", cell: [Math.floor(i / n), i % n], is: 1 })) as never[] });

  it("levels and minutes from the difficulty", () => {
    expect([levelOf(0.2), levelOf(0.5), levelOf(0.8)]).toEqual([1, 2, 3]);
    expect(minutesOf(36, 0.3)).toBe(4);
    expect(minutesOf(4, 0)).toBe(1);
    expect(minutesOf(900, 1)).toBe(90);
  });
  it("bigger and sparser is harder and longer", () => {
    const small = estimate("sudoku", sudoku(4, 6)), big = estimate("sudoku", sudoku(9, 30)), sparse = estimate("sudoku", sudoku(9, 22));
    expect(small.level).toBe(1);
    expect(small.minutes).toBeLessThanOrEqual(5);
    expect(big.difficulty).toBeGreaterThan(small.difficulty);
    expect(sparse.difficulty).toBeGreaterThan(big.difficulty);
    expect(sparse.minutes).toBeGreaterThan(small.minutes);
  });
  it("a type's lean nudges it", () => {
    const spec = { size: [7, 7] as [number, number], givens: [] };
    expect(estimate("star-battle", spec).difficulty).toBeGreaterThan(estimate("simple-path", spec).difficulty);
  });
  it("a scorer's difficulty wins when there is one", () => {
    const e = estimate("sudoku", sudoku(9, 30), 0.9);
    expect(e).toEqual({ difficulty: 0.9, level: 3, minutes: minutesOf(81, 0.9) });
    expect(estimate("sudoku", sudoku(9, 30), 3).difficulty).toBe(1);
  });
  it("stays in 0..1", () => {
    for (const n of [3, 10, 20]) for (const c of [0, 5, 50]) {
      const e = estimate("nurikabe", sudoku(n, Math.min(c, n * n)));
      expect(e.difficulty).toBeGreaterThanOrEqual(0);
      expect(e.difficulty).toBeLessThanOrEqual(1);
    }
  });
});
