// The no-network baseline B0 on the frontier: the human puzzles our deduction solver doesn't
// finish (research-state.md, "a cheap solver for hard human puzzles"). B0 refutes every open mark
// by propagation, plays what's forced, and repeats; when nothing is, it raises a conflict limit
// (4, 16, ... 1024) until some mark refutes, plays that, and drops back to propagation. No
// explanations, no windows. Each move is proven: the opposite value is inconsistent with the
// rules and the moves before it.
//
// The whole loop runs inside one clingo run (Lua in clingo-wasm): the puzzle is ground once and
// every test is a solve under assumptions with a conflict limit, so a test costs microseconds to
// milliseconds, not a fresh clingo start. Each puzzle runs in its own child process, killed at a
// wall-clock cap.
//
//   DEDUCE_JOBS=3 nice node --no-warnings puzzles/difficulty/frontier-b0.ts [--per-band N] [--limit N] [--budget S] [--keys file]
//   node --no-warnings puzzles/difficulty/frontier-b0.ts --report
//
// - The frontier: every corpus puzzle whose cached outcome (the human build's caches, given with
//   --cache dir ..., default references/ml/frontier/cloud-cache/shard-*/cache and the local
//   human-corpus-cache) isn't finished and isn't known to have no or several solutions. Uniqueness
//   timeouts and skips are kept: B0 deciding every mark proves the puzzle unique.
// - --per-band N: N puzzles per genre and size band (≤ 10, ≤ 15, ≤ 20, > 20), chosen by key hash.
// - Results: references/ml/frontier/b0/<key>.json (a rerun skips what's done):
//   { key, genre, side, status: "solved" | "stuck" | "budget" | "cap" | "error", groundS, cpuS,
//     marks, decided, tests, curve: [[cpuS, decided]...], stalls: [K...] (the conflict limit each
//     stall needed, -1 when none up to the top), byLevel: { K: facts } (0: propagation alone), checked }
//   `checked` is the engine's own rule check on the final board (solved puzzles only).
// - --report: the anytime curves (share solved, and share of marks decided, against CPU-seconds a
//   puzzle) by genre and band, beside the deduction solver and clingo alone from the build's
//   caches → references/ml/frontier/b0-report.md.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
// conflict limits; 0 is propagation alone (stopped at the first fixpoint, before any choice)
const LADDER = [0, 1, 4, 16, 64, 256, 1024];

/** B0 as a clingo Lua main: prints "G <ground s>", "E <cpu s> <decided>", "S <K>", "L <K>",
 *  "T <total marks>", "R <status> <cpu s>" and, once solved, "M <atom>..." (the board). */
