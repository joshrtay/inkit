// This puzzle, as a checklist (docs/creation-flow.md, "v3 layout"): the type's rules in the guide's
// words (src/guides/guides.ts), each ticked or crossed, with the problems Check found hanging under
// the rule they break; then "Exactly one solution" (panels: at least one) last; and "Your drawing"
// for what isn't part of the puzzle.
//
//   checklist(...)   the lines, their marks and their problems
//   usesLine(...)    whether a guide line applies to this puzzle: a panel lists only its symbols',
//                    Panes only its own rules, an Akari its cipher line only with letters
//
// Pure: no DOM.
import { genres, needsOneSolution, type GenreName } from "~site/engine/puzzle.ts";
import type { GridSpec } from "~site/engine/types.ts";
import type { CheckItem, Verdict } from "./check";

/** One of a guide's rule lines: its words, and the engine rules (rules.ts) it's about. */
export interface RuleLine { text: string; checks: string[] }

/** ✓ holds, ✕ broken, … being checked, – not yet (nothing to say). */
export type Mark = "ok" | "bad" | "wait" | "none";

export interface ChecklistLine {
  text: string;
  checks: string[];
  mark: Mark;
  /** the problems under it (pins on the paper) */
  items: CheckItem[];
  /** a line under the text ("The solver looks once every rule holds.") */
  note?: string;
}

export interface Checklist {
  /** the guide's lines that apply, then the solution line last */
  rules: ChecklistLine[];
  /** what's drawn but isn't part of the puzzle, or needs fixing first */
  drawing: ChecklistLine;
  /** how many lines are crossed (rules and the solution line) */
  broken: number;
}

/** A panel's guide lines each start with the symbol they're about; the line rule always applies. */
const PANEL_SYMBOLS: [RegExp, (s: GridSpec) => boolean][] = [
  [/^Dots:/, (s) => has(s, "hexagon")],
  [/^Squares:/, (s) => has(s, "square")],
  [/^Stars:/, (s) => has(s, "star")],
  [/^Triangles:/, (s) => has(s, "triangle")],
  [/^Shapes:/, (s) => has(s, "shape")],
  [/^Hollow shapes/, (s) => (s.givens ?? []).some((g) => g.kind === "shape" && !!(g as { negative?: boolean }).negative)],
  [/^Erasers:/, (s) => has(s, "eraser")],
  [/^Symmetry:/, (s) => (s.rules ?? []).some((r) => r.rule === "panel-line" && !!r.symmetry)],
];
const has = (s: GridSpec, kind: string) => (s.givens ?? []).some((g) => g.kind === kind);

/** Whether a guide line applies to this puzzle: a panel's symbol lines only when it has the
 *  symbol (or the symmetry); a line about rules a puzzle may add (Panes' rules, Fillomino's sizes)
 *  only when it has one; an Akari's cipher line only when it has letters. */
export function usesLine(genre: GenreName, text: string, spec: GridSpec | null, checks: string[] = []): boolean {
  if (genre === "panel") {
    const sym = PANEL_SYMBOLS.find(([re]) => re.test(text));
    if (sym) return !!spec && sym[1](spec);
  }
  if (genre === "akari" && /^In a cipher/.test(text)) return !!spec && (spec.givens ?? []).some((g) => !!(g as { letter?: string }).letter);
  if (!checks.length) return true;
  const rules = new Set([...(genres[genre].rules as { rule: string }[]), ...(spec?.rules ?? [])].map((r) => r.rule));
  return checks.some((c) => rules.has(c));
}

/** The line the solution is checked on. */
export const solutionLine = (genre: GenreName) => (needsOneSolution(genre) ? "Exactly one solution" : "At least one solution");

/** The checklist for a puzzle of this type, from its guide lines, Check's list and the verdict. */
export function checklist(genre: GenreName, lines: RuleLine[], spec: GridSpec | null, list: CheckItem[], verdict: Verdict): Checklist {
  const shown = lines.filter((l) => usesLine(genre, l.text, spec, l.checks));
  const rules: ChecklistLine[] = shown.map((l) => ({ text: l.text, checks: l.checks, mark: spec ? "ok" : "none", items: [] }));
  // each broken rule under the first line about it (or the first line, if none says)
  for (const x of list.filter((i) => i.kind === "rule")) {
    const at = rules.find((l) => x.rule && l.checks.includes(x.rule)) ?? rules[0];
    if (at) { at.items.push(x); at.mark = "bad"; }
  }
  const final: ChecklistLine = { text: solutionLine(genre), checks: [], items: list.filter((i) => i.kind === "difference"), ...finalMark(verdict) };
  // a broken rule with no line to go under still breaks the puzzle: the solution line carries it
  if (!rules.length) final.items.unshift(...list.filter((i) => i.kind === "rule"));
  const misfits = list.filter((i) => i.kind === "misfit" || i.kind === "fix");
  const drawing: ChecklistLine = {
    text: "Everything on the page is part of the puzzle.", checks: [], items: misfits, mark: misfits.length ? "bad" : "ok",
    ...(misfits.some((i) => i.kind === "misfit") ? { note: "What doesn't fit is left out until it's fixed; it doesn't change the verdict." } : {}),
  };
  const all = [...rules, final];
  return { rules: all, drawing, broken: all.filter((l) => l.mark === "bad").length };
}

/** The solution line's mark and note, from the verdict. */
function finalMark(v: Verdict): { mark: Mark; note?: string } {
  switch (v.kind) {
    case "one": case "solvable": return { mark: "ok" };
    case "checking": return { mark: "wait", note: "The solver is looking." };
    case "none": return { mark: "bad", note: "No way of filling it in obeys every rule. Take a clue out, or change one." };
    case "several": return { mark: "bad", note: "It can be solved more than one way, so a player would have to guess. Add a clue that settles it." };
    case "error": return { mark: "bad", note: v.text };
    case "incomplete": return { mark: "none", note: v.text };
    case "broken": return { mark: "none", note: "The solver looks once every rule holds." };
    default: return { mark: "none" };
  }
}
