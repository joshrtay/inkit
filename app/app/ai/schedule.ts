// When the AI creators post and how hard: pure functions of the persona and the date, shared by the
// weekly batch (puzzles/ai/week.ts), the site's admin endpoint and the cron that publishes
// (app/lib/ai.server.ts). Unit-tested in tests/unit/ai-schedule.test.ts.
import { WEEKDAYS, type DifficultyScheme, type GenrePlan, type LessonStep, type Persona, type PostTime, type Subject, type Weekday } from "./personas.ts";

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

/** How long the day is at a latitude on a date, in hours (0..24), and the year's shortest and
 *  longest there; the same approximation as `sunriseUtcMinutes`. */
export function dayLength(y: number, m: number, d: number, lat: number) {
  const rad = Math.PI / 180;
  const hours = (decl: number) => {
    const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    return cosH >= 1 ? 0 : cosH <= -1 ? 24 : (2 * Math.acos(cosH) / rad) / 15;
  };
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / DAY);
  const g = (2 * Math.PI / 365) * (n - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tilt = 23.44 * rad, [a, b] = [hours(-tilt), hours(tilt)];
  return { hours: hours(decl), shortest: Math.min(a, b), longest: Math.max(a, b) };
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
    case "season": {
      const m = Number(date.slice(5, 7));
      const north = m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
      const flip = { spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" } as const;
      return clamp01(scheme.by[scheme.hemisphere === "north" ? north : flip[north]]);
    }
    case "school-year": {
      // 1 September .. 30 June, then the summer holidays
      const [y, m, d] = date.split("-").map(Number);
      if (m === 7 || m === 8) return clamp01(scheme.summer);
      const start = Date.UTC(m >= 9 ? y : y - 1, 8, 1), end = Date.UTC(m >= 9 ? y + 1 : y, 5, 30);
      return clamp01(scheme.low + (scheme.high - scheme.low) * ((Date.UTC(y, m - 1, d) - start) / (end - start)));
    }
    case "daylight": {
      const [y, m, d] = date.split("-").map(Number);
      const { hours, shortest, longest } = dayLength(y, m, d, scheme.lat);
      return clamp01(scheme.low + (scheme.high - scheme.low) * (longest > shortest ? (longest - hours) / (longest - shortest) : 0.5));
    }
    case "digits": {
      const sum = [...date.slice(5).replace("-", "")].reduce((a, ch) => a + Number(ch), 0);
      return clamp01(scheme.low + (scheme.high - scheme.low) * ((sum - 2) / 18));
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

/** A slot's key, unique per persona and instant: what makes a backfilled post idempotent. */
export const slotKey = (handle: string, at: Date) => `${handle}@${at.toISOString()}`;

/** A backfill's range for a persona (puzzles/ai/backfill.ts): local midnight `days` days before
 *  `now`'s local date, to local midnight that day, in the persona's own time zone. */
export function backfillRange(p: Persona, now: Date, days: number) {
  const tz = p.schedule.timezone, today = localDate(now, tz);
  const start = new Date(Date.UTC(today.y, today.m - 1, today.d - days));
  return {
    from: zonedTime(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 0, 0, tz),
    to: zonedTime(today.y, today.m, today.d, 0, 0, tz),
  };
}

/** Every post a persona would have made in the `days` local days before today (through
 *  yesterday), exactly as the live schedule computes them (`slotsBetween`). */
export function backfillSlots(p: Persona, now: Date, days: number): Slot[] {
  const { from, to } = backfillRange(p, now, days);
  return slotsBetween(p, from, to).filter((s) => s.at.getTime() < now.getTime());
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

// ---- what to make ----

const EPOCH = Date.UTC(2026, 0, 5);   // a Monday

/** A post's place in its creator's run of posts (0, 1, 2, ... from the week of 5 January 2026),
 *  for a plan taken in order (`sequence`). Weekday schedules count only their own days; prime
 *  dates count days. */
export function seriesIndex(p: Persona, slot: Pick<Slot, "date" | "weekday">) {
  const [y, m, d] = slot.date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
  const list = p.schedule.days;
  if (list === "prime-dates") return Math.max(0, days);
  const mine = WEEKDAYS.filter((w) => list.includes(w));
  const i = mine.indexOf(slot.weekday);
  return Math.max(0, Math.floor(days / 7) * mine.length + (i < 0 ? 0 : i));
}

const rngOf = (key: string) => { let s = hash(key) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 2 ** 32; };
const pickWeighted = <T extends { weight: number }>(xs: T[], r: number) => { let x = r * xs.reduce((a, b) => a + b.weight, 0); for (const v of xs) if ((x -= v.weight) < 0) return v; return xs.at(-1)!; };

// ---- a tutor's curriculum (docs/research-tutorials.md §4.2) ----

/** The Monday of a date's ISO week, YYYY-MM-DD. */
export function mondayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const weeksBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (7 * DAY));

export interface Lesson {
  /** the week's subject (a review week's is the review) */
  subject: Subject;
  /** what this post is about: the week's subject, or the earlier one it reviews */
  focus: Subject;
  step: LessonStep;
  /** which of the week's posting days, 0 (Monday) to 4 */
  day: number;
  /** weeks since the curriculum's first (negative before it) */
  week: number;
  /** the subject's place in the curriculum, 0-based */
  index: number;
  /** how many times the curriculum has come round before this week (0 the first time) */
  round: number;
}

/** A tutor's lesson for a date: the week's subject (taken in order, one per ISO week from
 *  `curriculumStart`, wrapping round at the end) and the day's step (`lessonDays`). Friday
 *  combines on a symbol's last week (`with`) and otherwise reviews the week before's subject; a
 *  review week takes its earlier subjects in turn. Null for any other persona or a day with no step. */
export function lessonFor(p: Persona, slot: Pick<Slot, "date" | "weekday">): Lesson | null {
  const list = p.curriculum, days = p.lessonDays, planned = days?.[slot.weekday];
  if (!list?.length || !p.curriculumStart || !planned) return null;
  const week = weeksBetween(mondayOf(p.curriculumStart), mondayOf(slot.date));
  const index = ((week % list.length) + list.length) % list.length;
  const subject = list[index], day = WEEKDAYS.filter((w) => days![w]).indexOf(slot.weekday);
  const byId = (id: string) => list.find((s) => s.id === id)!;
  let step = planned, focus = subject;
  if (subject.review?.length) { step = "review"; focus = byId(subject.review[day % subject.review.length]); }
  else if (planned === "combine" && !subject.with) {
    // nothing to combine with yet: the week before's subject again
    step = "review";
    // (the very first week has none before it: its own subject again)
    for (let k = 1; k <= index; k++) { const s = list[index - k]; if (!s.review) { focus = s; break; } }
  }
  return { subject, focus, step, day, week, index, round: Math.floor(week / list.length) };
}

/** The board sizes a lesson's step tries, smallest first: Monday (and Tuesday and Wednesday, which
 *  change Monday's board) the subject's smallest; Thursday's trap one or two sizes up; Friday's
 *  combination the next two bigger than Monday's; a review the subject's middle sizes, and in a
 *  review week rising from Monday to Friday. */
export function lessonSizes(focus: Subject, step: LessonStep, day = 4): [number, number][] {
  const s = focus.sizes;
  const bigger = s.filter(([r, c]) => r * c > s[0][0] * s[0][1]);
  const pick = step === "introduce" || step === "contrast" || step === "second-contrast" ? s.slice(0, 1)
    : step === "trap" ? s.slice(1, 3)
    : step === "combine" ? bigger.slice(0, 2)
    : day < 4 ? s.slice(Math.min(day, s.length - 1), Math.min(day, s.length - 1) + 2) : s.slice(1, 3);
  const seen = new Set<string>();
  return (pick.length ? pick : s.slice(-1)).filter(([r, c]) => !seen.has(`${r}x${c}`) && !!seen.add(`${r}x${c}`));
}

/** A lesson's generator settings: its focus's own, and on Friday's combination the earlier subject
 *  it meets (`with`): a panel's mixes joined (erasers first, as the generator wants), Panes' rules merged. */
export function lessonSettings(p: Persona, lesson: Pick<Lesson, "focus" | "step">) {
  const { focus, step } = lesson;
  const other = step === "combine" && focus.with ? p.curriculum?.find((s) => s.id === focus.with) : undefined;
  const join = (a?: string, b?: string, sep = "+") => {
    const parts = [...new Set([...(a ?? "").split(sep), ...(b ?? "").split(sep)].map((x) => x.trim()).filter(Boolean))];
    return parts.length ? parts.sort((x, y) => Number(y === "erasers") - Number(x === "erasers")).join(sep) : undefined;
  };
  return {
    mix: other ? join(focus.mix, other.mix) : focus.mix,
    rules: other ? join(focus.rules, other.rules, ",") : focus.rules,
    moves: focus.moves, cipher: focus.cipher, with: other,
  };
}

/** What to make for a slot: the genre plan, and its mix, rules and moves. Deterministic: the same
 *  persona and date always choose the same. A pair's two posts share the week's plan and rules
 *  (the second is the first's board turned on its side); a one-type-a-week creator's week shares
 *  a genre; a `sequence` plan takes its mixes and rules in order; a tutor's post is its week's
 *  subject at the day's step (`lessonFor`). */
export function planFor(p: Persona, slot: Pick<Slot, "date" | "weekday">) {
  const lesson = lessonFor(p, slot);
  if (lesson) {
    const { mix, rules, moves, cipher } = lessonSettings(p, lesson);
    const plan: GenrePlan = { genre: lesson.focus.genre, weight: 1, sizes: lessonSizes(lesson.focus, lesson.step, lesson.day) };
    return { plan, role: null, mix, rules, moves, cipher, lesson };
  }
  const role = pairRole(p, slot.weekday);
  const week = isoWeek(slot.date);
  const r = rngOf(role === null ? `${p.handle}/${slot.date}` : `${p.handle}/${week}`);
  const pickPlan = p.oneTypeAWeek ? rngOf(`${p.handle}/${week}/type`) : r;
  const plans = p.genres.filter((g) => !g.days || g.days.includes(slot.weekday));
  const plan: GenrePlan = pickWeighted(plans.length ? plans : p.genres, pickPlan());
  const n = seriesIndex(p, slot);
  const choose = <T,>(xs?: T[]) => (xs?.length ? xs[plan.sequence ? n % xs.length : Math.floor(r() * xs.length)] : undefined);
  const mix = choose(plan.mixes), rules = choose(plan.rules) || undefined, moves = choose(plan.moves) || undefined;
  return { plan, role, mix, rules, moves, cipher: plan.cipher, lesson: null };
}

// ---- publishing what's due ----

export interface Scheduled { id: string; state: string; publishAt: Date | null }

/** The scheduled drafts whose time has come: drafts with a publish time at or before now. (A game
 *  that's already published, hidden, or has no publish time is never touched.) */
export const dueToPublish = <G extends Scheduled>(games: G[], now: Date): G[] =>
  games.filter((g) => g.state === "draft" && g.publishAt != null && g.publishAt.getTime() <= now.getTime());
