// Reading a hand-drawn sketch with Claude: the photo goes in, a structured reading comes out
// (game type, grid size, the clues the player starts with, rules, notes about anything
// uncertain), which becomes the game's sketch text. The creator then confirms it against
// their drawing (and can ask for a re-read with corrections) before the one-solution check.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Given, GridSpec, RuleSpec } from "~site/engine/types.ts";
import { parseSketch } from "../games/sketch";
import { Invalid } from "./errors.server";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const int = z.number().int();
const Cell = z.object({ row: int, col: int });
const Reading = z.object({
  readable: z.boolean().describe("false only if the image isn't a puzzle drawing at all; a messy or blurry puzzle is still readable"),
  problem: z.string().nullable().describe("when not readable: what's wrong, in one sentence for the creator"),
  genre: z.enum(["river", "slitherlink", "nurikabe", "nonogram", "sudoku", "panes"]),
  title: z.string().nullable().describe("a title written on the sketch, if any"),
  rows: int, cols: int,
  rules: z.array(z.object({
    rule: z.enum(["size", "size-clue", "one-each", "twins", "opposites", "all-different", "compass"]),
    value: int.nullable().describe("size: the region size; otherwise null"),
    of: z.enum(["number", "symbol"]).nullable().describe("one-each: what each region holds exactly one of; otherwise null"),
  })).describe("panes only: the rules written on the sketch; empty for other game types"),
  givens: z.array(z.object({
    kind: z.enum(["number", "block", "compass", "symbol", "twins", "opposites", "wall"]),
    cell: Cell.describe("the cell (for marks on a border: the cell on the top / left side)"),
    other: Cell.nullable().describe("marks on a border (twins, opposites, wall): the neighbouring cell on the other side; else null"),
    value: int.nullable().describe("number: its value; else null"),
    symbol: z.string().nullable().describe("symbol: a single character; else null"),
    compass: z.object({ n: int.nullable(), e: int.nullable(), s: int.nullable(), w: int.nullable() }).nullable(),
  })),
  runs: z.array(z.object({ line: z.enum(["row", "col"]), index: int, runs: z.array(int) }))
    .describe("nonogram clue numbers written beside rows / above columns; empty when you give a picture instead"),
  picture: z.object({
    rows: z.array(z.string()).describe("one string per row, one letter per cell; '.' is empty"),
    palette: z.array(z.object({ letter: z.string(), color: z.string().describe("a CSS hex color") })),
  }).nullable().describe("nonogram only, when the drawing shows the shaded picture"),
  sure: z.boolean().describe("true only if you could read the grid and every clue clearly"),
  notes: z.array(z.string()).describe("anything you weren't sure of, with its row and column, for the creator to check; empty if everything was clear"),
});
export type Reading = z.infer<typeof Reading>;

