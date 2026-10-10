// Print a puzzle's solve path and difficulty profile.
//
//   node puzzles/difficulty/cli.ts <file> [--brief] [--json]
//
// <file> is a sketch (the genre on the first line, then the puzzle's JSON), an example puzzle
// (src/games/<genre>/<n>.json, the genre taken from its folder) or any JSON with a "grid" that
// names its genre.
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce } from "./deduce.ts";

/** A puzzle file as a spec. Sketches' rule lists on the first line ("panes: size 4, twins") are
 *  read simply: a rule name and an optional number. */
export function specFromFile(file: string): GridSpec {
  const text = readFileSync(file, "utf8");
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    const d = JSON.parse(text);
    const grid = d.grid ?? d;
    return { genre: grid.genre ?? basename(dirname(file)), ...grid };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("//"));
  const [name, list] = lines.shift()!.split(/:(.*)/s).map((s) => s?.trim());
  const body = JSON.parse(lines.join("\n") || "{}");
  const rules = (list ? list.split(",").map((r) => { const [rule, v] = r.trim().split(/\s+/); return v === undefined ? { rule } : { rule, is: Number.isNaN(+v) ? v : +v }; }) : []);
  return { ...body, genre: name.toLowerCase(), ...(rules.length ? { rules: [...rules, ...(body.rules ?? [])] } : {}) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node puzzles/difficulty/cli.ts <sketch or puzzle file> [--brief] [--json]"); process.exit(1); }
  const { path, profile } = await deduce(specFromFile(file));
  if (args.includes("--json")) console.log(JSON.stringify({ profile, path }, null, 1));
  else {
    if (!args.includes("--brief")) path.forEach((s, k) => {
      // a placed digit says enough: its cell's eliminations are left out
      const placed = new Set(s.facts.filter((f) => f.value && f.mark.startsWith("digit")).map((f) => f.mark.split(",")[0]));
      const shown = s.facts.filter((f) => f.value || !placed.has(f.mark.split(",")[0]));
      const facts = shown.length > 6 ? `${shown.slice(0, 6).map((f) => f.text).join("; ")}; … (${shown.length})` : shown.map((f) => f.text).join("; ");
      const why = s.because ? `  [${s.because.clues.join(", ")}${s.because.facts ? ` + ${s.because.facts} earlier facts` : ""}${s.because.capped ? ", not minimal" : ""}]` : "";
      console.log(`${String(k + 1).padStart(3)}. cost ${s.cost.toFixed(1).padStart(4)} T${s.tier}${s.choice ? " choice" : ""} ${s.where}: ${facts}${why}`);
    });
    const { perTier, ...rest } = profile;
    console.log(`\nestimate ${profile.estimate}  D_steps ${profile.dSteps}  max step cost ${profile.maxCost}  bands ${Object.entries(profile.bands).map(([b, c]) => `${b} ${c}`).join(", ")}  total cost ${profile.totalCost}`);
    console.log(`steps ${profile.steps} (by window: T0 ${perTier[0]}, T1 ${perTier[1]}, case split T2 ${perTier[2]}, search T3 ${perTier[3]})  entry points ${profile.entryPoints}`);
    console.log(`rule load ${profile.ruleLoad}: ${profile.ruleItems.join(", ")}`);
    console.log(`${rest.solved ? "solved" : "NOT solved"} in ${rest.ms} ms, ${rest.rounds} rounds, ${rest.clingoCalls} clingo calls${rest.notes.length ? `; ${rest.notes.join("; ")}` : ""}`);
  }
}
