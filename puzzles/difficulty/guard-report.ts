// guard-check.ts's rows as a table: each setting's Spearman with the ratings per type and section
// (the mean over types), time, solved and capped counts, errors, against the baseline.
//   node puzzles/difficulty/guard-report.ts references/guard-check/rows.jsonl
import { readFileSync } from "node:fs";
import { spearman } from "./calibrate.ts";

interface Row { setting: string; section: string; group: string; name: string; rated: number; estimate: number | null; solved: boolean; ms: number; capped: boolean; note: string }
const rows: Row[] = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const settings = [...new Set(rows.map((r) => r.setting))], sections = ["psjp", "tatham"];
const rho = (rs: Row[]) => { const ok = rs.filter((r) => Number.isFinite(r.estimate)); return spearman(ok.map((r) => r.estimate!), ok.map((r) => r.rated)); };
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const sign = (x: number) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(2) : "–");
const out: string[] = [];

const summary: string[] = [];
for (const section of sections) {
  const groups = [...new Set(rows.filter((r) => r.section === section).map((r) => r.group))].sort();
  const per: Record<string, Record<string, number>> = {};
  for (const s of settings) {
    per[s] = {};
    for (const g of groups) { const rs = rows.filter((r) => r.setting === s && r.section === section && r.group === g); if (rs.length >= 5) per[s][g] = rho(rs); }
  }
  const kept = groups.filter((g) => settings.every((s) => Number.isFinite(per[s][g])));
  const mean = (s: string) => kept.reduce((a, g) => a + per[s][g], 0) / kept.length;
  for (const s of settings) {
    const rs = rows.filter((r) => r.setting === s && r.section === section);
    const wrong = rs.filter((r) => /wrong fact/.test(r.note)), errs = rs.filter((r) => r.note.startsWith("error"));
    summary.push(`| ${section} | ${s} | ${f2(mean(s))} | ${s === "baseline" ? "" : sign(mean(s) - mean("baseline"))} | ${rs.filter((r) => r.solved).length} of ${rs.length} | ${rs.filter((r) => r.capped).length} | ${Math.round(rs.reduce((a, r) => a + r.ms, 0) / 1000)} | ${errs.length} | ${wrong.length} |`);
  }
  out.push(`### ${section === "psjp" ? "Puzzle Square JP" : "Tatham"} per type\n\nSpearman per type; other settings as the change from baseline (moves of 0.05 or more in bold)\n\n| Type | n | ${settings.join(" | ")} |\n|---|---|${settings.map(() => "---").join("|")}|\n` +
    groups.map((g) => `| ${g} | ${rows.filter((r) => r.setting === "baseline" && r.section === section && r.group === g).length} | ${settings.map((s) => { if (s === "baseline") return f2(per[s][g]); const d = per[s][g] - per.baseline[g]; return Math.abs(d) >= 0.05 ? `**${sign(d)}**` : sign(d); }).join(" | ")} |`).join("\n") +
    `\n\nMean over the ${kept.length} types with a Spearman under every setting.`);
}
const wrong = rows.filter((r) => /wrong fact/.test(r.note));
const other = [...new Map(rows.filter((r) => r.note.startsWith("error") && !/wrong fact/.test(r.note)).map((r) => [`${r.setting} ${r.note.slice(0, 60)}`, r])).values()];
console.log([`### Summary\n\n| Section | Setting | Mean Spearman | vs baseline | Solved | Capped | Seconds of solving | Errors | Wrong facts |\n|---|---|---|---|---|---|---|---|---|\n${summary.join("\n")}`, ...out,
  `### Wrong facts\n\n${wrong.length ? wrong.map((r) => `- ${r.setting}, ${r.name}: ${r.note}`).join("\n") : "None."}`,
  `### Other errors (distinct)\n\n${other.length ? other.map((r) => `- ${r.setting}, ${r.name}: ${r.note}`).join("\n") : "None."}`].join("\n\n"));
