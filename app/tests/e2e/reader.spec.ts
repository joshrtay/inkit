// The reader's evaluation on sketchpad drawings: for each puzzle type, its first example
// (src/games/<type>/1.json) is drawn with the sketchpad's own tools (sketchpad/from-puzzle.ts), opened
// in paint (a blank draft, the drawing in this browser's copy of it), downloaded as a picture
// (… > Download a picture), and that picture read as a photo on /new, as a creator would. The draft
// it makes is scored against the example (reader-score.ts), and the results go to
// tests/e2e/reader-results.json and docs/reader-eval.md. (Until paint, /new/draw sent the picture
// with the drawing's data; a photo has only the picture.)
//
// It calls Claude for every type, so it costs money (about $0.05-0.20 a type): it only runs with
// READER_EVAL=1 (`npm run test:reader`), never in the normal browser tests. READER_TYPES=akari,cave
// runs only those types (results for the others are kept); READER_BUDGET (default $5) stops it
// once the recorded spend reaches it.
import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "~site/engine/puzzle.ts";
import type { GridSpec } from "~site/engine/types.ts";
import { FOLDER_GENRE, specOf, toDrawing } from "~/sketchpad/from-puzzle";
import { looseSpec, parseSketch } from "~/games/sketch";
import { q, RUN_FILE, sql, type Run } from "./db";
import { blankDraft } from "./paint-helpers";
import { score, type Score } from "./reader-score";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const RESULTS = "tests/e2e/reader-results.json";
const REPORT = new URL("../../../docs/reader-eval.md", import.meta.url).pathname;
const BUDGET = Number(process.env.READER_BUDGET ?? 5);
/** $ per million tokens, input / output (Anthropic's list prices). */
const PRICES: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };

interface Look { reader: string; model: string; ms: number; inputTokens?: number; outputTokens?: number; trouble?: string[]; error?: string }
interface Result { type: string; genre: string; date: string; error?: string; model?: string; looks: Look[]; cost: number; score?: Score; sketch?: string }
interface Results { runs: { date: string; types: string[]; cost: number }[]; latest: Record<string, Result>; first: Record<string, Result> }

const cost = (looks: Look[]) => looks.reduce((s, l) => { const [i, o] = PRICES[l.model] ?? [4, 20]; return s + ((l.inputTokens ?? 0) * i + (l.outputTokens ?? 0) * o) / 1e6; }, 0);
const load = (): Results => (existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : { runs: [], latest: {}, first: {} });
const spent = (r: Results) => r.runs.reduce((s, x) => s + x.cost, 0);

