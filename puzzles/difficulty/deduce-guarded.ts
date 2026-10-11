// The deduction solver (deduce.ts) with a hard time cap, for batch runs. deduce's own budget is
// checked between rounds, but one clingo call (a round of case splits, a wide explanation) can't be
// interrupted and can run for hours on an unlucky puzzle. So each puzzle runs in a child process,
// killed at the cap: a batch moves on instead of stalling.
//
//   const r = await deduceGuarded(spec, { budgetMs: 15000 }, 120000);   // null when it hit the cap
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce } from "./deduce.ts";

type Opts = Parameters<typeof deduce>[1];
const self = fileURLToPath(import.meta.url);
// children die with the batch that started them
const live = new Set<ReturnType<typeof spawn>>();
process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));

export function deduceGuarded(spec: GridSpec, opts: Opts, capMs: number): Promise<Awaited<ReturnType<typeof deduce>> | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [self, "--child"], { stdio: ["pipe", "pipe", "inherit"] });
    live.add(child);
    let out = "", done = false;
    const timer = setTimeout(() => { done = true; child.kill("SIGKILL"); resolve(null); }, capMs);
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      live.delete(child);
      if (done) return;
      clearTimeout(timer); done = true;
      try { const r = JSON.parse(out); if (r.error) reject(new Error(r.error)); else resolve(r); }
      catch { reject(new Error(`deduce child exited ${code}`)); }
    });
    child.stdin.end(JSON.stringify({ spec, opts }));
  });
}

if (process.argv[2] === "--child") {
  // a batch that's gone can't take the answer: exit quietly
  process.stdout.on("error", () => process.exit(0));
  let input = "";
  process.stdin.on("data", (d) => { input += d; });
  process.stdin.on("end", async () => {
    const { spec, opts } = JSON.parse(input);
    try { process.stdout.write(JSON.stringify(await deduce(spec, opts))); }
    catch (e) { process.stdout.write(JSON.stringify({ error: String((e as Error).message ?? e) })); }
  });
}
