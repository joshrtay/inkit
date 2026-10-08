// A fill-in's list of numbers, written under the board and grouped by length (shortest first), each
// group on its own line: the same layout for the player (game.ts) and still pictures (picture.ts).
// A number is crossed off once it's in the grid.
import { fillSlots, symbolOf } from "../../engine/rules.ts";
import type { Board, Puzzle } from "../../engine/types.ts";

const LINE = 30, CHAR = 12, GAP = 18, LABEL = 74;

export interface EntryList {
  /** each number: its index in the list, where it's written, its text */
  items: { k: number; x: number; y: number; text: string }[];
  /** each group's label ("3 digits"), at the start of its line */
  labels: { x: number; y: number; text: string }[];
  /** the room it takes under the board */
  height: number;
}

/** Where a fill-in's list goes under a board `width` wide (x from the board's left, y from its bottom). */
export function entryList(p: Puzzle, width: number): EntryList {
  const out: EntryList = { items: [], labels: [], height: 0 };
  if (!p.entries.length) return out;
  const lengths = [...new Set(p.entries.map((e) => e.length))].sort((a, b) => a - b);
  let y = 0;
  for (const len of lengths) {
    y += LINE;
    out.labels.push({ x: 0, y, text: `${len} ${p.style.symbols && !/^\d+$/.test(p.style.symbols) ? "letters" : "digits"}` });
    let x = LABEL;
    const group = p.entries.map((e, k) => ({ k, text: e.map((d) => symbolOf(p, d)).join("") })).filter((x) => x.text.length === len)
      .sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }));
    for (const { k, text } of group) {
      const w = len * CHAR + GAP;
      if (x + w > Math.max(width, LABEL + w)) { x = LABEL; y += LINE; }
      out.items.push({ k, x: x + (len * CHAR) / 2, y, text });
      x += w;
    }
  }
  out.height = y + 16;
  return out;
}

/** Which numbers on the list are in the grid already (each slot counts for one). */
export function entriesDone(p: Puzzle, b: Board): Set<number> {
  const found = fillSlots(p).filter((s) => s.every((i) => b.digit[i])).map((s) => s.map((i) => b.digit[i]).join(","));
  const done = new Set<number>();
  p.entries.forEach((e, k) => {
    const at = found.indexOf(e.join(","));
    if (at >= 0) { done.add(k); found.splice(at, 1); }
  });
  return done;
}
