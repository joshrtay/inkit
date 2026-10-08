// Checking a scheduled post sent by the weekly batch (POST /admin/ai/schedule): who it's for, the
// puzzle, its words, when it goes up, and the batch's proof that it has one solution (the Worker
// can't run clingo, so the batch proves it and the proof is bound to this exact sketch by its
// hash). Pure, so it's unit-tested (tests/unit/ai-schedule.test.ts).
import { z } from "zod";
import { parseSketch } from "../games/sketch";
import { personaByHandle, type Persona } from "./personas.ts";

export const ScheduleRequest = z.object({
  persona: z.string(),
  sketch: z.string().min(1).max(200_000),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  /** ISO time */
  publishAt: z.string(),
  proof: z.object({ solutions: z.number().int().min(0), sketchHash: z.string(), solver: z.string() }),
  /** what the batch knows about it (difficulty, scores, tokens): logged, not stored */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduleRequest = z.infer<typeof ScheduleRequest>;

export async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** How far ahead a post may be scheduled, and how late one may arrive (it then goes up at once). */
const AHEAD = 21 * 86400e3, LATE = 3600e3;

export type Checked =
  | { ok: true; persona: Persona; kind: string; publishAt: Date; req: ScheduleRequest }
  | { ok: false; status: number; error: string };

export async function checkScheduleRequest(body: unknown, now: Date): Promise<Checked> {
  const parsed = ScheduleRequest.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const req = parsed.data;
  const persona = personaByHandle(req.persona);
  if (!persona) return { ok: false, status: 404, error: `"${req.persona}" isn't an AI creator (app/app/ai/personas.ts).` };
  const publishAt = new Date(req.publishAt);
  if (Number.isNaN(publishAt.getTime())) return { ok: false, status: 400, error: "publishAt isn't a time." };
  if (publishAt.getTime() < now.getTime() - LATE) return { ok: false, status: 400, error: "publishAt is in the past." };
  if (publishAt.getTime() > now.getTime() + AHEAD) return { ok: false, status: 400, error: "publishAt is more than three weeks away." };
  const sketch = req.sketch.replace(/\r\n/g, "\n");
  const p = parseSketch(sketch);
  if (!p.ok) return { ok: false, status: 400, error: `The sketch doesn't parse: ${p.errors.join(" ")}` };
  if (!persona.genres.some((g) => g.genre === p.kind)) return { ok: false, status: 400, error: `${persona.name} doesn't make ${p.kind} puzzles.` };
  if (req.proof.sketchHash !== (await sha256(sketch))) return { ok: false, status: 400, error: "The proof is for a different sketch." };
  // a panel needs a line; every other puzzle exactly one solution
  const proved = p.kind === "panel" ? req.proof.solutions >= 1 : req.proof.solutions === 1;
  if (!proved) return { ok: false, status: 400, error: `The proof found ${req.proof.solutions} solutions; it needs exactly one.` };
  return { ok: true, persona, kind: p.kind, publishAt, req: { ...req, sketch } };
}