const only = process.env.READER_TYPES?.split(",").map((s) => s.trim()).filter(Boolean);
const folders = readdirSync(GAMES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  .filter((f) => !only || only.includes(f));
const me = () => (JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run).userId;
const run = { date: new Date().toISOString(), types: [] as string[], cost: 0 };

test.describe("the reader reads sketchpad drawings", () => {
  test.skip(!process.env.READER_EVAL, "costs money: run with READER_EVAL=1 (npm run test:reader)");
  test.describe.configure({ mode: "serial", retries: 0 });

  for (const folder of folders) {
    test(folder, async ({ page }) => {
      test.setTimeout(240_000);
      const before = load();
      test.skip(spent(before) + run.cost >= BUDGET, `the budget ($${BUDGET}) is spent`);
      const genre = FOLDER_GENRE[folder] ?? folder;
      const file = readdirSync(`${GAMES}${folder}`).filter((x) => x.endsWith(".json")).sort()[0];
      const source: GridSpec = specOf(genre, JSON.parse(readFileSync(`${GAMES}${folder}/${file}`, "utf8")));
      const { drawing } = toDrawing(makePuzzle(source), genre);

      // the drawing as this browser's copy of a blank draft, so paint opens with it; then its picture
      const blank = blankDraft(`reader-${folder}`);
      await page.addInitScript(([key, d]) => localStorage.setItem(key, d),
        [`inkit:draw:${blank}`, JSON.stringify({ drawing, genre: null, settings: {}, title: "Untitled", dirty: true })] as const);
      await page.goto(`/g/${blank}/draw`);
      if (drawing.grid) await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", `${drawing.grid.rows}x${drawing.grid.cols}`);
      else await expect(page.locator(".sp-board .sp-ink > *").first()).toBeAttached();
      const download = page.waitForEvent("download");
      await page.locator(".studio-top").getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Download a picture" }).click();
      const picture = await (await download).path();
      // read as a photo, on /new
      await page.goto("/new");
      await page.locator('input[type="file"]').setInputFiles(picture!);
      const done = await Promise.race([
        page.waitForURL(/\/g\/[^/]+\/(draw\?read=1|edit)$/, { timeout: 200_000 }).then(() => "read"),
        page.locator(".new-way .error").waitFor({ timeout: 200_000 }).then(() => "error"),
      ]);

      const result: Result = { type: folder, genre, date: run.date, looks: [], cost: 0 };
      if (done === "read") {
        const id = new URL(page.url()).pathname.split("/")[2];
        const [game] = sql<{ sketch: string }>(`select sketch from games where id = ${q(id)}`);
        const [read] = sql<{ attempts: string; model: string }>(`select attempts, model from reads where game_id = ${q(id)} order by created_at desc limit 1`);
        result.looks = JSON.parse(read?.attempts ?? "[]");
        result.model = read?.model;
        result.sketch = game.sketch;
        const parsed = parseSketch(game.sketch);
        const spec = parsed.ok ? parsed.spec : looseSpec(game.sketch);
        result.score = await score(source, spec);
      } else {
        result.error = (await page.locator(".new-way .error").textContent()) ?? "error";
        // a failed read is still recorded, with what it cost
        const [read] = sql<{ attempts: string }>(`select attempts from reads where game_id is null and creator_id = ${q(me())} order by created_at desc limit 1`);
        result.looks = JSON.parse(read?.attempts ?? "[]");
      }
      result.cost = cost(result.looks);
      run.cost += result.cost;
      if (!run.types.includes(folder)) run.types.push(folder);

      const all = load();
      all.latest[folder] = result;
      all.first[folder] ??= result;
      const i = all.runs.findIndex((r) => r.date === run.date);
      if (i >= 0) all.runs[i] = { ...run }; else all.runs.push({ ...run });
      writeFileSync(RESULTS, `${JSON.stringify(all, null, 1)}\n`);
      writeFileSync(REPORT, report(all));
      console.log(`${folder}: ${result.error ?? summary(result.score!)} ($${result.cost.toFixed(3)}, ${result.looks.map((l) => l.model).join(" → ")})`);
    });
  }
});

// ---- the report ----

function summary(s: Score) {
  const g = s.givens;
  return [s.exact ? "exact" : "not exact", s.genre.ok ? "" : `type ${s.genre.got}`, s.size.ok ? "" : `size ${s.size.got}`,
    `givens ${g.correct}/${g.total}`, g.missing.length ? `${g.missing.length} missing` : "", g.extra.length ? `${g.extra.length} extra` : "",
    g.wrong.length ? `${g.wrong.length} wrong` : "", s.areas && !s.areas.ok ? `areas off (${s.areas.cells} squares)` : "",
    s.rules.ok ? "" : "rules differ", `solution ${s.solution}`].filter(Boolean).join(", ");
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

function table(rs: Result[]) {
  const rows = rs.map((r) => {
    const s = r.score, g = s?.givens;
    if (!s || !g) return `| ${r.type} | – | – | – | – | – | – | read failed: ${r.error ?? "?"} |`;
    const tick = (b: boolean) => (b ? "✓" : "✗");
    const notes = [!s.genre.ok ? `read as ${s.genre.got}` : "", !s.size.ok ? `size ${s.size.got}` : "",
      g.missing.length ? `missing: ${g.missing.slice(0, 4).join("; ")}${g.missing.length > 4 ? "…" : ""}` : "",
      g.extra.length ? `extra: ${g.extra.slice(0, 4).join("; ")}${g.extra.length > 4 ? "…" : ""}` : "",
      g.wrong.length ? `wrong: ${g.wrong.slice(0, 4).join("; ")}${g.wrong.length > 4 ? "…" : ""}` : "",
      s.areas && !s.areas.ok ? `areas off at ${s.areas.cells} squares` : "",
      s.rules.missing.length ? `rules missing: ${s.rules.missing.join(" ")}` : "", s.rules.extra.length ? `rules extra: ${s.rules.extra.join(" ")}` : ""]
      .filter(Boolean).join("; ").replace(/\|/g, "/");
    return `| ${r.type} | ${tick(s.genre.ok)} | ${tick(s.size.ok)} | ${g.correct}/${g.total}${g.extra.length ? ` +${g.extra.length}` : ""} | ${s.areas ? tick(s.areas.ok) : ""}${tick(s.rules.ok)} | ${s.solution} | ${r.looks.map((l) => l.model.replace("claude-", "")).join(" → ")} $${r.cost.toFixed(3)} | ${notes || "exact"} |`;
  });
  return ["| Type | Type read | Size | Givens right (+extra) | Areas, rules | Solution | Reader, cost | Misses |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}

function totals(rs: Result[]) {
  const scored = rs.filter((r) => r.score).map((r) => r.score!);
  const givens = scored.reduce((a, s) => ({ total: a.total + s.givens.total, correct: a.correct + s.givens.correct, extra: a.extra + s.givens.extra.length }), { total: 0, correct: 0, extra: 0 });
  return `${rs.length} types: **${scored.filter((s) => s.exact).length} read exactly** (${pct(scored.filter((s) => s.exact).length, rs.length)}); ` +
    `type right ${scored.filter((s) => s.genre.ok).length}, size right ${scored.filter((s) => s.size.ok).length}, ` +
    `same solution ${scored.filter((s) => s.solution === "same").length}; givens ${givens.correct}/${givens.total} right (${pct(givens.correct, givens.total)}) with ${givens.extra} extra; ` +
    `${rs.filter((r) => !r.score).length} failed reads. Cost $${rs.reduce((a, r) => a + r.cost, 0).toFixed(2)}.`;
}

function report(all: Results) {
  const latest = Object.values(all.latest).sort((a, b) => a.type.localeCompare(b.type));
  const first = Object.values(all.first).sort((a, b) => a.type.localeCompare(b.type));
  const looks = latest.flatMap((r) => r.looks);
  const tokens = (k: "inputTokens" | "outputTokens") => looks.reduce((s, l) => s + (l[k] ?? 0), 0);
  const models = [...new Set(looks.map((l) => l.model))].join(", ");
  return `# The reader on sketchpad drawings

How well the sketch reader (\`app/app/lib/read-sketch.server.ts\`) reads puzzles drawn in the
sketchpad. For each puzzle type its first example (\`src/games/<type>/1.json\`) is drawn
with the sketchpad's own tools (\`app/app/sketchpad/from-puzzle.ts\`, with the type's name and any
extra rules written above the grid, as creators are told to), downloaded from paint as a picture and
read as a photo on /new on the local site, and the draft compared with the example: the type, the size, the givens (each clue at
its place: missing, extra, or a wrong value there), outlined areas, the rules and their settings,
and whether the read puzzle has the example's solution (and only it; a panel just has to accept
the example's line). Made by \`app/tests/e2e/reader.spec.ts\` (\`npm --prefix app run test:reader\`;
it calls Claude, so it costs money); the data is in \`app/tests/e2e/reader-results.json\`.

Last run: ${latest.map((r) => r.date).sort().at(-1)?.slice(0, 10)}. Models: ${models}. Tokens (latest reads): ${tokens("inputTokens").toLocaleString("en")} in, ${tokens("outputTokens").toLocaleString("en")} out.
Spent on these runs in all: $${spent(all).toFixed(2)} (${all.runs.length} run${all.runs.length === 1 ? "" : "s"}; list prices: Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20 per million tokens in / out).

## Now

${totals(latest)}

${table(latest)}

## Fixes after the first read

- **Nonograms** (picture-squares): \`from-puzzle.ts\` drew nothing but the grid for a puzzle made from
  its picture; it now writes the row and column numbers worked out from the picture, as a creator would.
- **Rules the type has anyway** (easy-as-abc's "letters count 3", Three Coats' "painted" and
  "neighbor-dots"): the reader listed them; \`toSketch\` now leaves out a rule the type already has
  with the same settings.
- **Three Coats' hidden dots**: the clue guide had no way to say a dot is hidden; it now says to add
  "hidden", and \`givenOf\` reads it.
- **Panels** are drawn on the grid's Tracks look (wide pale tracks), as a creator would draw one.

The drawing has the type's name written above it, and the reader gets the drawing's data with its
picture (\`drawingBrief\`), so this measures the reader at its best; a photo of a hand drawing is harder.

## First read

Before any fixes to the drawing, the brief or the reader's guide: ${totals(first)}

${table(first)}
`;
}
