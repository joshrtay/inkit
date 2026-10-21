// guard-check.ts's rows as a table: each setting's Spearman with the ratings per type and section
// (the mean over types), time, solved and capped counts, errors, against the baseline.
//   node puzzles/difficulty/guard-report.ts references/guard-check/rows.jsonl [--base <setting>]
// The guard (docs/research-trajectory.md, Aim 4): a setting passes when its mean over types is
// within 0.02 of the base's, in each section, and no type falls below the low end of the base's
// own 95% bootstrap interval for that type (puzzles resampled, 2,000 times, fixed seed). A type
// whose base estimates are all equal has no interval and isn't judged.
import { readFileSync } from "node:fs";
import { spearman } from "./calibrate.ts";

interface Row { setting: string; section: string; group: string; name: string; rated: number; estimate: number | null; solved: boolean; ms: number; capped: boolean; note: string }
const rows: Row[] = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "baseline";
const settings = [...new Set(rows.map((r) => r.setting))], sections = ["psjp", "tatham"];
const rho = (rs: Row[]) => { const ok = rs.filter((r) => Number.isFinite(r.estimate)); return spearman(ok.map((r) => r.estimate!), ok.map((r) => r.rated)); };
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const sign = (x: number) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(2) : "–");
const out: string[] = [];
// the base's 95% interval for a type's Spearman, from resampling its puzzles (seeded, so it repeats)
const interval = (rs: Row[]): [number, number] | null => {
  const ok = rs.filter((r) => Number.isFinite(r.estimate));
  if (new Set(ok.map((r) => r.estimate)).size < 2) return null;
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rhos: number[] = [];
  for (let b = 0; b < 2000; b++) {
    const pick = ok.map(() => ok[Math.floor(rand() * ok.length)]), x = spearman(pick.map((r) => r.estimate!), pick.map((r) => r.rated));
    if (Number.isFinite(x)) rhos.push(x);
  }
  rhos.sort((a, b) => a - b);
  return [rhos[Math.floor(0.025 * rhos.length)], rhos[Math.ceil(0.975 * rhos.length) - 1]];
};
const verdicts: string[] = [];

const summary: string[] = [];
for (const section of sections) {
  const groups = [...new Set(rows.filter((r) => r.section === section).map((r) => r.group))].sort();
  const per: Record<string, Record<string, number>> = {};
  for (const s of settings) {
    per[s] = {};
    for (const g of groups) { const rs = rows.filter((r) => r.setting === s && r.section === section && r.group === g); if (rs.length >= 5) per[s][g] = rho(rs); }
  }
  // each setting against the base over the types both have
  const kept = (s: string) => groups.filter((g) => Number.isFinite(per[s][g]) && Number.isFinite(per[base][g]));
  const mean = (s: string, over = s) => kept(over).reduce((a, g) => a + per[s][g], 0) / kept(over).length;
  const nOf = (g: string) => rows.filter((r) => r.setting === base && r.section === section && r.group === g).length;
  const ci = Object.fromEntries(groups.map((g) => [g, interval(rows.filter((r) => r.setting === base && r.section === section && r.group === g))]));
  // the type furthest below its interval's low end (or nearest to it, when none is below)
  const worst = (s: string) => kept(s).filter((g) => ci[g]).map((g) => ({ g, by: per[s][g] - ci[g]![0] })).sort((a, b) => a.by - b.by)[0];
  for (const s of settings.filter((s) => s !== base && kept(s).length)) {
    const w = worst(s), dm = mean(s) - mean(base, s), below = kept(s).filter((g) => ci[g] && per[s][g] < ci[g]![0]);
    const pass = Math.abs(dm) <= 0.02 + 1e-9 && !below.length;
    verdicts.push(`| ${section} | ${s} | ${(dm >= 0 ? "+" : "") + dm.toFixed(3)} | ${below.length ? below.map((g) => `${g} ${f2(per[s][g])} < ${f2(ci[g]![0])}`).join("; ") : "none"} | ${w ? `${w.g}: ${f2(per[s][w.g])} vs base ${f2(per[base][w.g])}, interval ${f2(ci[w.g]![0])} to ${f2(ci[w.g]![1])}` : "–"} | ${pass ? "pass" : "FAIL"} |`);
  }
  for (const s of settings) {
    const rs = rows.filter((r) => r.setting === s && r.section === section);
    const wrong = rs.filter((r) => /wrong fact/.test(r.note)), errs = rs.filter((r) => r.note.startsWith("error"));
    summary.push(`| ${section} | ${s} | ${f2(mean(s))} | ${s === base ? "" : sign(mean(s) - mean(base, s))} | ${rs.filter((r) => r.solved).length} of ${rs.length} | ${rs.filter((r) => r.capped).length} | ${Math.round(rs.reduce((a, r) => a + r.ms, 0) / 1000)} | ${rs.filter((r) => /out of time/.test(r.note)).length} | ${rs.filter((r) => /out of budget/.test(r.note)).length} | ${errs.length} | ${wrong.length} |`);
  }
  out.push(`### ${section === "psjp" ? "Puzzle Square JP" : "Tatham"} per type\n\nSpearman per type; other settings as the change from ${base} (moves of 0.05 or more in bold; ↓ below the base's interval)\n\n| Type | n | ${base} 95% interval | ${settings.join(" | ")} |\n|---|---|---|${settings.map(() => "---").join("|")}|\n` +
    groups.map((g) => `| ${g} | ${nOf(g)} | ${ci[g] ? `${f2(ci[g]![0])} to ${f2(ci[g]![1])}` : "–"} | ${settings.map((s) => { if (s === base) return f2(per[s][g]); const d = per[s][g] - per[base][g], t = Math.abs(d) >= 0.05 ? `**${sign(d)}**` : sign(d); return ci[g] && per[s][g] < ci[g]![0] ? `${t} ↓` : t; }).join(" | ")} |`).join("\n") +
    `\n\nMeans are over the types a setting shares with ${base}.`);
}
const wrong = rows.filter((r) => /wrong fact/.test(r.note));
const other = [...new Map(rows.filter((r) => r.note.startsWith("error") && !/wrong fact/.test(r.note)).map((r) => [`${r.setting} ${r.note.slice(0, 60)}`, r])).values()];
console.log([`### Guard\n\nPass: mean within 0.02 of ${base} and no type below the low end of ${base}'s 95% bootstrap interval\n\n| Section | Setting | Mean vs base | Types below their interval | Worst type | Verdict |\n|---|---|---|---|---|---|\n${verdicts.join("\n")}`, `### Summary\n\n| Section | Setting | Mean Spearman | vs base | Solved | Capped | Seconds of solving | Out of time | Out of budget | Errors | Wrong facts |\n|---|---|---|---|---|---|---|---|---|---|---|\n${summary.join("\n")}`, ...out,
  `### Wrong facts\n\n${wrong.length ? wrong.map((r) => `- ${r.setting}, ${r.name}: ${r.note}`).join("\n") : "None."}`,
  `### Other errors (distinct)\n\n${other.length ? other.map((r) => `- ${r.setting}, ${r.name}: ${r.note}`).join("\n") : "None."}`].join("\n\n"));
