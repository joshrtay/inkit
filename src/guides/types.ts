// What a puzzle type's guide page says (src/guides/guides.ts) and how its pictures are written.
import type { Given, GridSpec, RuleSpec } from "../engine/types.ts";

type RC = [number, number];

/** A small picture: a puzzle (its genre's) plus marks on it, shown as right (ok) or wrong. */
export interface Mini {
  ok: boolean;
  /** a few words under the picture */
  note: string;
  size: [number, number];
  givens?: Given[];
  areas?: string[];
  figure?: GridSpec["figure"];
  /** rules beyond (or replacing) the genre's own */
  rules?: RuleSpec[];
  /** a style beyond the genre's (Abstract Art's three colors) */
  style?: GridSpec["style"];
  /** a fill-in's list */
  entries?: string[];
  // marks, written compactly:
  /** one string per row: "#" shaded, "." empty, "x" known empty */
  shade?: string[];
  /** lines through cell centres, as paths of cells */
  lines?: RC[][];
  /** lines along the grid, as paths of corners */
  fence?: RC[][];
  /** regions, one letter per cell (cuts go where letters change) */
  regions?: string[];
  /** digits, one string per row ("." empty; letters for a lettered puzzle; numbers past 9 apart: "12 13 .") */
  digits?: string[];
  /** paint colors, one per piece */
  paint?: number[];
}

export interface RuleGuide {
  /** the rule, as briefly as it can be said */
  text: string;
  /** the engine rules (src/engine/rules.ts) the pictures show: a ✓ picture passes them all, a ✗ breaks one */
  checks: string[];
  pictures: Mini[];
}

export type Category = "Lines" | "Shading" | "Regions" | "Numbers" | "Paint";

export interface Credit {
  /** who invented it (a person, a company, a game), if known */
  inventor?: string;
  /** the org or person who made it popular, or whose name it goes by */
  popularizer?: string;
  /** when it first appeared, as far as a source says ("1989", "around 2009") */
  year?: string;
  /** anything else the credit must say: the original's name, how sure we are */
  note?: string;
  /** where this comes from */
  source: { label: string; url: string };
}

export interface Guide {
  name: string;
  /** other names it goes by */
  aka?: string[];
  category: Category;
  /** one sentence: the whole idea */
  summary: string;
  /** where the puzzle type comes from: who made it and when, as far as is known */
  origin: string;
  /** who to thank: the inventor, the org or person who popularized it, and a source. Say less
   *  rather than guess. A trademarked original name goes here too (Hidato, for Hidoku). */
  credit: Credit;
  rules: RuleGuide[];
  /** how to play it here, in a sentence or two */
  controls: string;
  /** the worked example: an instance file (src/games/...) */
  example: string;
  /** the board's ink */
  ink: string;
}
