// What paint offers for a puzzle type (docs/creation-flow.md §1.6, §4.4): the tools on the rail,
// the stamps on the right, the colours a stamp may take there, and the grid's look. Derived from
// the converter's profiles (to-puzzle.ts): a tool or stamp is offered when something it makes is
// read by the type. Everything else is behind "All tools", flagged as not this type's.
//
// Pure: no DOM.
import type { GenreName } from "~site/engine/puzzle.ts";
import { PROFILES, type Part } from "./to-puzzle";
import type { StampKind, SymbolColor } from "./model";

export type Tool = "grid" | "pen" | "line" | "wash" | "stamp" | "text" | "erase";
export type Look = "lines" | "tracks" | "hex" | "dots";

export interface Kit {
  tools: Tool[];
  stamps: StampKind[];
  /** the colours a stamp may take in this type (missing: any the stamp has) */
  colours: Partial<Record<StampKind, SymbolColor[]>>;
  look: Look;
}

/** What each part of a puzzle is drawn with. */
const MAKES: Record<Part, { tools?: Tool[]; stamps?: StampKind[] }> = {
  number: { tools: ["text"] }, symbol: { tools: ["text"], stamps: ["star", "stone"] }, compass: { tools: ["text"] },
  difference: { tools: ["text"] }, count: { tools: ["text"] }, watchtower: { tools: ["text"] }, first: { tools: ["text"] },
  skyscraper: { tools: ["text"] }, total: { tools: ["text"] }, runs: { tools: ["text"] }, lengths: { tools: ["text"] }, entries: { tools: ["text"] },
  block: { stamps: ["rock"] }, pearl: { stamps: ["stone"] }, peg: { stamps: ["stone"] }, square: { stamps: ["stone"] },
  star: { stamps: ["crest"] }, triangle: { stamps: ["triangle"] }, shape: { stamps: ["shape"] }, eraser: { stamps: ["eraser"] },
  start: { stamps: ["start"] }, end: { stamps: ["end"] }, hexagon: { stamps: ["hoshi"] }, galaxy: { stamps: ["galaxy"] },
  twins: { stamps: ["diamond"] }, opposites: { stamps: ["open-diamond"] }, bank: { stamps: ["shape"] },
  inequality: { stamps: ["inequality"] }, palisade: { stamps: ["palisade"] }, thermo: { stamps: ["thermo"] },
  wall: { tools: ["pen", "line"] }, areas: { tools: ["pen", "line"] }, door: { tools: ["pen", "line"] },
  "box-lines": {},              // a sudoku's boxes are drawn with its grid (the Rules panel sets their shape)
  "major-lines": {}, gap: {},   // a nonogram's every-5 lines are the type's own; a gap is the eraser's
  color: { tools: ["wash"] }, picture: { tools: ["wash"] },
  dots: {},                     // RYB's: not in paint yet
};
/** The rail's order. */
export const TOOL_ORDER: Tool[] = ["grid", "pen", "line", "wash", "stamp", "text", "erase"];

/** Colours a stamp is limited to by its type. */
const COLOURS: Partial<Record<GenreName, Partial<Record<StampKind, SymbolColor[]>>>> = {
  masyu: { stone: ["black", "white"] },
  "pythagorean-paths": { stone: ["black"] },
  "twins-and-triplets": { stone: ["red", "yellow", "blue"], crest: ["red", "yellow", "blue"], triangle: ["red", "yellow", "blue"] },
  panel: { start: ["black", "blue", "yellow"], hoshi: ["black", "blue", "yellow"] },
};

/** The type's tools, stamps, colours and look; null when paint can't make the type (RYB). */
export function kitFor(genre: GenreName): Kit | null {
  const profile = PROFILES[genre];
  if (!profile) return null;
  const tools = new Set<Tool>(["grid", "erase"]), stamps = new Set<StampKind>();
  for (const part of profile.reads) {
    const k = MAKES[part];
    k.tools?.forEach((t) => tools.add(t));
    k.stamps?.forEach((s) => stamps.add(s));
  }
  // Twins and Triplets' numbers are tiles: stones, crests and triangles, not writing
  if (genre === "twins-and-triplets") { tools.delete("text"); ["stone", "crest", "triangle"].forEach((s) => stamps.add(s as StampKind)); }
  // a sudoku's areas are its boxes, which come with the grid; only Irregular Sudoku draws its own
  if (genre === "sudoku" || genre === "thermo-sudoku") { tools.delete("pen"); tools.delete("line"); }
  if (stamps.size) tools.add("stamp");
  return { tools: TOOL_ORDER.filter((t) => tools.has(t)), stamps: [...stamps], colours: COLOURS[genre] ?? {}, look: profile.look ?? "lines" };
}

/** Whether a stamp takes a colour in the type: one of its colours is allowed, or any if not limited. */
export const colourAllowed = (kit: Kit | null, stamp: StampKind, colour: string) =>
  !kit?.colours[stamp] || (kit.colours[stamp] as string[]).includes(colour);
