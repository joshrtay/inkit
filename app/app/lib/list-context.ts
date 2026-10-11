// The list a puzzle was opened from, carried in its URL so the page can show where you are and
// step to the next one (docs/research-curation.md, "Playing through a list"). `in` says where:
// a type (or "all"), with that page's own filters and Explore's search; a profile ("@handle");
// Subscriptions ("feed"); one of Explore's shelves. A set is `set=<id>`. Pure, so the server reads
// it and the pages write it the same way (tests/unit/list-context.test.ts).

export const SHELVES = { today: "Today", quick: "Quick ones", hard: "This week’s hard ones" } as const;
export type Shelf = keyof typeof SHELVES;

/** A type's page (or every type's, "all"), Explore's search, or one of its filters. */
export interface Browse {
  in: "browse";
  /** a type, or "all" */
  kind: string;
  q: string;
  level: 1 | 2 | 3 | null;
  quick: boolean;
  sort: "new" | "top";
  period: "week" | "month" | "all";
  category: string | null;
  unsolved: boolean;
}
export type ListContext =
  | Browse
  | { in: "profile"; handle: string }
  | { in: "feed" }
  | { in: "shelf"; shelf: Shelf }
  | { in: "set"; set: string };

const PERIODS = ["week", "month", "all"] as const;
const HANDLE = /^[a-z][a-z0-9-]{1,29}$/;
const ID = /^[\w-]{1,64}$/;

/** A type or "all", with the defaults its page uses (Newest, Top over a month). */
export function browse(kind: string, f: Partial<Omit<Browse, "in" | "kind">> = {}): Browse {
  return { in: "browse", kind, q: "", level: null, quick: false, sort: "new", period: "month", category: null, unsolved: false, ...f };
}

/** The list in a puzzle's URL, or null (opened on its own). `isKind`: the types there are. */
export function readContext(p: URLSearchParams, isKind: (k: string) => boolean): ListContext | null {
  const set = p.get("set");
  if (set) return ID.test(set) ? { in: "set", set } : null;
  const where = p.get("in");
  if (!where) return null;
  if (where === "feed") return { in: "feed" };
  if (where in SHELVES) return { in: "shelf", shelf: where as Shelf };
  if (where.startsWith("@")) return HANDLE.test(where.slice(1)) ? { in: "profile", handle: where.slice(1) } : null;
  if (where !== "all" && !isKind(where)) return null;
  const level = Number(p.get("level"));
  const period = p.get("period");
  return browse(where, {
    q: (p.get("q") ?? "").trim().slice(0, 80),
    level: level === 1 || level === 2 || level === 3 ? level : null,
    quick: p.get("quick") === "1",
    sort: p.get("sort") === "top" ? "top" : "new",
    period: PERIODS.includes(period as never) ? (period as Browse["period"]) : "month",
    category: where === "all" ? p.get("category") || null : null,
    unsolved: p.get("unsolved") === "1",
  });
}

/** The query string that carries `c` ("?in=akari&level=1"), leaving out what's the default. */
export function contextQuery(c: ListContext | null): string {
  if (!c) return "";
  const p = new URLSearchParams();
  if (c.in === "set") p.set("set", c.set);
  else if (c.in === "feed") p.set("in", "feed");
  else if (c.in === "shelf") p.set("in", c.shelf);
  else if (c.in === "profile") p.set("in", `@${c.handle}`);
  else {
    p.set("in", c.kind);
    if (c.q) p.set("q", c.q);
    if (c.category) p.set("category", c.category);
    if (c.level) p.set("level", String(c.level));
    if (c.quick) p.set("quick", "1");
    if (c.unsolved) p.set("unsolved", "1");
    if (c.sort === "top") { p.set("sort", "top"); if (c.period !== "month") p.set("period", c.period); }
  }
  return `?${p.toString()}`;
}

/** A puzzle's link within the list. */
export const inList = (id: string, c: ListContext | null) => `/g/${id}${contextQuery(c)}`;

const LEVELS = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;
const PERIOD_WORDS = { week: "this week", month: "this month", all: "all time" } as const;

/** What the bar under the board says: an icon and words ("Search: lamps · Easy · Newest").
 *  `kindName`: a type's name; `who`: a profile's name (else its @handle); `setTitle`: a set's. */
export function contextLabel(c: ListContext, names: { kindName: (k: string) => string; who?: string; setTitle?: string }) {
  if (c.in === "set") return { icon: "set" as const, text: names.setTitle ?? "Set" };
  if (c.in === "feed") return { icon: "feed" as const, text: "Subscriptions" };
  if (c.in === "shelf") return { icon: "shelf" as const, text: SHELVES[c.shelf] };
  if (c.in === "profile") return { icon: "profile" as const, text: names.who ?? `@${c.handle}` };
  const bits = [
    c.kind === "all" ? (c.q ? "" : "All puzzles") : names.kindName(c.kind),
    c.category ?? "", c.level ? LEVELS[c.level] : "", c.quick ? "Quick" : "", c.unsolved ? "Not solved yet" : "",
    c.sort === "top" ? `Top ${PERIOD_WORDS[c.period]}` : "Newest",
  ].filter(Boolean);
  return c.q
    ? { icon: "search" as const, text: [`Search: ${c.q}`, ...bits].join(" · ") }
    : { icon: "type" as const, text: bits.join(" · ") };
}
