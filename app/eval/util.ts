// Small helpers for the evaluation scripts.
import { readFileSync } from "node:fs";

/** A command-line flag's value (`--name value`), or true for a bare flag, or undefined. */
export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

/** The values in .dev.vars (local secrets: ANTHROPIC_API_KEY, ADMIN_API_TOKEN). */
export function readVars(): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch { return {}; }
}
