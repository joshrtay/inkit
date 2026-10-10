// The AI creators' schedule: post slots in their time zones (across clock changes), the difficulty
// curves, which scheduled drafts are due, and the admin endpoint's checks of a queued post.
import { describe, expect, it } from "vitest";
import { PERSONAS, GENERATOR_GENRES, type Persona } from "~/ai/personas";
import { PERSONA_ICONS, personaIcon } from "~/ai/icons";
import { WIP_KINDS } from "~/games/kinds";
import { dayLength, difficultyOf, dueToPublish, isoWeek, isPrime, localDate, moonLit, pairRole, planFor, postInstant, seriesIndex, slotsBetween, tideStrength, zonedTime } from "~/ai/schedule";
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
      expect(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }).format(s.at)).toBe("23:47");
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
    const quillwort = PERSONAS.find((p) => p.handle === "quillwort")!;
    expect(slotsBetween(quillwort, from, to).map((s) => s.weekday)).toEqual(["mon", "wed", "fri"]);
    const granny = PERSONAS.find((p) => p.handle === "granny-rect")!;
    expect(slotsBetween(granny, from, to).map((s) => s.weekday)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
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
  it("follows the seasons, either side of the equator", () => {
    const by = { spring: 0.1, summer: 0.3, autumn: 0.6, winter: 0.9 };
    expect(difficultyOf({ kind: "season", hemisphere: "north", by }, at, "2026-10-14", "wed")).toBe(0.6);
    expect(difficultyOf({ kind: "season", hemisphere: "north", by }, at, "2026-01-14", "wed")).toBe(0.9);
    expect(difficultyOf({ kind: "season", hemisphere: "south", by }, at, "2026-10-14", "wed")).toBe(0.1);
  });
  it("rises through the school year, with a summer break", () => {
    const scheme = { kind: "school-year", low: 0, high: 1, summer: 0.4 } as const;
    expect(difficultyOf(scheme, at, "2026-09-01", "tue")).toBe(0);
    expect(difficultyOf(scheme, at, "2027-06-30", "wed")).toBe(1);
    expect(difficultyOf(scheme, at, "2027-07-15", "thu")).toBe(0.4);
    const feb = difficultyOf(scheme, at, "2027-02-01", "mon");
    expect(feb).toBeGreaterThan(0.45);
    expect(feb).toBeLessThan(0.65);
  });
  it("follows the length of the day: hardest at midwinter", () => {
    const scheme = { kind: "daylight", lat: 44.5, low: 0, high: 1 } as const;
    expect(difficultyOf(scheme, at, "2026-12-21", "mon")).toBeGreaterThan(0.97);
    expect(difficultyOf(scheme, at, "2026-06-21", "sun")).toBeLessThan(0.03);
    expect(difficultyOf(scheme, at, "2026-09-22", "tue")).toBeCloseTo(0.5, 1);
    const { hours, shortest, longest } = dayLength(2026, 6, 21, 44.5);
    expect(hours).toBeCloseTo(longest, 1);
    expect(longest - shortest).toBeGreaterThan(6);
  });
  it("adds up the date's digits", () => {
    const scheme = { kind: "digits", low: 0, high: 1 } as const;
    expect(difficultyOf(scheme, at, "2027-01-01", "fri")).toBe(0);
    expect(difficultyOf(scheme, at, "2026-09-29", "tue")).toBe(1);
    expect(difficultyOf(scheme, at, "2026-10-10", "sat")).toBeCloseTo(0, 5);   // 1+0+1+0 = 2
    expect(difficultyOf(scheme, at, "2026-10-14", "wed")).toBeCloseTo(4 / 18, 5);
  });
  it("stays within 0..1 for every persona's slots", () => {
    for (const p of PERSONAS) for (const s of slotsBetween(p, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))) {
      expect(s.difficulty).toBeGreaterThanOrEqual(0);
      expect(s.difficulty).toBeLessThanOrEqual(1);
    }
  });
});