const SYSTEM = `You transcribe hand-drawn logic puzzles, mostly drawn by a kid on paper, into an exact
description that a puzzle engine can play. Read the drawing carefully: the grid, then every clue.

Coordinates: rows count from 0 at the top, columns from 0 at the left. "rows" and "cols" are the
number of cells. Count grid cells, not lines.

The game type may be written at the top of the sketch (e.g. "river", "Round the Bend",
"slitherlink", "panes: size 4, twins"). Otherwise work it out from what's drawn:

- river (Round the Bend): draw one loop through every open cell. Shaded / crossed-out cells are rocks:
  {kind: "block"}. Thick lines between two cells are walls the loop can't cross: {kind: "wall",
  cell, other}.
- slitherlink: numbers in cells count how many of the cell's four sides the loop uses:
  {kind: "number", value}.
- nurikabe: numbered cells are islands of that size: {kind: "number", value}.
- nonogram (Picture Squares): numbers beside each row and above each column. If the drawing shows the
  shaded picture, give it as "picture" (one letter per cell, "." for empty, a color per letter, e.g.
  the colors drawn, or a dark ink color for plain shading), and check it against the numbers; note any
  row or column where they disagree. If there's no picture, give the numbers as "runs".
- sudoku: the printed digits: {kind: "number", value}. The grid is 4x4, 6x6 or 9x9.
- panes: split the grid into regions. Rules are written on the sketch; list each one:
  size N (every region has N cells), size-clue (a numbered cell's region has that many cells),
  one-each (every region holds exactly one number or symbol), twins (the two regions on either side of
  a filled diamond ◆ have the same shape), opposites (an empty diamond ◇: different shapes),
  all-different (no two regions share a shape), compass (a compass clue counts its region's cells to
  the north, east, south and west). Clues: diamonds sit on the border between two cells
  ({kind: "twins" | "opposites", cell, other}); numbers, symbols and compasses sit in cells.

Only transcribe what the player starts with. If the drawing also shows the solution (a loop drawn
through the cells, filled-in digits, shaded answer cells in a nurikabe), use it to help you read the
grid, but leave it out. Never invent clues to make the puzzle work: transcribe what's drawn, and put
anything smudged, ambiguous or seemingly wrong in "notes" (say which row and column) so the creator can
confirm it.

These are kids' drawings: wobbly lines, uneven cells, scribbled shading, slightly blurry photos
are normal. Always give your best reading of a puzzle drawing, even a messy one, and set "sure" to
false if any part of it is a guess. Set "readable" to false only when the image isn't a puzzle
drawing at all (then say why in "problem").`;

/** Two readers: a quick one for the first look, and a careful one for drawings the quick one has
 *  trouble with (and for every re-read after the creator says what's wrong). */
const READERS = {
  quick: { model: "claude-sonnet-5-5", effort: "medium" },
  careful: { model: "claude-opus-5-5", effort: "high" },
} as const;
export type Reader = keyof typeof READERS;

/** Read a sketch photo. The quick reader goes first unless `careful`; if its reading looks shaky,
 *  the careful reader reads it again. `previous` + `feedback` ask for a corrected re-read. */
export async function readSketch(env: Env, image: { data: string; type: ImageType },
  options: { previous?: { sketch: string; feedback: string }; careful?: boolean } = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Invalid("Reading sketches needs an Anthropic API key (ANTHROPIC_API_KEY) on the server.");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  if (!options.careful && !options.previous) {
    const quick = await readWith(client, "quick", image, options.previous);
    const trouble = troubleWith(quick);
    if (!trouble.length) return { ...quick, reader: "quick" as Reader };
    console.log(`sketch reader: quick read had trouble (${trouble.join("; ")}${quick.reading.problem ? `: ${quick.reading.problem}` : ""}); reading carefully`);
  }
  const careful = await readWith(client, "careful", image, options.previous);
  if (!careful.reading.readable) throw new Invalid(careful.reading.problem ?? "That doesn't look like a puzzle Claude can read.");
  return { ...careful, reader: "careful" as Reader };
}

async function readWith(client: Anthropic, reader: Reader, image: { data: string; type: ImageType }, previous?: { sketch: string; feedback: string }) {
  const { model, effort } = READERS[reader];
  const ask = previous
    ? `You transcribed this sketch before as:\n\n${previous.sketch}\n\nThe creator compared it with their drawing and says:\n\n${previous.feedback}\n\nLook at the drawing again and give the corrected transcription.`
    : "Transcribe this puzzle sketch.";
  const started = Date.now();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(Reading) },
      // if the model declines, the API retries on another model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.type, data: image.data } },
          { type: "text", text: ask },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Invalid("The sketch reader is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new Invalid(`Claude couldn't take that image: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new Invalid(`Couldn't reach the sketch reader (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  console.log(`sketch reader: ${reader} (${model}, ${effort}) took ${((Date.now() - started) / 1000).toFixed(1)}s, ${response.usage.output_tokens} output tokens`);
  if (response.stop_reason === "refusal") throw new Invalid("Claude declined to read this image.");
  if (response.stop_reason === "max_tokens") throw new Invalid("The sketch was too much to read in one go. Try a closer photo of just the puzzle.");
  const reading = response.parsed_output;
  if (!reading) throw new Invalid("Claude's reading came back incomplete. Try again.");
  return { reading, sketch: reading.readable ? toSketch(reading) : "" };
}

