// The AI creators' backfill (puzzles/ai/backfill.ts, POST /admin/ai/backfill): its slots are the
// live schedule's, day for day (the weekly batch's windows, sunrise, prime dates, the moon, clock
// changes), a teaching sequence carries on through it, a backdated post is for an AI creator's own
// slot only, and sending one twice does nothing the second time.
import { describe, expect, it } from "vitest";
import { PERSONAS, personaByHandle } from "~/ai/personas";
import { backfillRange, backfillSlots, difficultyOf, isoWeek, localDate, moonLit, planFor, slotKey, slotsBetween, type Slot } from "~/ai/schedule";
import { backfillAction, checkBackfillPost, checkScheduleRequest, sha256 } from "~/ai/request";
import { clashingTitle, nearDuplicateTitle } from "~/ai/titles";

const DAY = 86400e3;
const p = (h: string) => personaByHandle(h)!;
const hm = (h: string, at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: p(h).schedule.timezone, hour: "2-digit", minute: "2-digit" }).format(at);
const view = (s: Slot) => ({ at: s.at.toISOString(), date: s.date, weekday: s.weekday, difficulty: s.difficulty });

/** The slots the live system made over a range: the weekly batch (ai-week.yml, Sundays 22:00 UTC)
 *  asks `slotsBetween` for the 7 days from each run. */
function liveSlots(h: string, from: Date, to: Date, now: Date) {
  const first = new Date(from.getTime() - 8 * DAY);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());   // a Sunday
  first.setUTCHours(22, 0, 0, 0);
  const out: Slot[] = [];
  for (let t = first.getTime(); t < to.getTime(); t += 7 * DAY) out.push(...slotsBetween(p(h), new Date(t), new Date(t + 7 * DAY)));
  return out.filter((s) => s.at >= from && s.at < to && s.at < now);
}

