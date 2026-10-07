// Pull the evaluation set from the live site: every read whose puzzle was published (the photo,
// and the puzzle its creator settled on), into eval/data/ (git-ignored: these are people's
// drawings, and the repo is public).
//
//   npx vite-node --config vitest.config.ts eval/pull.ts [--site https://inkit.games]
//
// Needs the admin API token: ADMIN_API_TOKEN in .dev.vars (the production one, for the live site).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { flag, readVars } from "./util";

const site = flag("--site") ?? "https://inkit.games";
const token = readVars().ADMIN_API_TOKEN;
if (!token) throw new Error("Put the admin API token in .dev.vars as ADMIN_API_TOKEN.");
const headers = { authorization: `Bearer ${token}` };

const res = await fetch(`${site}/admin/reads.jsonl`, { headers });
if (!res.ok) throw new Error(`${site}/admin/reads.jsonl: ${res.status}`);
const reads = (await res.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const published = reads.filter((r) => r.publishedSketch && r.photo);

mkdirSync("eval/data/photos", { recursive: true });
const known = new Set(readLines("eval/data/cases.jsonl").map((c) => c.id));
let added = 0;
for (const r of published) {
  if (known.has(r.id)) continue;
  const photo = await fetch(r.photo, { headers });
  if (!photo.ok) { console.warn(`skipped ${r.id}: photo ${photo.status}`); continue; }
  const ext = (photo.headers.get("content-type") ?? "image/jpeg").split("/")[1];
  const path = `eval/data/photos/${r.id}.${ext}`;
  writeFileSync(path, Buffer.from(await photo.arrayBuffer()));
  // the case: the photo, and the puzzle it should be read as (what its creator published)
  const line = { id: r.id, photo: path, expected: r.publishedSketch, kind: r.puzzleKind, source: `${site} read ${r.id}`, firstRead: { model: r.model, diff: r.diff } };
  writeFileSync("eval/data/cases.jsonl", JSON.stringify(line) + "\n", { flag: "a" });
  added++;
}
console.log(`${reads.length} reads on ${site}, ${published.length} published; added ${added} new cases to eval/data/cases.jsonl.`);

function readLines(path: string) {
  try { return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