describe("what to make", () => {
  const isola = PERSONAS.find((p) => p.handle === "isola")!;
  const slotsOf = (p: Persona, days: number) => slotsBetween(p, new Date("2026-10-05T00:00:00Z"), new Date(Date.UTC(2026, 9, 5 + days)));

  it("counts a creator's posts in order, its own days only", () => {
    const slots = slotsOf(isola, 21);
    expect(slots.map((s) => s.weekday).slice(0, 3)).toEqual(["mon", "wed", "fri"]);
    const n = slots.map((s) => seriesIndex(isola, s));
    expect(n).toEqual(n.map((_, i) => n[0] + i));
  });
  it("takes a sequence's mixes in order: one new symbol a week, alone first", () => {
    const mixes = isola.genres[0].mixes!;
    const slots = slotsOf(isola, 7 * mixes.length / 3);
    const got = slots.map((s) => planFor(isola, s).mix);
    expect(new Set(got)).toEqual(new Set(mixes));
    for (const s of slots) expect(planFor(isola, s).mix).toBe(mixes[seriesIndex(isola, s) % mixes.length]);
    // Monday's panel has a single kind of symbol
    for (const s of slots) if (s.weekday === "mon") expect(planFor(isola, s).mix).not.toContain("+");
  });
  it("keeps one type all week for a one-type-a-week creator, and changes it between weeks", () => {
    const granny = PERSONAS.find((p) => p.oneTypeAWeek)!;
    const weeks = new Map<string, Set<string>>();
    for (const s of slotsOf(granny, 70)) { const w = isoWeek(s.date); weeks.set(w, (weeks.get(w) ?? new Set()).add(planFor(granny, s).plan.genre)); }
    for (const kinds of weeks.values()) expect(kinds.size).toBe(1);
    expect(new Set([...weeks.values()].map((k) => [...k][0])).size).toBeGreaterThan(1);
  });
  it("gives a pair's two posts the same rules", () => {
    const bb = PERSONAS.find((p) => p.pairs)!;
    const [a, b] = slotsOf(bb, 7);
    expect(planFor(bb, a).rules).toBe(planFor(bb, b).rules);
    expect([planFor(bb, a).role, planFor(bb, b).role]).toEqual([0, 1]);
  });
  it("is the same choice every time for a date", () => {
    for (const p of PERSONAS) for (const s of slotsOf(p, 7)) expect(planFor(p, s)).toEqual(planFor(p, s));
  });
});

describe("the personas", () => {
  it("have unique, valid handles and cover most of the generator's genres", () => {
    const handles = PERSONAS.map((p) => p.handle);
    expect(new Set(handles).size).toBe(handles.length);
    for (const h of handles) expect(h).toMatch(/^[a-z][a-z0-9-]{2,29}$/);
    const covered = new Set(PERSONAS.flatMap((p) => p.genres.map((g) => g.genre)));
    expect(covered.size).toBeGreaterThanOrEqual(GENERATOR_GENRES.length * 0.8);
    expect(PERSONAS.length).toBe(15);
  });
  it("make no work-in-progress types, and no two make the same mix", () => {
    for (const k of WIP_KINDS) expect(GENERATOR_GENRES as readonly string[]).not.toContain(k);
    const mixes = PERSONAS.map((p) => p.genres.map((g) => g.genre).sort().join(","));
    expect(new Set(mixes).size).toBe(mixes.length);
  });
  it("each have an icon, and only they do", () => {
    expect(Object.keys(PERSONA_ICONS).sort()).toEqual(PERSONAS.map((p) => p.handle).sort());
    for (const p of PERSONAS) {
      const svg = personaIcon(p.handle)!;
      expect(svg).toMatch(/^<svg viewBox="0 0 48 48"/);
      // colours come from the site's tokens, with fallbacks, never a bare hex
      expect(svg.replace(/var\(--[a-z-]+,#[0-9a-f]{6}\)/g, "")).not.toMatch(/#[0-9a-f]{3,6}/i);
      // the pen weights (docs/style.md)
      for (const w of svg.matchAll(/stroke-width:([\d.]+)/g)) expect(["1", "1.6", "2.6", "5.5"]).toContain(w[1]);
    }
    expect(personaIcon("wyatt")).toBeNull();
  });
  it("don't write like a chatbot", () => {
    const tells = /\b(delve|tapestry|journey|embark|elevate|seamless|testament to|realm|unleash|vibrant|intricate)\b|not just .{1,40} but|\?/i;
    for (const p of PERSONAS) {
      const text = [p.bio, ...p.howIMake, p.schedule.summary, ...p.voice.examples.flatMap((e) => [e.title, e.description])];
      for (const t of text) {
        expect(t, `${p.handle}: ${t}`).not.toMatch(tells);
        // em dashes only where the style is built on them
        if (p.handle !== "hester-vane") expect(t, `${p.handle}: ${t}`).not.toMatch(/—/);
      }
      // a style, never a name
      expect([p.voice.brief, p.voice.titles, ...text].join(" ")).not.toMatch(/\b(Hemingway|Wodehouse|Dickinson|Chandler|Ogden|Douglas Adams|Calvino|Mary Oliver|Basho|Bashō|Gertrude|Le Guin|Vonnegut)\b/);
    }
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
