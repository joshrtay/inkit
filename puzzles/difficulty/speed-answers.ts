// Aim 4: each puzzle's answer, found once, so speed runs can hand it to deduce (solver-speed.ts's
// SPEED_ANSWERS=1) and setup doesn't spend its time finding it (up to 47 s on some Nurikabes). A
// published puzzle comes with its answer, so a timed solve needn't find it.
//
//   node puzzles/difficulty/speed-answers.ts <records.jsonl> <out.jsonl>
//
// Writes the same records with `answer` (the true marks, as deduce names them) and prints the
// time each took to find.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { deduce } from "./deduce.ts";

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: speed-answers.ts <records.jsonl> <out.jsonl>");
writeFileSync(out, "");
for (const l of readFileSync(src, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const r = JSON.parse(l), t = Date.now();
  // (a solve with no time: the answer is found in setup, before the first round)
  const { answer } = await deduce(r.spec, { budgetMs: 0 });
  appendFileSync(out, JSON.stringify({ ...r, answer }) + "\n");
  console.error(`${r.genre} ${r.key.slice(0, 8)}: ${answer?.length ?? 0} marks true, ${Date.now() - t} ms`);
}