describe("the backfill's slots", () => {
  const ranges = [
    { now: new Date("2026-10-09T12:00:00Z"), days: 61 },   // 9 Aug .. 8 Oct
    { now: new Date("2026-11-15T12:00:00Z"), days: 61 },   // across Europe's and America's clock changes
  ];

  it("are the live schedule's, slot for slot, for every persona", () => {
    for (const { now, days } of ranges) for (const persona of PERSONAS) {
      const { from, to } = backfillRange(persona, now, days);
      expect(backfillSlots(persona, now, days).map(view), `${persona.handle} before ${now.toISOString()}`).toEqual(liveSlots(persona.handle, from, to, now).map(view));
    }
  });

  it("cover the local days before today, through yesterday, in the persona's own time zone", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    for (const persona of PERSONAS) {
      const slots = backfillSlots(persona, now, 61), today = localDate(now, persona.schedule.timezone).date;
      const first = new Date(Date.parse(`${today}T00:00:00Z`) - 61 * DAY).toISOString().slice(0, 10);
      for (const s of slots) { expect(s.date >= first && s.date < today).toBe(true); expect(s.at < now).toBe(true); }
      expect(new Set(slots.map((s) => s.date)).size).toBe(slots.length);   // one a day at most
    }
    // Auckland's 9 October has started by noon UTC; Los Angeles' hasn't
    expect(localDate(now, "Pacific/Auckland").date).toBe("2026-10-10");
    expect(backfillSlots(p("lumen"), now, 61).at(-1)!.date <= "2026-10-09").toBe(true);
  });

  it("post on prime dates only for Ottoline, at 2 pm Lisbon", () => {
    const slots = backfillSlots(p("ottoline"), new Date("2026-10-09T12:00:00Z"), 61);
    expect(slots.map((s) => s.date)).toEqual([
      "2026-08-11", "2026-08-13", "2026-08-17", "2026-08-19", "2026-08-23", "2026-08-29", "2026-08-31",
      "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-07", "2026-09-11", "2026-09-13", "2026-09-17", "2026-09-19", "2026-09-23", "2026-09-29",
      "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-07",
    ]);
    for (const s of slots) expect(hm("ottoline", s.at)).toBe("14:00");
    // harder as the month goes on: the 2nd easier than the 29th
    const d = (date: string) => slots.find((s) => s.date === date)!.difficulty;
    expect(d("2026-09-02")).toBeLessThan(d("2026-09-29"));
  });

  it("post at each day's sunrise for Pebble, later as autumn comes", () => {
    const slots = backfillSlots(p("pebble"), new Date("2026-10-09T12:00:00Z"), 61);
    expect(slots).toHaveLength(61);
    const mins = slots.map((s) => { const [h, m] = hm("pebble", s.at).split(":").map(Number); return h * 60 + m; });
    for (const m of mins) expect(m >= 4 * 60 + 50 && m <= 6 * 60).toBe(true);
    expect(mins.at(-1)! - mins[0]).toBeGreaterThan(30);   // Kyoto: about 5:13 in August, 5:53 in October
    for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeGreaterThanOrEqual(mins[i - 1] - 1);
  });

  it("follow the moon for Lumen: the hardest near full moon, the easiest near new", () => {
    const slots = backfillSlots(p("lumen"), new Date("2026-10-09T12:00:00Z"), 61);
    for (const s of slots) expect(s.difficulty).toBe(difficultyOf(p("lumen").difficulty, s.at, s.date, s.weekday));
    const hardest = slots.reduce((a, b) => (b.difficulty > a.difficulty ? b : a)), easiest = slots.reduce((a, b) => (b.difficulty < a.difficulty ? b : a));
    expect(moonLit(hardest.at)).toBeGreaterThan(0.9);
    expect(moonLit(easiest.at)).toBeLessThan(0.1);
  });

  it("keep local times across a clock change (London's 25 October, New York's 1 November)", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    for (const s of backfillSlots(p("granny-rect"), now, 61)) expect(hm("granny-rect", s.at)).toBe("11:05");
    for (const s of backfillSlots(p("hester-vane"), now, 61)) expect(hm("hester-vane", s.at)).toBe("16:00");
    const utc = backfillSlots(p("granny-rect"), now, 61).map((s) => s.at.toISOString().slice(11, 16));
    expect(new Set(utc)).toEqual(new Set(["10:05", "11:05"]));
  });

  it("carry Isola's teaching sequence on: one symbol a week, alone Monday and Wednesday, in company on Friday", () => {
    const slots = backfillSlots(p("isola"), new Date("2026-10-09T12:00:00Z"), 61);
    const weeks = new Map<string, Record<string, string>>();
    for (const s of slots) weeks.set(isoWeek(s.date), { ...weeks.get(isoWeek(s.date)), [s.weekday]: planFor(p("isola"), s).mix! });
    const symbols = new Set<string>();
    for (const w of weeks.values()) {
      if (w.mon) { expect(w.mon).not.toContain("+"); symbols.add(w.mon); }
      if (w.mon && w.wed) expect(w.wed).toBe(w.mon);
      // Friday: the week's symbol beside one earlier symbol, never several
      if (w.fri) { expect(w.fri.split("+")).toHaveLength(2); if (w.mon) expect(w.fri.split("+")[0]).toBe(w.mon); }
    }
    expect(symbols.size).toBeGreaterThanOrEqual(6);   // a new symbol each week of the range
  });

  it("lean easy: no day's target above 0.7 over the range, and every persona has easy days", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    for (const persona of PERSONAS) {
      const ds = backfillSlots(persona, now, 61).map((s) => s.difficulty);
      expect(Math.max(...ds), persona.handle).toBeLessThanOrEqual(0.7);
      expect(Math.min(...ds), persona.handle).toBeLessThanOrEqual(persona.handle === "freddie-plume" ? 0.5 : 0.45);
    }
    // Isola's Monday is a warm-up, her Friday no more than middling
    const isola = backfillSlots(p("isola"), now, 61);
    for (const s of isola) if (s.weekday === "mon") expect(s.difficulty).toBeLessThanOrEqual(0.1);
    for (const s of isola) if (s.weekday === "fri") expect(s.difficulty).toBeLessThanOrEqual(0.6);
  });

  it("key a post by its persona and instant", () => {
    expect(slotKey("ottoline", new Date("2026-09-29T13:00:00Z"))).toBe("ottoline@2026-09-29T13:00:00.000Z");
  });
});

