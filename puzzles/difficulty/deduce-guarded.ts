// The deduction solver (deduce.ts) with a hard time cap, for batch runs. deduce's own budget is
// checked between rounds, but one clingo call (a round of case splits, a wide explanation) can't be
// interrupted and can run for hours on an unlucky puzzle. So each puzzle runs in a child process,
// killed at the cap: a batch moves on instead of stalling.
//
//   const r = await deduceGuarded(spec, { budgetMs: 15000 }, 120000);   // null when it hit the cap
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce, type Profile, type Step } from "./deduce.ts";

type Opts = Parameters<typeof deduce>[1];
const self = fileURLToPath(import.meta.url);

export function deduceGuarded(spec: GridSpec, opts: Opts, capMs: number): Promise<{ path: Step[]; profile: Profile } | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [self, "--child"], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "", done = false;
    const timer = setTimeout(() => { done = true; child.kill("SIGKILL"); resolve(null); }, capMs);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      if (done) return;
      clearTimeout(timer); done = true;
      try { const r = JSON.parse(out); if (r.error) reject(new Error(r.error)); else resolve(r); }
      catch { reject(new Error(`deduce child exited ${code}`)); }
    });
    child.stdin.end(JSON.stringify({ spec, opts }));
  });
}

if (process.argv[2] === "--child") {
  let input = "";
  process.stdin.on("data", (d) => { input += d; });
  process.stdin.on("end", async () => {
    const { spec, opts } = JSON.parse(input);
    try { process.stdout.write(JSON.stringify(await deduce(spec, opts))); }
    catch (e) { process.stdout.write(JSON.stringify({ error: String((e as Error).message ?? e) })); }
  });
}
