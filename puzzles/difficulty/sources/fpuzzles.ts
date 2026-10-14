// f-puzzles links (f-puzzles.com/?load=…) read offline: the puzzle is in the link itself, as
// lz-string's compressToBase64 of the puzzle's JSON. Only classic, irregular and thermo sudokus are
// read; any other constraint means a variant we don't have (null).
//
// decompressFromBase64 follows lz-string (MIT, (c) 2013 Pieroxy, github.com/pieroxy/lz-string).

const KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export function decompressFromBase64(input: string): string | null {
  if (!input) return "";
  const val = (i: number) => KEY.indexOf(input.charAt(i));
  const reset = 32;
  const dictionary: string[] = [];
  let enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", w: string, c: string | number;
  const result: string[] = [];
  const data = { val: val(0), position: reset, index: 1 };
  const bits = (n: number) => {
    let b = 0, power = 1;
    const max = 2 ** n;
    while (power !== max) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = reset; data.val = val(data.index++); }
      b |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return b;
  };
  for (let i = 0; i < 3; i++) dictionary[i] = String(i);
  switch (bits(2)) {
    case 0: c = String.fromCharCode(bits(8)); break;
    case 1: c = String.fromCharCode(bits(16)); break;
    case 2: return "";
    default: return null;
  }
  dictionary[3] = c;
  w = c;
  result.push(c);
  for (;;) {
    if (data.index > input.length) return "";
    let cc = bits(numBits);
    switch (cc) {
      case 0: dictionary[dictSize++] = String.fromCharCode(bits(8)); cc = dictSize - 1; enlargeIn--; break;
      case 1: dictionary[dictSize++] = String.fromCharCode(bits(16)); cc = dictSize - 1; enlargeIn--; break;
      case 2: return result.join("");
    }
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    if (dictionary[cc]) entry = dictionary[cc];
    else if (cc === dictSize) entry = w + w.charAt(0);
    else return null;
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
  }
}

type RC = [number, number];
type Given = { at: "cell"; cell: RC; kind: "number"; value: number } | { at: "cells"; cells: RC[]; kind: "thermo" };
export interface SudokuSpec { genre: "sudoku" | "irregular-sudoku" | "thermo-sudoku"; size: [number, number]; givens?: Given[]; areas?: string[] }

const BOXES: Record<number, [number, number]> = { 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3] };
const IGNORED = new Set(["size", "grid", "title", "author", "ruleset", "solution", "successMessage", "thermometer", "highlightConflicts", "disabledlogic", "truecandidatesoptions", "text", "line", "rectangle", "circle", "cage"]);

/** The f-puzzles link's puzzle, if it's one of our sudokus (null otherwise). */
export function readFpuzzles(link: string): SudokuSpec | { unsupported: string } | null {
  const m = link.match(/[?&]load=([^&#]+)/);
  if (!m) return null;
  let json: any;
  try { json = JSON.parse(decompressFromBase64(decodeURIComponent(m[1]).replace(/ /g, "+")) ?? ""); } catch { return null; }
  if (!json || !Array.isArray(json.grid)) return null;
  const n = Number(json.size);
  if (!BOXES[n] || json.grid.length !== n) return { unsupported: `size ${n}` };
  const extra = Object.keys(json).filter((k) => !IGNORED.has(k) && !(Array.isArray(json[k]) && json[k].length === 0) && json[k] !== false);
  // cosmetic lines, text, cages and circles would usually carry rules; refuse when present
  for (const k of ["text", "line", "rectangle", "circle", "cage"]) if (Array.isArray(json[k]) && json[k].length) extra.push(k);
  if (extra.length) return { unsupported: extra.join(",") };
  const givens: Given[] = [];
  const [bh, bw] = BOXES[n];
  let irregular = false;
  const areas: string[] = [];
  for (let r = 0; r < n; r++) {
    let line = "";
    for (let c = 0; c < n; c++) {
      const cell = json.grid[r][c] ?? {};
      if (cell.given && cell.value) givens.push({ at: "cell", cell: [r, c], kind: "number", value: Number(cell.value) });
      const std = Math.floor(r / bh) * (n / bw) + Math.floor(c / bw);
      const region = cell.region ?? std;
      if (region !== std) irregular = true;
      line += String.fromCharCode(97 + Number(region));
    }
    areas.push(line);
  }
  const thermos: Given[] = [];
  for (const t of json.thermometer ?? []) for (const ln of t.lines ?? []) {
    const cells = ln.map((s: string) => { const q = s.match(/R(\d+)C(\d+)/); return q ? [Number(q[1]) - 1, Number(q[2]) - 1] as RC : null; });
    if (cells.some((x: RC | null) => !x) || cells.length < 2) return { unsupported: "thermo" };
    thermos.push({ at: "cells", cells, kind: "thermo" });
  }
  if (thermos.length && irregular) return { unsupported: "irregular thermo" };
  if (thermos.length) return { genre: "thermo-sudoku", size: [n, n], givens: [...givens, ...thermos] };
  if (irregular) return { genre: "irregular-sudoku", size: [n, n], areas, givens };
  return { genre: "sudoku", size: [n, n], givens };
}
