// Which units does a person's move rely on? At each stuck moment from janko-stuck.ts, for the
// person's next moves (and our solver's searched fact), the smallest set of units (rows, columns,
// areas) whose rules alone force the cell, given what was known, with no-touch always on. The
// shapes of those sets are the reasoning people used where our windows saw nothing: the window
// families to add.
//
//   node puzzles/difficulty/janko-explain.ts
import { readFileSync, writeFileSync } from "node:fs";
import { clingoRaw, loadClingo } from "./clingo.ts";

const repo = new URL("../../", import.meta.url).pathname;
type Stuck = { f: string; n: number; stars: number; areas: string[]; known: [number, number][]; searched: { cell: number; star: boolean }[]; humanNext: { cell: number; star: boolean }[] };
const stuck = JSON.parse(readFileSync(`${repo}references/janko/stuck-star-battle.json`, "utf8")) as Stuck[];
await loadClingo();

/** The smallest unit set forcing `cell` to `star`, trying sets of 1, 2, 3 units: their names, or null. */
function minimalUnits(p: Stuck, cell: number, star: boolean): string[] | null {
  const { n, stars: k } = p;
  const units: { name: string; cells: number[] }[] = [];
  for (let r = 0; r < n; r++) units.push({ name: `row ${r + 1}`, cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ name: `column ${c + 1}`, cells: Array.from({ length: n }, (_, r) => r * n + c) });
  for (const a of [...new Set(p.areas.join(""))].sort()) units.push({ name: `area ${a}`, cells: [...p.areas.join("")].flatMap((x, i) => (x === a ? [i] : [])) });
  const lines = [`cell(0..${n * n - 1}).`, `{ s(I) } :- cell(I).`];
  units.forEach((u, k2) => { lines.push(`unit(${k2}).`); for (const i of u.cells) lines.push(`in(${k2},${i}).`); });
  lines.push(`#external on(U) : unit(U).`, `:- on(U), #count{I: in(U,I), s(I)} != ${k}.`);
  for (let i = 0; i < n * n; i++) for (const j of [i + 1, i + n - 1, i + n, i + n + 1]) {
    const [r1, c1, r2, c2] = [Math.floor(i / n), i % n, Math.floor(j / n), j % n];
    if (j < n * n && Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && j !== i) lines.push(`:- s(${i}), s(${j}).`);
  }
  for (const [c, v] of p.known) lines.push(v ? `s(${c}).` : `:- s(${c}).`);
  // the opposite of the move: if it can't hold with these units on, the units force the move
  lines.push(star ? `:- s(${cell}).` : `s(${cell}).`);
  const U = units.length;
  const lua = `#script (lua)
function main(prg)
  prg:ground({{"base", {}}})
  local U = ${U}
  local function try(set)
    for u = 0, U - 1 do prg:assign_external(clingo.Function("on", {u}), set[u] == true) end
    return prg:solve().unsatisfiable
  end
  for a = 0, U - 1 do if try({[a] = true}) then print("F " .. a) return end end
  for a = 0, U - 1 do for b = a + 1, U - 1 do if try({[a] = true, [b] = true}) then print("F " .. a .. " " .. b) return end end end
  for a = 0, U - 1 do for b = a + 1, U - 1 do for c = b + 1, U - 1 do
    if try({[a] = true, [b] = true, [c] = true}) then print("F " .. a .. " " .. b .. " " .. c) return end
  end end end
  print("N")
end
#end.
`;
  const { lines: out } = clingoRaw(lua + lines.join("\n"), "");
  const hit = out.find((l) => l.startsWith("F ") || l === "N");
  if (!hit || hit === "N") return null;
  return hit.slice(2).split(" ").map((x) => units[Number(x)].name);
}

const shape = (names: string[] | null) => (names ? names.map((x) => x.split(" ")[0]).sort().join(" + ") : "4 or more units");
const results: { f: string; who: string; units: string[] | null }[] = [];
for (const p of stuck) {
  for (const h of p.humanNext) results.push({ f: p.f, who: "person", units: minimalUnits(p, h.cell, h.star) });
  for (const s of p.searched.slice(0, 1)) results.push({ f: p.f, who: "our search", units: minimalUnits(p, s.cell, s.star) });
}
writeFileSync(`${repo}references/janko/explain-star-battle.json`, JSON.stringify(results, null, 1));
for (const who of ["person", "our search"]) {
  const rs = results.filter((r) => r.who === who), counts = new Map<string, number>();
  for (const r of rs) counts.set(shape(r.units), (counts.get(shape(r.units)) ?? 0) + 1);
  console.log(`\n${who === "person" ? "The person's next moves" : "Our searched facts"} (${rs.length}): the smallest unit sets that force them`);
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
}