function b0Script(budgetS: number, preset: [string, boolean][] = []): string {
  return `
#script (lua)
function main(prg)
  local t0 = os.clock()
  prg:ground({{"base", {}}})
  print("G " .. (os.clock() - t0))
  local sigs = {{"fence",1},{"line",1},{"shaded",1},{"cut",1},{"digit",2},{"paint",2}}
  local lits, seen, total, names = {}, {}, 0, {}
  local val = {}
  for _, sg in ipairs(sigs) do
    for a in prg.symbolic_atoms:by_signature(sg[1], sg[2], true) do
      local l = a.literal
      names[tostring(a.symbol)] = l
      if not seen[l] and not seen[-l] then
        seen[l] = true; total = total + 1
        if a.is_fact then val[l] = true else table.insert(lits, l) end
      end
    end
  end
  print("T " .. total)
  local known = {}
  local ndec = total - #lits
  print("E " .. (os.clock() - t0) .. " " .. ndec)
  local function decided(l) return val[l] ~= nil or val[-l] ~= nil end
  local function play(l)
    if val[l] ~= nil then return end
    val[l] = true; val[-l] = false; table.insert(known, l); ndec = ndec + 1
    print("E " .. (os.clock() - t0) .. " " .. ndec)
  end
  -- propagation alone: a propagator stops the solve at the first fixpoint with every
  -- assumption true (no conflict, so not refuted), before the solver makes a choice
  local P = { on = false, ass = {}, sl = nil }
  function P:init(init)
    init.check_mode = clingo.PropagatorCheckMode.Fixpoint
    if not self.sl then
      self.sl = {}
      for _, l in ipairs(lits) do self.sl[l] = init:solver_literal(l); self.sl[-l] = init:solver_literal(-l) end
    end
  end
  function P:check(control)
    if not self.on then return end
    local a = control.assignment
    for _, l in ipairs(self.ass) do if not a:is_true(self.sl[l]) then return end end
    -- how much the assumption settled: the look-ahead score that orders the case splits
    local n = 0
    for _, l in ipairs(lits) do if a:is_true(self.sl[l]) or a:is_false(self.sl[l]) then n = n + 1 end end
    self.last = n
    prg:interrupt()
  end
  prg:register_propagator(P)
  local calls, score = 0, {}
  local function refutes(l, k)
    local ass = {}
    for i, x in ipairs(known) do ass[i] = x end
    ass[#ass + 1] = l
    calls = calls + 1
    P.on = (k == 0); P.ass = ass
    prg.configuration.solve.solve_limit = (k == 0 and "umax" or k) .. ",umax"
    P.last = nil
    local r = prg:solve({assumptions = ass})
    if k == 0 and P.last then score[l] = P.last end
    return r.unsatisfiable == true
  end
  local ladder = ${JSON.stringify(LADDER).replace("[", "{").replace("]", "}")}
  local preset = {${preset.map(([m, v]) => `{"${m}",${v}}`).join(",")}}
  if #preset > 0 then
    -- a stall state (the deduction solver's facts): played first, then how many open marks
    -- propagation alone forces there, then B0 from there with its clock reset
    for _, f in ipairs(preset) do local l = names[f[1]]; if l and not decided(l) then play(f[2] and l or -l) end end
    print("P " .. ndec)
    local t1, n = os.clock(), 0
    for _, l in ipairs(lits) do
      if not decided(l) and (refutes(l, 0) or refutes(-l, 0)) then n = n + 1 end
    end
    print("F " .. n .. " " .. (os.clock() - t1))
    t0 = os.clock()
    print("E 0 " .. ndec)
  end
  local level, status = 1, "stuck"
  while true do
    if ndec >= total then status = "solved"; break end
    local K, progress, over = ladder[level], false, false
    if level == 1 then
      -- propagation alone: every open mark, both ways, playing each forced value at once
      for _, l in ipairs(lits) do
        if os.clock() - t0 > ${budgetS} then over = true; break end
        if not decided(l) then
          local hit = nil
          if refutes(l, K) then hit = -l elseif refutes(-l, K) then hit = l end
          if hit then play(hit); progress = true; print("L " .. K) end
        end
      end
    else
      -- a case split under a conflict limit: the values that settled most under propagation
      -- first (the most constrained marks); the first refuted one is played
      local cand = {}
      for _, l in ipairs(lits) do if not decided(l) then cand[#cand + 1] = l; cand[#cand + 1] = -l end end
      table.sort(cand, function(x, y) return (score[x] or 0) > (score[y] or 0) end)
      for _, l in ipairs(cand) do
        if os.clock() - t0 > ${budgetS} then over = true; break end
        if not decided(l) and refutes(l, K) then play(-l); progress = true; print("L " .. K); break end
      end
    end
    if over then status = "budget"; break end
    if progress then
      if level > 1 then print("S " .. K); level = 1 end
    else
      level = level + 1
      if level > ${LADDER.length} then print("S -1"); break end
    end
  end
  print("R " .. status .. " " .. (os.clock() - t0) .. " " .. calls)
  if status == "solved" then
    P.on = false
    prg.configuration.solve.solve_limit = "umax,umax"
    local shown = {}
    prg:solve({assumptions = known, on_model = function(m)
      for _, s in ipairs(m:symbols({shown = true})) do table.insert(shown, tostring(s)) end
    end})
    print("M " .. table.concat(shown, " "))
  end
end
#end.
`;
}

