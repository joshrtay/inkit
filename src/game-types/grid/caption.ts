// A line written under the board for a number the puzzle sets itself rather than its type: Sum Blobs'
// target ("Target sum: 10"). The same place for the player (game.ts) and still pictures (picture.ts),
// under the shape bank and a fill-in's list, so it's part of the puzzle wherever it's drawn.
import { sumTarget } from "../../engine/rules.ts";
import type { Puzzle } from "../../engine/types.ts";

const LINE = 44;

/** The caption under `p`'s board ("" if none), and where it goes: y from the bottom of what's above it. */
export function captionOf(p: Puzzle): { text: string; y: number; height: number } {
  const sum = p.rules.find((s) => s.rule === "region-sum");
  return sum ? { text: `Target sum: ${sumTarget(sum)}`, y: LINE - 18, height: LINE } : { text: "", y: 0, height: 0 };
}