/** Signs a reading is shaky enough to ask the careful reader: the reader wasn't sure, it isn't a
 *  playable puzzle, or a quick sanity check fails. */
function troubleWith({ reading, sketch }: { reading: Reading; sketch: string }): string[] {
  if (!reading.readable) return ["couldn't read it"];
  const out: string[] = [];
  if (!reading.sure) out.push("not sure of its reading");
  out.push(...sketchProblems(sketch));
  const rocks = reading.givens.filter((g) => g.kind === "block").length;
  if (reading.genre === "river" && (reading.rows * reading.cols - rocks) % 2) out.push("an odd number of open cells can't hold a loop");
  if (reading.genre === "sudoku" && (reading.rows !== reading.cols || ![4, 6, 9].includes(reading.rows))) out.push("not a 4x4, 6x6 or 9x9 sudoku");
  if (reading.genre === "nonogram" && reading.picture && (reading.picture.rows.length !== reading.rows || reading.picture.rows.some((r) => r.length !== reading.cols))) {
    out.push("the picture doesn't fill the grid");
  }
  return out;
}

/** A reading as sketch text: the genre line, then the puzzle as JSON. */
export function toSketch(r: Reading): string {
  const rc = (c: { row: number; col: number }): [number, number] => [c.row, c.col];
  const givens: Given[] = r.givens.flatMap((g): Given[] => {
    switch (g.kind) {
      case "number": return g.value === null ? [] : [{ at: "cell", cell: rc(g.cell), kind: "number", value: g.value }];
      case "block": return [{ at: "cell", cell: rc(g.cell), kind: "block" }];
      case "symbol": return g.symbol ? [{ at: "cell", cell: rc(g.cell), kind: "symbol", value: g.symbol }] : [];
      case "compass": {
        const v = Object.fromEntries(Object.entries(g.compass ?? {}).filter(([, n]) => n !== null)) as { n?: number; e?: number; s?: number; w?: number };
        return [{ at: "cell", cell: rc(g.cell), kind: "compass", value: v }];
      }
      default: return g.other ? [{ at: "border", cells: [rc(g.cell), rc(g.other)], kind: g.kind }] : [];
    }
  });
  for (const run of r.runs) givens.push({ at: run.line, index: run.index, kind: "runs", value: run.runs });
  const rules: RuleSpec[] = r.genre === "panes" ? r.rules.map((x) =>
    x.rule === "size" ? { rule: "size", is: x.value ?? undefined }
      : x.rule === "one-each" ? { rule: "one-each", of: x.of ?? "number" }
        : { rule: x.rule }) : [];
  const body: Omit<GridSpec, "genre"> = {
    size: [r.rows, r.cols],
    ...(rules.length ? { rules } : {}),
    ...(givens.length ? { givens } : {}),
    ...(r.genre === "nonogram" && r.picture && !r.runs.length
      ? { picture: { rows: r.picture.rows, palette: Object.fromEntries([[".", "#ffffff"], ...r.picture.palette.map((p) => [p.letter, p.color])]), ...(r.title ? { title: r.title } : {}) } }
      : {}),
  };
  return `${r.genre}\n${JSON.stringify(body, null, 1)}`;
}

/** Bytes to base64 without blowing the stack on big images. */
export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Does a reading parse as a playable puzzle? (Problems are shown to the creator to fix.) */
export const sketchProblems = (sketch: string) => {
  const p = parseSketch(sketch);
  return p.ok ? [] : p.errors;
};
