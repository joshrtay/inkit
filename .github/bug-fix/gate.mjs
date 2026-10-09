// The bug-fix workflow's gate (.github/workflows/bug-fix.yml; docs/bug-pipeline.md): whether this
// label event may start the AI fixer. Only the label `ai-fix`, added by the repo's owner or a
// maintainer, on an issue the site filed (it carries the report-id marker), under the daily cap.
// The pure rule is `mayFix`, unit-tested in app/tests/unit/bug-pipeline.test.ts; run as a script it
// reads the event from the environment and writes `ok`, `report` and `reason` to GITHUB_OUTPUT.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FIX_LABEL = "ai-fix";
export const MAX_RUNS_PER_DAY = 5;
const MARKER = /<!-- inkit-bug-report: ([a-z0-9]{6,32}) -->/;

/**
 * @param {{ action: string, label: string, sender: string, owner: string, role: string | null,
 *   issueBody: string, runsToday: number, maxPerDay?: number }} e
 * @returns {{ ok: boolean, reason: string, report: string }}
 */
export function mayFix(e) {
  const no = (reason) => ({ ok: false, reason, report: "" });
  if (e.action !== "labeled") return no(`event ${e.action}, not labeled`);
  if (e.label !== FIX_LABEL) return no(`label ${e.label}, not ${FIX_LABEL}`);
  const trusted = (e.sender && e.sender === e.owner) || e.role === "admin" || e.role === "maintain";
  if (!trusted) return no(`${e.sender} isn't the owner or a maintainer`);
  const m = String(e.issueBody ?? "").match(MARKER);
  if (!m) return no("not an issue filed from a bug report (no report marker)");
  if (e.runsToday >= (e.maxPerDay ?? MAX_RUNS_PER_DAY)) return no(`the daily cap (${e.maxPerDay ?? MAX_RUNS_PER_DAY} runs) is reached`);
  return { ok: true, reason: "approved", report: m[1] };
}

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

async function main() {
  const { SENDER = "", OWNER = "", LABEL = "", ACTION = "", ISSUE_BODY = "", REPO = "", RUN_ID = "" } = process.env;
  let role = null;
  try { role = (await gh(`/repos/${REPO}/collaborators/${encodeURIComponent(SENDER)}/permission`)).role_name ?? null; } catch { role = null; }
  // runs of this workflow today that did something (all-skipped runs, from other labels, don't count)
  const today = new Date().toISOString().slice(0, 10);
  let runsToday = 0;
  try {
    const runs = await gh(`/repos/${REPO}/actions/workflows/bug-fix.yml/runs?created=%3E%3D${today}&per_page=100`);
    runsToday = runs.workflow_runs.filter((r) => String(r.id) !== RUN_ID && r.conclusion !== "skipped" && r.conclusion !== "cancelled").length;
  } catch { runsToday = MAX_RUNS_PER_DAY; }   // can't count: fail closed
  const verdict = mayFix({ action: ACTION, label: LABEL, sender: SENDER, owner: OWNER, role, issueBody: ISSUE_BODY, runsToday });
  console.log(`gate: ${verdict.ok ? "approved" : "refused"}: ${verdict.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `ok=${verdict.ok}\nreport=${verdict.report}\nreason=${verdict.reason.replace(/[\r\n]/g, " ")}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
