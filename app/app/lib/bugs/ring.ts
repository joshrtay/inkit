// The bug reporter's buffers (docs/bug-pipeline.md), pure and unit-tested: the last few console
// errors and failed fetches, and the replay's rolling window, all kept in memory only.

/** The last `size` things pushed, oldest first. */
export class Ring<T> {
  private items: T[] = [];
  constructor(readonly size: number) {}
  push(item: T) {
    this.items.push(item);
    if (this.items.length > this.size) this.items.splice(0, this.items.length - this.size);
  }
  list(): T[] { return [...this.items]; }
  clear() { this.items = []; }
}

/**
 * rrweb's rolling window: record({ checkoutEveryNms }) starts a fresh full snapshot every N ms (a
 * "checkout"); each one begins a segment, and only the last `keep` segments are kept, so what's
 * sent is the last N to 2N of the page. A segment can't replay without the snapshot it starts
 * with, so events before the first checkout start the first segment too.
 */
export class ReplayBuffer<E> {
  private segments: E[][] = [];
  constructor(readonly keep = 2, readonly maxEvents = 50_000) {}
  push(event: E, isCheckout = false) {
    if (isCheckout || !this.segments.length) {
      this.segments.push([]);
      if (this.segments.length > this.keep) this.segments.splice(0, this.segments.length - this.keep);
    }
    const last = this.segments[this.segments.length - 1];
    // a runaway page (thousands of mutations a second) can't grow memory without bound: past the
    // cap, the segment stops taking events until the next checkout
    if (last.length < this.maxEvents) last.push(event);
  }
  events(): E[] { return this.segments.flat(); }
  get segmentCount() { return this.segments.length; }
  clear() { this.segments = []; }
}

/** A failed fetch as kept: the method, the path without its query, the status (0: no answer). */
export interface FailedFetch { at: number; method: string; path: string; status: number }

/** Where a request went, without the query string or anything after it (it could hold tokens),
 *  and only the path for this site's own requests. */
export function fetchPath(url: string, origin: string): string {
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.pathname : `${u.origin}${u.pathname}`;
  } catch { return "(bad url)"; }
}

/** A console message as kept: its text, cut short. */
export function logLine(args: unknown[], max = 500): string {
  return args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack.split("\n").slice(1, 4).join("\n")}` : ""}`;
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ").slice(0, max);
}