describe("a backfilled post", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const sketch = 'sudoku\n{"size":[4,4],"givens":[{"at":"cell","cell":[0,0],"kind":"number","value":1}]}';
  // the Night Clerk posts at 23:47 Los Angeles time: 1 September's is 06:47 UTC on the 2nd
  const at = "2026-09-02T06:47:00.000Z";
  const body = async (over: Record<string, unknown> = {}) => ({
    persona: "night-clerk", sketch, title: "Room 214", description: "Guest arrived 11:40.", publishedAt: at,
    proof: { solutions: 1, sketchHash: await sha256(sketch), solver: "test" }, ...over,
  });

  it("is accepted at one of the persona's past slots", async () => {
    const r = await checkBackfillPost(await body(), now);
    expect(r).toMatchObject({ ok: true, kind: "sudoku", key: `night-clerk@${at}` });
  });
  it("is for an AI creator only", async () => {
    expect(await checkBackfillPost(await body({ persona: "wyatt" }), now)).toMatchObject({ ok: false, status: 404 });
    expect(await checkBackfillPost(await body({ persona: "" }), now)).toMatchObject({ ok: false, status: 404 });
  });
  it("must be in the past, and not long ago", async () => {
    expect(await checkBackfillPost(await body({ publishedAt: "2026-10-10T06:47:00Z" }), now)).toMatchObject({ ok: false, status: 400 });
    // (up to 400 days)
    expect(await checkBackfillPost(await body({ publishedAt: "2025-09-01T06:47:00Z" }), now)).toMatchObject({ ok: false, status: 400 });
    // and a scheduled post can't be dated in the past
    expect(await checkScheduleRequest({ ...(await body()), publishAt: at }, now)).toMatchObject({ ok: false });
  });
  it("may be at one of a tutor's back catalogue's times (historySlots)", async () => {
    const panel = 'panel\n{"size":[2,1],"givens":[{"at":"corner","corner":[2,0],"kind":"start"},{"at":"corner","corner":[0,1],"kind":"end"},{"at":"cell","cell":[0,0],"kind":"square","color":"black"},{"at":"cell","cell":[1,0],"kind":"square","color":"white"},{"at":"line","corners":[[0,1],[1,1]],"kind":"gap"}]}';
    const slate = (publishedAt: string) => async () => body({ persona: "slate", sketch: panel, publishedAt, proof: { solutions: 1, sketchHash: await sha256(panel), solver: "t" } });
    // 10 August 2026, a day carrying two weeks: its second post at 09:00 London time
    expect(await checkBackfillPost(await slate("2026-08-10T08:00:00.000Z")(), now)).toMatchObject({ ok: true, key: "slate@2026-08-10T08:00:00.000Z" });
    expect(await checkBackfillPost(await slate("2026-08-10T08:15:00.000Z")(), now)).toMatchObject({ ok: false, status: 400 });
  });
  it("must be at one of the persona's posting times", async () => {
    const r = await checkBackfillPost(await body({ publishedAt: "2026-09-02T06:48:00Z" }), now);
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.error).toMatch(/posting times/);
    // the Night Clerk posts nightly, but Ottoline only on prime dates: the 4th isn't one
    expect(await checkBackfillPost(await body({ persona: "ottoline", publishedAt: "2026-09-04T13:00:00Z" }), now)).toMatchObject({ ok: false });
  });
  it("has the scheduled post's puzzle checks: its proof, its genre", async () => {
    expect(await checkBackfillPost(await body({ proof: { solutions: 2, sketchHash: await sha256(sketch), solver: "t" } }), now)).toMatchObject({ ok: false });
    expect(await checkBackfillPost(await body({ proof: { solutions: 1, sketchHash: "0".repeat(64), solver: "t" } }), now)).toMatchObject({ ok: false });
    const other = 'akari\n{"size":[3,3],"givens":[]}';
    expect(await checkBackfillPost(await body({ sketch: other, proof: { solutions: 1, sketchHash: await sha256(other), solver: "t" } }), now)).toMatchObject({ ok: false });
  });

  it("is idempotent by its slot: sent again, it's skipped", () => {
    const t = new Date(at);
    expect(backfillAction([], t, sketch)).toEqual({ do: "insert" });
    const sent = [{ id: "g1", state: "published", publishedAt: t, publishAt: null, sketch }];
    expect(backfillAction(sent, t, sketch)).toEqual({ do: "skip", id: "g1" });
    // the same slot with other words or another puzzle (a rerun that made something else) is still skipped
    expect(backfillAction(sent, t, "sudoku\n{}")).toEqual({ do: "skip", id: "g1" });
    // a slot already taken by a queued draft, or one since deleted, is skipped too
    expect(backfillAction([{ ...sent[0], state: "draft", publishedAt: null, publishAt: t }], t, sketch)).toMatchObject({ do: "skip" });
    expect(backfillAction([{ ...sent[0], state: "deleted" }], t, sketch)).toMatchObject({ do: "skip" });
  });
  it("with updateWords, gives a post already at its slot new words, never a new puzzle", () => {
    const t = new Date(at), sent = [{ id: "g1", state: "published", publishedAt: t, publishAt: null, sketch }];
    expect(backfillAction(sent, t, sketch, true)).toEqual({ do: "update", id: "g1" });
    expect(backfillAction(sent, t, "sudoku\n{}", true)).toEqual({ do: "skip", id: "g1" });
    expect(backfillAction([{ ...sent[0], state: "deleted" }], t, sketch, true)).toEqual({ do: "skip", id: "g1" });
    expect(backfillAction([], t, sketch, true)).toEqual({ do: "insert" });
  });
  it("can't repeat a puzzle the persona already has", () => {
    const other = new Date(Date.parse(at) - DAY);
    expect(backfillAction([{ id: "g0", state: "published", publishedAt: other, publishAt: null, sketch }], new Date(at), sketch)).toEqual({ do: "repeat", id: "g0" });
    // unless that one was deleted
    expect(backfillAction([{ id: "g0", state: "deleted", publishedAt: other, publishAt: null, sketch }], new Date(at), sketch)).toEqual({ do: "insert" });
  });
});

describe("near-duplicate titles", () => {
  it("catches the same words, most of the same words, or a letter's difference", () => {
    expect(nearDuplicateTitle("The Square Gate", "Square Gate")).toBe(true);
    expect(nearDuplicateTitle("The Gate of Squares", "The Squares' Gate")).toBe(true);
    expect(nearDuplicateTitle("The Quay of Paired Stars", "The Quays of Paired Stars")).toBe(true);
    expect(nearDuplicateTitle("Room 214, Late", "Room 214, Late Again")).toBe(true);
  });
  it("lets different titles through", () => {
    expect(nearDuplicateTitle("The Square Gate", "The Mirror Steps")).toBe(false);
    expect(nearDuplicateTitle("Two Stones", "Two Stars")).toBe(false);
    expect(nearDuplicateTitle("Frost", "First Frost on the Pond")).toBe(false);
    expect(clashingTitle("The Mirror Steps", ["The Square Gate", "The Mirror Step"])).toBe("The Mirror Step");
  });
});