if (process.argv[2] === "--child") {
  let input = "";
  process.stdin.on("data", (d) => { input += d; });
  process.stdin.on("end", async () => {
    const { spec, budgetS, preset } = JSON.parse(input);
    try {
      const { makePuzzle, check } = await import("../../src/engine/puzzle.ts");
      const { program, boardOf } = await import("../../src/engine/encode.ts");
      const { loadClingo, clingoRaw } = await import("./clingo.ts");
      await loadClingo();
      const p = makePuzzle(spec);
      const prog = program(p);
      const { lines, errors } = clingoRaw(`${prog}\n${b0Script(budgetS, preset)}`, "1");
      const res: any = { curve: [], stalls: [], byLevel: {} };
      let lastPt = -1;
      for (const l of lines) {
        const [tag, ...rest] = l.split(" ");
        if (tag === "G") res.groundS = Number(rest[0]);
        else if (tag === "T") res.marks = Number(rest[0]);
        else if (tag === "E") {
          const t = Number(rest[0]), d = Number(rest[1]);
          res.decided = d;
          // the curve thinned to about 1% steps of the marks
          if (d - lastPt >= Math.max(1, res.marks / 100) || d === res.marks) { res.curve.push([+t.toFixed(3), d]); lastPt = d; }
        } else if (tag === "L") res.byLevel[rest[0]] = (res.byLevel[rest[0]] ?? 0) + 1;   // facts by the conflict limit that found them
        else if (tag === "S") res.stalls.push(Number(rest[0]));
        else if (tag === "P") { res.stall = { decided: Number(rest[0]) }; res.curve = []; lastPt = -1; }
        else if (tag === "F") { res.stall.forcedNow = Number(rest[0]); res.stall.sweepS = Number(rest[1]); }
        else if (tag === "R") { res.status = rest[0]; res.cpuS = Number(rest[1]); res.tests = Number(rest[2]); }
        else if (tag === "M") {
          const problems = check(p, boardOf(p, rest));
          res.checked = problems.length ? problems.map((x) => x.message).join("; ").slice(0, 200) : "ok";
        }
      }
      if (!res.status) res.status = "error", res.error = errors.join(" ").slice(0, 200) || "no result";
      process.stdout.write(JSON.stringify(res));
    } catch (e) {
      process.stdout.write(JSON.stringify({ status: "error", error: String((e as Error).message ?? e).slice(0, 200) }));
    }
  });
} else await main();

