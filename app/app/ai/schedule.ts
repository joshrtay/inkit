// When the AI creators post and how hard: pure functions of the persona and the date, shared by the
// weekly batch (puzzles/ai/week.ts), the site's admin endpoint and the cron that publishes
// (app/lib/ai.server.ts). Unit-tested in tests/unit/ai-schedule.test.ts.
import { WEEKDAYS, type DifficultyScheme, type Persona, type PostTime, type Weekday } from "./personas.ts";

const DAY = 86400e3;

/** A post's slot: the instant it goes up, and the date and weekday where its creator lives. */
export interface Slot {
  handle: string;
  /** when it's published (UTC) */
  at: Date;
  /** the creator's local date, YYYY-MM-DD */
  date: string;
  weekday: Weekday;
  /** 0..1, from the persona's difficulty scheme */
  difficulty: number;
}

// ---- time zones ----

/** The wall-clock parts of an instant in a time zone. */
function wall(t: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  return {
    y: Number(get("year")), m: Number(get("month")), d: Number(get("day")),
    h: Number(get("hour")), min: Number(get("minute")), s: Number(get("second")),
    weekday: get("weekday").slice(0, 3).toLowerCase() as Weekday,
  };
}

/** How far ahead of UTC a time zone's clocks are at an instant, in ms. */
function offset(t: number, timeZone: string) {
  const w = wall(t, timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(t / 1000) * 1000;
}

/** The instant a local wall-clock time happens in a time zone. A time skipped by a clock change
 *  comes out an hour later (what a person's clock would show). */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offset(guess, timeZone);
  t = guess - offset(t, timeZone);
  return new Date(t);
}

/** A date's local YYYY-MM-DD and weekday in a time zone. */
export function localDate(t: Date, timeZone: string) {
  const w = wall(t.getTime(), timeZone);
  return { date: `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`, y: w.y, m: w.m, d: w.d, weekday: w.weekday };
}

// ---- sunrise ----

/** Sunrise at a place on a date, in UTC minutes after that date's midnight (UTC). The NOAA
 *  approximation, good to a minute or two; null where the sun doesn't rise. */
export function sunriseUtcMinutes(y: number, m: number, d: number, lat: number, lon: number): number | null {
  const rad = Math.PI / 180;
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / DAY);
  const g = (2 * Math.PI / 365) * (n - 1);   // fractional year (noon-ish)
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) / rad;
  return 720 - 4 * (lon + ha) - eqTime;
}

/** The instant a post goes up on a local date. */
export function postInstant(time: PostTime, y: number, m: number, d: number, timeZone: string): Date {
  if (time.at === "sunrise") {
    const { lat, lon } = time as { lat: number; lon: number };
    // sunrise is computed for the UTC date of local noon there, close enough for any zone
    const noon = zonedTime(y, m, d, 12, 0, timeZone), u = new Date(noon);
    const mins = sunriseUtcMinutes(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), lat, lon) ?? 360;
    let t = Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()) + Math.round(mins) * 60e3;
    // keep it on the right local day
    const local = localDate(new Date(t), timeZone);
    const want = Date.UTC(y, m - 1, d), got = Date.UTC(local.y, local.m - 1, local.d);
    t += want - got;
    return new Date(t);
  }
  const [h, min] = time.at.split(":").map(Number);
  return zonedTime(y, m, d, h, min, timeZone);
}

// ---- difficulty ----

/** The Moon's age in days since new moon (0 .. 29.53), from a known new moon. */
export function moonAge(t: Date) {
  const SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const age = ((t.getTime() - NEW_MOON) / DAY) % SYNODIC;
  return age < 0 ? age + SYNODIC : age;
}

/** How much of the Moon is lit, 0 (new) .. 1 (full). */
export const moonLit = (t: Date) => (1 - Math.cos((2 * Math.PI * moonAge(t)) / 29.530588853)) / 2;

/** Spring-neap strength, 1 at spring tides (new and full moon) .. 0 at neaps (quarter moons). */
export const tideStrength = (t: Date) => (1 + Math.cos((4 * Math.PI * moonAge(t)) / 29.530588853)) / 2;

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A day's target difficulty (0..1) under a scheme. `at` is the post's instant, `date` its local date. */
export function difficultyOf(scheme: DifficultyScheme, at: Date, date: string, weekday: Weekday): number {
  switch (scheme.kind) {
    case "weekday": return clamp01(scheme.by[weekday]);
    case "lunar": return clamp01(scheme.low + (scheme.high - scheme.low) * moonLit(at));
    case "tides": return clamp01(scheme.low + (scheme.high - scheme.low) * tideStrength(at));
    case "steady": return clamp01(scheme.level + scheme.wobble * ((hash(date) % 1000) / 999 - 0.5));
    case "month": {
      const [y, m, d] = date.split("-").map(Number);
      return clamp01(scheme.low + (scheme.high - scheme.low) * ((d - 1) / (daysInMonth(y, m) - 1)));
    }
  }
}

// ---- slots ----

export const isPrime = (n: number) => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };

/** Every post a persona makes with its instant in [from, to), oldest first. */
export function slotsBetween(p: Persona, from: Date, to: Date): Slot[] {
  const { timezone, days, time } = p.schedule;
  const out: Slot[] = [];
  // walk local dates from the day before `from` to the day after `to`
  for (let t = from.getTime() - DAY; t < to.getTime() + DAY; t += DAY) {
    const local = localDate(new Date(t), timezone);
    if (out.some((s) => s.date === local.date)) continue;
    const posts = days === "prime-dates" ? isPrime(local.d) : days.includes(local.weekday);
    if (!posts) continue;
    const at = postInstant(time, local.y, local.m, local.d, timezone);
    if (at < from || at >= to) continue;
    out.push({ handle: p.handle, at, date: local.date, weekday: local.weekday, difficulty: difficultyOf(p.difficulty, at, local.date, local.weekday) });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Which weekday a slot's pair partner is on, and which of the pair it is (0 first, 1 second). */
export function pairRole(p: Persona, weekday: Weekday): 0 | 1 | null {
  if (!p.pairs) return null;
  const i = p.pairs.days.indexOf(weekday);
  return i < 0 ? null : (i as 0 | 1);
}

/** The ISO week a date is in ("2026-W41"), so a pair can share a choice. */
export function isoWeek(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = (t.getUTCDay() + 6) % 7;     // Monday 0
  t.setUTCDate(t.getUTCDate() - day + 3);  // that week's Thursday
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export { WEEKDAYS };

// ---- publishing what's due ----

export interface Scheduled { id: string; state: string; publishAt: Date | null }

/** The scheduled drafts whose time has come: drafts with a publish time at or before now. (A game
 *  that's already published, hidden, or has no publish time is never touched.) */
export const dueToPublish = <G extends Scheduled>(games: G[], now: Date): G[] =>
  games.filter((g) => g.state === "draft" && g.publishAt != null && g.publishAt.getTime() <= now.getTime());
