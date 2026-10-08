// The AI creators' schedule: post slots in their time zones (across clock changes), the difficulty
// curves, which scheduled drafts are due, and the admin endpoint's checks of a queued post.
import { describe, expect, it } from "vitest";
import { PERSONAS, GENERATOR_GENRES, type Persona } from "~/ai/personas";
import { difficultyOf, dueToPublish, isoWeek, isPrime, localDate, moonLit, pairRole, postInstant, slotsBetween, tideStrength, zonedTime } from "~/ai/schedule";
import { checkScheduleRequest, sha256 } from "~/ai/request";

const persona = (over: Partial<Persona> & { schedule: Persona["schedule"] }): Persona => ({ ...PERSONAS[1], ...over });
const DAY = 86400e3;

describe("time zones", () => {
  it("finds a local wall-clock time's instant, either side of a clock change", () => {
    // New York: EDT (UTC-4) until Nov 1 2026, then EST (UTC-5)
    expect(zonedTime(2026, 10, 31, 23, 47, "America/New_York").toISOString()).toBe("2026-11-01T03:47:00.000Z");
    expect(zonedTime(2026, 11, 2, 23, 47, "America/New_York").toISOString()).toBe("2026-11-03T04:47:00.000Z");
    // London: BST until Oct 25 2026
    expect(zonedTime(2026, 10, 24, 11, 5, "Europe/London").toISOString()).toBe("2026-10-24T10:05:00.000Z");
    expect(zonedTime(2026, 10, 26, 11, 5, "Europe/London").toISOString()).toBe("2026-10-26T11:05:00.000Z");
    // Auckland is ahead of UTC: 9:30 pm is the same day's morning in UTC
    expect(zonedTime(2026, 10, 12, 21, 30, "Pacific/Auckland").toISOString()).toBe("2026-10-12T08:30:00.000Z");
  });

  it("reads an instant's local date and weekday", () => {
    // 03:47 UTC on Nov 1 is still Saturday Oct 31 in New York
    expect(localDate(new Date("2026-11-01T03:47:00Z"), "America/New_York")).toMatchObject({ date: "2026-10-31", weekday: "sat" });
    expect(localDate(new Date("2026-10-11T21:00:00Z"), "Asia/Tokyo")).toMatchObject({ date: "2026-10-12", weekday: "mon" });
  });

  it("puts sunrise posts at sunrise, on the right local day", () => {
    const t = postInstant({ at: "sunrise", lat: 35.01, lon: 135.77 }, 2026, 10, 12, "Asia/Tokyo");
    expect(localDate(t, "Asia/Tokyo").date).toBe("2026-10-12");
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(t);
    expect(hm >= "05:45" && hm <= "06:10").toBe(true);   // Kyoto, mid-October: about 5:57
    // midsummer is earlier than midwinter
    const june = postInstant({ at: "sunrise", lat: 35.01, lon: 135.77 }, 2026, 6, 21, "Asia/Tokyo");
    const dec = postInstant({ at: "sunrise", lat: 35.01, lon: 135.77 }, 2026, 12, 21, "Asia/Tokyo");
    const minutes = (d: Date) => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(d).split(":").map(Number); return h * 60 + m; };
    expect(minutes(june)).toBeLessThan(minutes(dec) - 90);
  });
});