async function main() {
  const { REFS_DIR } = await import("./janko.ts");
  const { JOBS, mapPool } = await import("./pool.ts");
  const argv = process.argv.slice(2);
  const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
  const STALL = argv.includes("--stall");
  const ml = `${REFS_DIR}ml/`, out = STALL ? `${ml}frontier/stall/` : `${ml}frontier/b0/`;
  mkdirSync(out, { recursive: true });
  const BUDGET = opt("--budget", 60);

  // ---- the corpus and the build's outcomes
  const corpus = new Map<string, any>();
  for (const f of readdirSync(`${ml}human-corpus/`).filter((x) => x.endsWith(".jsonl")))
    for (const l of readFileSync(`${ml}human-corpus/${f}`, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); corpus.set(r.key, r); }
  const generated = new Set<string>(existsSync(`${ml}human-corpus-generated-keys.json`) ? JSON.parse(readFileSync(`${ml}human-corpus-generated-keys.json`, "utf8")) : []);
  const ci = argv.indexOf("--cache");
  const cacheDirs = ci >= 0 ? argv.slice(ci + 1).filter((a) => !a.startsWith("--"))
    : [...(existsSync(`${ml}frontier/cloud-cache/`) ? readdirSync(`${ml}frontier/cloud-cache/`).filter((d) => d.startsWith("shard-")).map((d) => `${ml}frontier/cloud-cache/${d}/cache/`) : []), `${ml}human-corpus-cache/`];
  const build = new Map<string, any>();
  for (const d of cacheDirs) if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(".json")) {
    const x = JSON.parse(readFileSync(`${d}${f}`, "utf8")); delete x.record; build.set(x.key, x);
  }
  const side = (r: any) => Math.max(...r.spec.size);
  const band = (s: number) => (s <= 10 ? "≤ 10" : s <= 15 ? "≤ 15" : s <= 20 ? "≤ 20" : "> 20");
  const frontier = [...build.values()].filter((x) => !x.finished && !["none", "several", "error"].includes(x.unique) && corpus.has(x.key) && !generated.has(x.key));

  if (argv.includes("--report")) return report(frontier, build, corpus, out, side, band, `${ml}frontier/${STALL ? "stall" : "b0"}-report.md`);

  // the stall measurement needs a stall: puzzles proven unique where deduce ran out of budget
  // (not those killed at the cap, which leave no state, nor the skipped)
  let todo = frontier.filter((x) => !STALL || (x.unique === "unique" && x.why === "deduce: unfinished in budget")).map((x) => corpus.get(x.key));
  if (argv.includes("--keys")) { const ks = new Set(readFileSync(argv[argv.indexOf("--keys") + 1], "utf8").split(/\s+/)); todo = todo.filter((r) => ks.has(r.key)); }
  todo.sort((a, b) => (a.key < b.key ? -1 : 1));   // the key is a hash: a fair shuffle
  if (argv.includes("--per-band")) {
    const per = opt("--per-band", 10), seen = new Map<string, number>();
    todo = todo.filter((r) => { const b = `${r.genre} ${band(side(r))}`; const k = seen.get(b) ?? 0; seen.set(b, k + 1); return k < per; });
  }
  if (argv.includes("--limit")) todo = todo.slice(0, opt("--limit", todo.length));
  const left = todo.filter((r) => !existsSync(`${out}${r.key}.json`));
  console.error(`frontier ${frontier.length} (of ${build.size} in the build's caches); ${todo.length} chosen, ${left.length} to do, ${JOBS} at a time, ${BUDGET} s each`);

  const CAP = (BUDGET * 2 + 60) * 1000;
  let done = 0;
  const t0 = Date.now();
  const { deduceGuarded } = await import("./deduce-guarded.ts");
  await mapPool(left, async (r) => {
    let preset: [string, boolean][] | undefined, deduceInfo: any;
    if (STALL) {
      // the deduction solver as the build ran it (30 s budget, killed at 120 s): its facts are the stall
      const t = Date.now();
      const d = await deduceGuarded(r.spec, { budgetMs: 30000 }, 120000).catch((e) => ({ error: String(e.message ?? e).slice(0, 120) }));
      deduceInfo = { ms: Date.now() - t };
      if (d === null) deduceInfo.why = "over the cap";
      else if ("error" in d) deduceInfo.why = d.error;
      else {
        preset = d.path.flatMap((s) => s.facts.map((f) => [f.mark, f.value] as [string, boolean]));
        Object.assign(deduceInfo, { solved: d.profile.solved, steps: d.path.length, facts: preset.length, splits: d.path.filter((s) => s.tier === 3).length });
      }
      if (!preset || deduceInfo.solved) { writeFileSync(`${out}${r.key}.json`, JSON.stringify({ key: r.key, genre: r.genre, side: side(r), sources: r.sources, deduce: deduceInfo, status: "no stall" })); if (++done % 25 === 0) console.error(`${done}/${left.length}`); return; }
    }
    return runChild(r, preset, deduceInfo);
  });
  function runChild(r: any, preset: [string, boolean][] | undefined, deduceInfo: any) { return new Promise<void>((resolve) => {
    const c = spawn(process.execPath, ["--no-warnings", "--max-old-space-size=3000", self, "--child"], { stdio: ["pipe", "pipe", "pipe"] });
    let o = "", e = "", killed = false;
    const timer = setTimeout(() => { killed = true; c.kill("SIGKILL"); }, CAP);
    c.stdout.on("data", (d) => { o += d; });
    c.stderr.on("data", (d) => { e += d; });
    c.on("close", () => {
      clearTimeout(timer);
      let res: any;
      try { res = JSON.parse(o); } catch { res = { status: killed ? "cap" : "error", error: e.trim().split("\n").pop()?.slice(0, 200) }; }
      const x = build.get(r.key);
      writeFileSync(`${out}${r.key}.json`, JSON.stringify({ key: r.key, genre: r.genre, side: side(r), sources: r.sources, budgetS: BUDGET, build: { unique: x.unique, uniqueMs: x.uniqueMs, deduceMs: x.deduceMs ?? null, why: x.why }, ...(deduceInfo ? { deduce: deduceInfo } : {}), ...res }));
      if (++done % 25 === 0 || done === left.length) console.error(`${done}/${left.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      resolve();
    });
    c.stdin.end(JSON.stringify({ spec: r.spec, budgetS: BUDGET, preset }));
  }); }
}

function report(frontier: any[], build: Map<string, any>, corpus: Map<string, any>, out: string, side: (r: any) => number, band: (s: number) => string, file: string) {
  const all = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${out}${f}`, "utf8")));
  const res = all.filter((r) => r.status !== "no stall");
  const T = [0.1, 0.3, 1, 3, 10, 30, 60];
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
  const solvedBy = (r: any, t: number) => r.status === "solved" && r.cpuS <= t;
  const decidedAt = (r: any, t: number) => { let best = 0; for (const [s, k] of r.curve ?? []) if (s <= t) best = k; return r.marks ? best / r.marks : 0; };
  const L: string[] = [];
  L.push(`# B0 on the frontier (${new Date().toISOString().slice(0, 10)})`, "");
  L.push(`The frontier: ${frontier.length} human puzzles the deduction solver didn't finish (of ${build.size} the build has checked). B0 run on ${res.length} of them (a sample by genre and size band), budget ${res[0]?.budgetS ?? "?"} CPU-seconds each, one Mac core.`, "");
  const groups = new Map<string, any[]>();
  for (const r of res) { for (const g of ["all", r.genre, `band ${band(r.side)}`]) { const l = groups.get(g) ?? []; l.push(r); groups.set(g, l); } }
  const order = ["all", ...[...groups.keys()].filter((g) => g.startsWith("band")).sort(), ...[...groups.keys()].filter((g) => g !== "all" && !g.startsWith("band")).sort()];
  L.push("## Share solved against CPU-seconds a puzzle", "", `| Group | n | ${T.map((t) => `${t} s`).join(" | ")} | stuck | errors |`, `|---|---|${T.map(() => "---").join("|")}|---|---|`);
  for (const g of order) {
    const l = groups.get(g)!;
    L.push(`| ${g} | ${l.length} | ${T.map((t) => pct(l.filter((r) => solvedBy(r, t)).length, l.length)).join(" | ")} | ${pct(l.filter((r) => r.status === "stuck").length, l.length)} | ${l.filter((r) => r.status === "error" || r.status === "cap").length} |`);
  }
  L.push("", "## Share of marks decided (mean) against CPU-seconds a puzzle", "", `| Group | n | ${T.map((t) => `${t} s`).join(" | ")} |`, `|---|---|${T.map(() => "---").join("|")}|`);
  for (const g of order) {
    const l = groups.get(g)!.filter((r) => r.marks);
    L.push(`| ${g} | ${l.length} | ${T.map((t) => `${Math.round((100 * l.reduce((s, r) => s + decidedAt(r, t), 0)) / (l.length || 1))}%`).join(" | ")} |`);
  }
  // how hard the stalls are: the conflict limit the cheapest provable fact needed
  L.push("", "## Stalls: the conflict limit the next proven fact needed", "", "A stall is a state where no open mark refutes by propagation alone; the column is the conflict limit at which the next one did.", "", `| Group | puzzles solved by propagation alone | stalls | ${LADDER.slice(1).map((k) => `≤ ${k}`).join(" | ")} | none |`, `|---|---|---|${LADDER.slice(1).map(() => "---").join("|")}|---|`);
  for (const g of order) {
    const l = groups.get(g)!, st = l.flatMap((r) => r.stalls ?? []);
    const propOnly = l.filter((r) => r.status === "solved" && !(r.stalls ?? []).length).length;
    L.push(`| ${g} | ${pct(propOnly, l.length)} | ${st.length} | ${LADDER.slice(1).map((k) => st.filter((s: number) => s === k).length).join(" | ")} | ${st.filter((s: number) => s === -1).length} |`);
  }
  const st = res.filter((r) => r.stall);
  if (st.length) {
    // the deduction solver's stall states: what's forced there, and B0 from there
    L.push("", "## At the deduction solver's stall", "",
      `${all.length} puzzles proven unique where the deduction solver ran out of its 30 s budget: rerun, ${all.length - res.length} left no stall (killed at the cap, an error, or finished this time). At each of the ${st.length} stalls: the marks it had decided, how many open marks propagation alone forces there (both values of every open mark tried against all the rules), and the conflict limit the next fact needed when none. The curves above are B0 continuing from the stall, its clock starting there.`,
      "", "| Group | n | deduce's facts (median share of marks) | deduce's time (median s) | propagation forces ≥ 1 | forced-now marks (median) | none: next fact needed ≤ 1 | ≤ 16 | ≤ 1024 | none found |", "|---|---|---|---|---|---|---|---|---|---|");
    const sg = new Map<string, any[]>();
    for (const r of st) for (const g of ["all", r.genre]) { const l = sg.get(g) ?? []; l.push(r); sg.set(g, l); }
    for (const g of ["all", ...[...sg.keys()].filter((x) => x !== "all").sort()]) {
      const l = sg.get(g)!, z = l.filter((r) => r.stall.forcedNow === 0), first = (r: any) => r.stalls?.[0] ?? -1;
      L.push(`| ${g} | ${l.length} | ${Math.round(100 * median(l.map((r) => r.stall.decided / r.marks)))}% | ${median(l.map((r) => r.deduce.ms / 1000)).toFixed(0)} | ${pct(l.length - z.length, l.length)} | ${median(l.map((r) => r.stall.forcedNow))} | ${z.filter((r) => first(r) >= 0 && first(r) <= 1).length} | ${z.filter((r) => first(r) > 1 && first(r) <= 16).length} | ${z.filter((r) => first(r) > 16).length} | ${z.filter((r) => first(r) < 0).length} |`);
    }
  }
  const bad = res.filter((r) => r.checked && r.checked !== "ok");
  L.push("", `Solved boards that fail the engine's check: ${bad.length}.`);
  // beside: the deduction solver and clingo alone, on the same puzzles, from the build's caches
  const unique = res.filter((r) => r.build?.unique === "unique");
  L.push("", "## Beside: clingo alone and the deduction solver on the same puzzles", "",
    `clingo's uniqueness proof (find the solution, prove there's no other) finished within 60 s on ${pct(unique.length, res.length)} of them (the rest timed out or were skipped); its time, median ${median(unique.map((r) => r.build.uniqueMs / 1000)).toFixed(1)} s. The deduction solver finished none of them (by the frontier's definition: 30 s budget, killed at 120 s, or skipped).`,
    "", `| Group | n | clingo ≤ 1 s | ≤ 10 s | ≤ 60 s | B0 ≤ 1 s | ≤ 10 s | ≤ 60 s |`, "|---|---|---|---|---|---|---|---|");
  for (const g of order) {
    const l = groups.get(g)!, c = (t: number) => pct(l.filter((r) => r.build?.unique === "unique" && r.build.uniqueMs / 1000 <= t).length, l.length);
    L.push(`| ${g} | ${l.length} | ${c(1)} | ${c(10)} | ${c(60)} | ${pct(l.filter((r) => solvedBy(r, 1)).length, l.length)} | ${pct(l.filter((r) => solvedBy(r, 10)).length, l.length)} | ${pct(l.filter((r) => solvedBy(r, 60)).length, l.length)} |`);
  }
  writeFileSync(file, L.join("\n") + "\n");
  console.log(L.join("\n"));
}

function median(xs: number[]): number { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
