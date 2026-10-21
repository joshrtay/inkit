// Slow or stuck? The deduction solver (deduce.ts, human-shard.ts's settings: structure on) on a
// sample of puzzles, with a long budget and its progress logged each round, so a puzzle it didn't
// finish in the human build's 30 s can be read as still climbing (slow) or flat (stuck).
//
//   DEDUCE_JOBS=8 node --no-warnings puzzles/difficulty/solver-speed.ts [--shard k --of N]
//
// - Puzzles: references/ml/solver-speed-sample/*.jsonl (SPEED_SAMPLE), corpus records ({ key,
//   genre, spec, ... }), made from the build's status by a sampling script outside the repo.
// - Each solve runs in its own process: budget SPEED_BUDGET_S (300 s, checked between rounds),
//   killed at SPEED_CAP_S (400 s); one row per puzzle appended to references/<OUT>/rows.jsonl
//   (OUT default solver-speed), skipping keys already there (a resumed Batch task):
//   { key, genre, side, marks, finished, killed, ms, notes, rounds: [[ms, open, splits, searches]] }
//   where rounds has the marks still open at the start of each round and at the end, and the
//   tier-2 (case split) and tier-3 (search) steps taken so far.
// - With --shard k --of N it takes the puzzles whose key hashes to shard k (run-batch.sh).
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child") {
  // one solve: a line per round ("P ms open marks splits searches") and the result ("R {...}")
  const { deduce } = await import("./deduce.ts");
  process.stdout.on("error", () => process.exit(0));
  let input = "";
  process.stdin.on("data", (d) => { input += d; });
  process.stdin.on("end", async () => {
    const { spec, budgetMs } = JSON.parse(input);
    try {
      const r = await deduce(spec, {
        budgetMs, structure: true,
        onRound: (ms, open, marks, path) => {
          let splits = 0, searches = 0;
          for (const s of path) { if (s.tier === 2) splits++; else if (s.tier === 3) searches++; }
          process.stdout.write(`P ${ms} ${open} ${marks} ${splits} ${searches}\n`);
        },
      });
      process.stdout.write(`R ${JSON.stringify({ solved: r.profile.solved, notes: r.profile.notes, ms: r.profile.ms })}\n`);
    } catch (e) { process.stdout.write(`R ${JSON.stringify({ error: String((e as Error).message ?? e).slice(0, 200) })}\n`); }
  });
} else await main();

async function main() {
  const { REFS_DIR } = await import("./janko.ts");
  const { mapPool } = await import("./pool.ts");
  const argv = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
  const BUDGET = Number(process.env.SPEED_BUDGET_S ?? 300) * 1000, CAP = Number(process.env.SPEED_CAP_S ?? 400) * 1000;
  const sampleDir = process.env.SPEED_SAMPLE ?? `${REFS_DIR}ml/solver-speed-sample/`;
  const outDir = `${REFS_DIR}${process.env.OUT ?? "solver-speed"}/`, out = `${outDir}rows.jsonl`;
  mkdirSync(outDir, { recursive: true });
  const N = opt("--of", 1), K = opt("--shard", 0);

  const items: any[] = [];
  for (const f of readdirSync(sampleDir).filter((x) => x.endsWith(".jsonl")).sort())
    for (const l of readFileSync(`${sampleDir}${f}`, "utf8").split("\n")) if (l.trim()) items.push(JSON.parse(l));
  const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l).key) : []);
  const todo = items.filter((r) => parseInt(r.key.slice(0, 8), 16) % N === K && !done.has(r.key));
  console.error(`shard ${K} of ${N}: ${todo.length} to do (budget ${BUDGET / 1000} s, killed at ${CAP / 1000} s)`);

  let n = 0;
  await mapPool(todo, (r) => new Promise<void>((resolve) => {
    const rounds: number[][] = [];
    let marks = 0, result: any = null, buf = "", killed = false;
    const t0 = Date.now();
    const child = spawn(process.execPath, ["--no-warnings", self, "--child"], { stdio: ["pipe", "pipe", "inherit"] });
    const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, CAP);
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith("P ")) { const [ms, open, m, splits, searches] = line.slice(2).split(" ").map(Number); marks = m; rounds.push([ms, open, splits, searches]); }
        else if (line.startsWith("R ")) result = JSON.parse(line.slice(2));
      }
    });
    child.on("close", () => {
      clearTimeout(timer);
      const row = { key: r.key, genre: r.genre, side: Math.max(...r.spec.size), marks, finished: !!result?.solved, killed, ms: Date.now() - t0,
        notes: result?.notes ?? (result?.error ? [`error: ${result.error}`] : killed ? [] : ["child died"]), rounds };
      appendFileSync(out, JSON.stringify(row) + "\n");
      console.error(`${++n}/${todo.length} ${r.genre} ${row.finished ? "finished" : killed ? "killed" : "unfinished"} ${(row.ms / 1000).toFixed(0)} s`);
      resolve();
    });
    child.stdin.end(JSON.stringify({ spec: r.spec, budgetMs: BUDGET }));
  }));
}
