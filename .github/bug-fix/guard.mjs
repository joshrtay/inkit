// The bug-fix workflow's guard (.github/workflows/bug-fix.yml; docs/bug-pipeline.md): a branch the
// AI fixer made may touch no sensitive path and must stay small. It runs twice: in the fix job
// from a copy taken before the agent started, and again in a fresh job from the default branch,
// which the agent can't change. `checkDiff` is pure (app/tests/unit/bug-pipeline.test.ts).
//   node .github/bug-fix/guard.mjs <base> <head>     exits 1 if the diff breaks a rule
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LIMITS = { lines: 300, files: 10 };

/** Paths the fixer may never change: CI and its own guard, deploy config, the database's
 *  migrations and schema, auth and admin access, secrets, dependencies, the agent's instructions. */
export const DENY = [
  /^\.github\//,
  /^bug\//,
  /^\.claude\//,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)CODEOWNERS$/,
  /(^|\/)\.dev\.vars/,
  /(^|\/)\.env/,
  /secret/i,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)wrangler\.jsonc?$/,
  /^app\/drizzle\//,
  /(^|\/)migrations?\//,
  /^app\/app\/db\/schema\.ts$/,
  /^app\/workers\//,
  /^app\/app\/lib\/(auth|admin|permissions|edit-access)\.server\.ts$/,
  /^app\/app\/lib\/auth-client\.ts$/,
  /^app\/app\/routes\/(api\.auth|admin-[^/]*|signin|signup|forgot-password|reset-password|bugs)\.tsx?$/,
  /^app\/app\/lib\/bugs\//,
  /^app\/(playwright|vite|vitest)\.config\.ts$/,
];

/** `git diff --numstat --no-renames` lines → the rule breaks (empty: it passes). */
export function checkDiff(numstat, limits = LIMITS) {
  const files = String(numstat).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [added, removed, ...rest] = l.split("\t");
    return { path: rest.join("\t"), lines: (Number(added) || 0) + (Number(removed) || 0), binary: added === "-" };
  });
  const problems = [];
  for (const f of files) {
    if (DENY.some((re) => re.test(f.path))) problems.push(`touches a protected path: ${f.path}`);
    if (f.binary) problems.push(`adds or changes a binary file: ${f.path}`);
  }
  const lines = files.reduce((n, f) => n + f.lines, 0);
  if (files.length > limits.files) problems.push(`changes ${files.length} files (limit ${limits.files})`);
  if (lines > limits.lines) problems.push(`changes ${lines} lines (limit ${limits.lines})`);
  if (!files.length) problems.push("changes nothing");
  return { ok: problems.length === 0, problems, files: files.length, lines };
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) { console.error("usage: guard.mjs <base> <head>"); process.exit(2); }
  const numstat = execFileSync("git", ["diff", "--numstat", "--no-renames", `${base}...${head}`], { encoding: "utf8" });
  const result = checkDiff(numstat);
  console.log(`guard: ${result.files} files, ${result.lines} lines: ${result.ok ? "passes" : "REJECTED"}`);
  for (const p of result.problems) console.log(`  - ${p}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `files=${result.files}\nlines=${result.lines}\npasses=${result.ok}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