describe("slots", () => {
  const from = new Date("2026-10-11T22:00:00Z"), to = new Date(from.getTime() + 7 * DAY);

  it("gives a daily creator seven posts a week, at its local time", () => {
    const clerk = PERSONAS.find((p) => p.handle === "night-clerk")!;
    const slots = slotsBetween(clerk, from, to);
    expect(slots).toHaveLength(7);
    for (const s of slots) {
      expect(new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }).format(s.at)).toBe("23:47");
      expect(s.at >= from && s.at < to).toBe(true);
    }
    expect(new Set(slots.map((s) => s.date)).size).toBe(7);
  });

  it("keeps the local time across a clock change", () => {
    const p = persona({ schedule: { timezone: "Europe/London", days: ["sat", "sun", "mon"], time: { at: "11:05" }, summary: "" } });
    const slots = slotsBetween(p, new Date("2026-10-23T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(slots.map((s) => s.at.toISOString())).toEqual(["2026-10-24T10:05:00.000Z", "2026-10-25T11:05:00.000Z", "2026-10-26T11:05:00.000Z"]);
  });

  it("posts only on the persona's weekdays", () => {
    const granny = PERSONAS.find((p) => p.handle === "granny-rect")!;
    expect(slotsBetween(granny, from, to).map((s) => s.weekday)).toEqual(["mon", "wed", "fri", "sun"]);
  });

  it("posts on prime dates", () => {
    const p = persona({ schedule: { timezone: "Europe/Lisbon", days: "prime-dates", time: { at: "14:00" }, summary: "" } });
    const slots = slotsBetween(p, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(slots.map((s) => Number(s.date.slice(8)))).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);
    expect([1, 2, 9, 29, 31].map(isPrime)).toEqual([false, true, false, true, true]);
  });

  it("pairs a pair persona's two days within one ISO week", () => {
    const bb = PERSONAS.find((p) => p.pairs)!;
    const [a, b] = slotsBetween(bb, from, to);
    expect([pairRole(bb, a.weekday), pairRole(bb, b.weekday)]).toEqual([0, 1]);
    expect(isoWeek(a.date)).toBe(isoWeek(b.date));
    expect(isoWeek("2026-10-07")).toBe("2026-W41");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("difficulty", () => {
  const at = new Date("2026-10-14T12:00:00Z");
  it("follows the weekday table", () => {
    const by = { mon: 0.1, tue: 0.2, wed: 0.3, thu: 0.4, fri: 0.5, sat: 0.6, sun: 0.9 };
    expect(difficultyOf({ kind: "weekday", by }, at, "2026-10-18", "sun")).toBe(0.9);
  });
  it("follows the moon: hard at full, easy at new", () => {
    const scheme = { kind: "lunar", low: 0.1, high: 0.9 } as const;
    expect(moonLit(new Date("2026-10-26T04:00:00Z"))).toBeGreaterThan(0.98);   // full moon
    expect(moonLit(new Date("2026-10-10T16:00:00Z"))).toBeLessThan(0.02);      // new moon
    expect(difficultyOf(scheme, new Date("2026-10-26T04:00:00Z"), "2026-10-26", "mon")).toBeCloseTo(0.9, 1);
    expect(difficultyOf(scheme, new Date("2026-10-10T16:00:00Z"), "2026-10-10", "sat")).toBeCloseTo(0.1, 1);
  });
  it("follows the tides: spring tides at new and full moon, neaps at the quarters", () => {
    expect(tideStrength(new Date("2026-10-26T04:00:00Z"))).toBeGreaterThan(0.95);
    expect(tideStrength(new Date("2026-10-10T16:00:00Z"))).toBeGreaterThan(0.95);
    expect(tideStrength(new Date("2026-10-18T12:00:00Z"))).toBeLessThan(0.1);   // first quarter
  });
  it("is steady with a fixed wobble, and rises through the month", () => {
    const steady = { kind: "steady", level: 0.5, wobble: 0.2 } as const;
    const a = difficultyOf(steady, at, "2026-10-14", "wed");
    expect(a).toBe(difficultyOf(steady, at, "2026-10-14", "wed"));
    expect(Math.abs(a - 0.5)).toBeLessThanOrEqual(0.1);
    const month = { kind: "month", low: 0, high: 1 } as const;
    expect(difficultyOf(month, at, "2026-10-01", "thu")).toBe(0);
    expect(difficultyOf(month, at, "2026-10-31", "sat")).toBe(1);
  });
  it("stays within 0..1 for every persona's slots", () => {
    for (const p of PERSONAS) for (const s of slotsBetween(p, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))) {
      expect(s.difficulty).toBeGreaterThanOrEqual(0);
      expect(s.difficulty).toBeLessThanOrEqual(1);
    }
  });
});

describe("the personas", () => {
  it("have unique, valid handles and cover most of the generator's genres", () => {
    const handles = PERSONAS.map((p) => p.handle);
    expect(new Set(handles).size).toBe(handles.length);
    for (const h of handles) expect(h).toMatch(/^[a-z][a-z0-9-]{2,29}$/);
    const covered = new Set(PERSONAS.flatMap((p) => p.genres.map((g) => g.genre)));
    expect(covered.size).toBeGreaterThanOrEqual(GENERATOR_GENRES.length * 0.8);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(8);
  });
});

describe("publishing what's due", () => {
  it("publishes only scheduled drafts whose time has come", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    const games = [
      { id: "due", state: "draft", publishAt: new Date("2026-10-12T09:59:00Z") },
      { id: "exactly", state: "draft", publishAt: now },
      { id: "later", state: "draft", publishAt: new Date("2026-10-12T10:01:00Z") },
      { id: "plain-draft", state: "draft", publishAt: null },
      { id: "published", state: "published", publishAt: new Date("2026-10-12T09:00:00Z") },
      { id: "hidden", state: "hidden", publishAt: new Date("2026-10-12T09:00:00Z") },
    ];
    expect(dueToPublish(games, now).map((g) => g.id)).toEqual(["due", "exactly"]);
  });
});

describe("checking a queued post", () => {
  const now = new Date("2026-10-11T22:00:00Z");
  const sketch = 'sudoku\n{"size":[4,4],"givens":[{"at":"cell","cell":[0,0],"kind":"number","value":1}]}';
  const body = async (over: Record<string, unknown> = {}) => ({
    persona: "night-clerk", sketch, title: "Room 214", description: "Guest arrived 11:40.", publishAt: "2026-10-12T03:47:00Z",
    proof: { solutions: 1, sketchHash: await sha256(sketch), solver: "test" }, ...over,
  });

  it("accepts a good one", async () => {
    const r = await checkScheduleRequest(await body(), now);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.kind).toBe("sudoku"); expect(r.publishAt.toISOString()).toBe("2026-10-12T03:47:00.000Z"); }
  });
  it("refuses creators that aren't AI personas", async () => {
    expect(await checkScheduleRequest(await body({ persona: "wyatt" }), now)).toMatchObject({ ok: false, status: 404 });
  });
  it("refuses a sketch that doesn't parse, or a type the persona doesn't make", async () => {
    const bad = "sudoku\n{not json";
    expect(await checkScheduleRequest(await body({ sketch: bad, proof: { solutions: 1, sketchHash: await sha256(bad), solver: "t" } }), now)).toMatchObject({ ok: false, status: 400 });
    const other = 'akari\n{"size":[3,3],"givens":[]}';
    const r = await checkScheduleRequest(await body({ sketch: other, proof: { solutions: 1, sketchHash: await sha256(other), solver: "t" } }), now);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/doesn't make akari/);
  });
  it("needs a proof of one solution for this exact sketch", async () => {
    expect(await checkScheduleRequest(await body({ proof: { solutions: 1, sketchHash: "0".repeat(64), solver: "t" } }), now)).toMatchObject({ ok: false });
    expect(await checkScheduleRequest(await body({ proof: { solutions: 2, sketchHash: await sha256(sketch), solver: "t" } }), now)).toMatchObject({ ok: false });
  });
  it("needs a sensible time and a title", async () => {
    expect(await checkScheduleRequest(await body({ publishAt: "2026-10-01T00:00:00Z" }), now)).toMatchObject({ ok: false });
    expect(await checkScheduleRequest(await body({ publishAt: "2027-01-01T00:00:00Z" }), now)).toMatchObject({ ok: false });
    expect(await checkScheduleRequest(await body({ publishAt: "soon" }), now)).toMatchObject({ ok: false });
    expect(await checkScheduleRequest(await body({ title: "  " }), now)).toMatchObject({ ok: false });
  });
});
