// Sonnet vs Opus as the hint writer (Josh's go, 2026-10-29; about $3): the same stuck points for
// each example (stuck.ts), worded by each model (words.ts), then a blind judge (Haiku, both orders
// to cancel position bias) picks the ladder a stuck player is better served by. Also counts what
// each falls short on (rungs that fell back to the solver's words, style problems) and costs.
//
//   INKIT_ANTHROPIC_KEY=... node --no-warnings puzzles/hints/compare-writers.ts [--example akari/1,…] [--out file.json]
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { GridSpec } from "../../src/engine/types.ts";
import { type Ladder, styleProblems, words } from "../../src/lib/hint-ladder.ts";
import { stuckPoints } from "./stuck.ts";
import { askModel, ladderFromReply, parseReply, WRITERS, writerPrompt, type Writer } from "./words.ts";

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const DEFAULT = "akari/1,akari/2,sudoku/1,sudoku/2,masyu/1,masyu/2,slitherlink/1,slitherlink/2,nurikabe/1,nurikabe/2,hitori/1,skyscrapers/1,star-battle/1,fillomino/1,shikaku/1,binary-puzzle/1,numberlink/1,hidoku/1,thermo-sudoku/1,easy-as-abc/1";
const names = arg("example", DEFAULT)!.split(",");
const CAP = Number(process.env.HINTS_CAP) || 5;
const JUDGE = { id: "claude-haiku-5-5", input: 0.1 / 1e6, output: 0.5 / 1e6 };
const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
const client = new Anthropic({ apiKey: key, maxRetries: 2 });
let spent = 0;

const show = (l: Ladder) => [
  ...l.opening.map((r) => `[${r.kind}] ${r.text}`),
  ...l.points.flatMap((p, k) => [`-- stuck point ${k + 1}`, ...p.rungs.map((r) => `[${r.kind}${r.technique ? `: ${r.technique}` : ""}] ${r.text}`)]),
].join("\n");

async function judge(prompt: string, a: Ladder, b: Ladder): Promise<{ pick: "A" | "B" | "tie"; why: string }> {
  const ask = `You are judging hint ladders for a logic puzzle site. Below is what the hint writers were given (the puzzle and the solver's stuck points, with the step that gets a player past each), then two ladders, A and B.
A good ladder: every hint is true to the given steps; early rungs point without giving the answer away; the rule rung teaches a reusable idea a player could apply again; it is short, plain and clear to a 10-to-adult player.
Answer with one line "PICK: A", "PICK: B" or "PICK: tie", then one sentence why.

=== WHAT THE WRITERS WERE GIVEN ===
${prompt}

=== LADDER A ===
${show(a)}

=== LADDER B ===
${show(b)}`;
  const r = await client.messages.create({ model: JUDGE.id, max_tokens: 8000, output_config: { effort: "high" }, messages: [{ role: "user", content: ask }] } as never) as Anthropic.Message;
  spent += r.usage.input_tokens * JUDGE.input + r.usage.output_tokens * JUDGE.output;
  const text = r.content.map((x) => (x.type === "text" ? x.text : "")).join("");
  const m = text.match(/PICK:\s*(A|B|tie)/i);
  return { pick: (m ? (m[1].toLowerCase() === "tie" ? "tie" : m[1].toUpperCase()) : "tie") as "A" | "B" | "tie", why: text.replace(/PICK:.*\n?/i, "").trim().slice(0, 300) };
}

const rows: unknown[] = [];
const score = { sonnet: 0, opus: 0, tie: 0 };
const per = { sonnet: { cost: 0, fell: 0, style: 0, words: 0, rungs: 0 }, opus: { cost: 0, fell: 0, style: 0, words: 0, rungs: 0 } };
for (const name of names) {
  if (spent >= CAP) { console.log(`stopped: spent $${spent.toFixed(2)} of $${CAP}`); break; }
  const d = JSON.parse(readFileSync(new URL(`../../src/games/${name}.json`, import.meta.url), "utf8"));
  const spec: GridSpec = { ...d.grid, genre: d.grid.genre ?? name.split("/")[0] };
  const stuck = await stuckPoints(spec, { budgetMs: 60_000 });
  if (!stuck.solved) { console.log(`${name}: solver didn't finish, skipped`); continue; }
  const prompt = writerPrompt(spec, stuck);
  const out: Partial<Record<Writer, { ladder: Ladder; problems: string[]; cost: number }>> = {};
  await Promise.all((["sonnet", "opus"] as Writer[]).map(async (w) => {
    const { text, cost } = await askModel(prompt, w);
    spent += cost;
    const { ladder, problems } = ladderFromReply(spec, stuck, parseReply(text), WRITERS[w].version);
    out[w] = { ladder, problems, cost };
    const all = [...ladder.opening, ...ladder.points.flatMap((p) => p.rungs)];
    per[w].cost += cost; per[w].fell += problems.length; per[w].style += styleProblems(ladder).length;
    per[w].words += all.reduce((n, r) => n + words(r.text), 0); per[w].rungs += all.length;
  }));
  const s = out.sonnet!.ladder, o = out.opus!.ladder;
  // both orders: a model wins the puzzle only if it wins both, or one with a tie
  const first = await judge(prompt, s, o), second = await judge(prompt, o, s);
  const v = (j: typeof first, aIs: Writer) => (j.pick === "tie" ? 0 : (j.pick === "A") === (aIs === "sonnet") ? 1 : -1);
  const net = v(first, "sonnet") + v(second, "opus");
  const winner = net > 0 ? "sonnet" : net < 0 ? "opus" : "tie";
  score[winner]++;
  console.log(`${name}: ${winner}  (${first.pick}/${second.pick})  sonnet $${out.sonnet!.cost.toFixed(3)} fell ${out.sonnet!.problems.length}; opus $${out.opus!.cost.toFixed(3)} fell ${out.opus!.problems.length}`);
  rows.push({ name, points: stuck.points.length, creatorMoves: stuck.creatorMoves ?? 0, winner, judge: [first, second], sonnet: out.sonnet, opus: out.opus });
}
console.log(`\nwins: sonnet ${score.sonnet}, opus ${score.opus}, tie ${score.tie}`);
for (const w of ["sonnet", "opus"] as const) {
  const p = per[w];
  console.log(`${w}: $${p.cost.toFixed(3)} total, ${p.fell} rungs fell back, ${p.style} style problems, ${(p.words / Math.max(1, p.rungs)).toFixed(1)} words a rung`);
}
console.log(`spent $${spent.toFixed(3)} in all`);
const file = arg("out");
if (file) writeFileSync(file, JSON.stringify({ score, per, spent, rows }, null, 1));
