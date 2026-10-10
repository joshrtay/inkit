// Reading and writing aspif, clingo's ground program format (Gebser et al., "Theory solving made
// easy with clingo 5", appendix). Only what the engine's encodings produce: rules (normal and
// choice heads, normal and weight bodies), outputs and externals. Atoms are positive integers,
// literals signed atoms.

export interface Rule {
  choice: boolean;
  head: number[];
  /** null: a normal body (all literals hold); a number: a weight body (the weights of the
   *  literals that hold add up to at least this) */
  bound: number | null;
  body: number[];
  weights: number[];
  /** the engine rule block it came from (index into the puzzle's rules), or -1 */
  block: number;
}

export interface Ground {
  rules: Rule[];
  /** shown atoms: name -> literal (0 = always true) */
  outputs: Map<string, number>;
  externals: number[];
  maxAtom: number;
}

export function parseAspif(text: string): Ground {
  const lines = text.split("\n");
  if (!lines[0]?.startsWith("asp ")) throw new Error("not aspif");
  const rules: Rule[] = [], outputs = new Map<string, number>(), externals: number[] = [];
  let maxAtom = 0;
  const seen = (a: number) => { const x = Math.abs(a); if (x > maxAtom) maxAtom = x; };
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    if (!line || line === "0") continue;
    const t = line.split(" ");
    const kind = t[0];
    if (kind === "1") {
      let i = 1;
      const choice = t[i++] === "1", h = +t[i++];
      const head = t.slice(i, i + h).map(Number); i += h;
      const bt = t[i++];
      let bound: number | null = null, body: number[] = [], weights: number[] = [];
      if (bt === "0") { const n = +t[i++]; body = t.slice(i, i + n).map(Number); }
      else { bound = +t[i++]; const n = +t[i++]; for (let j = 0; j < n; j++) { body.push(+t[i + 2 * j]); weights.push(+t[i + 2 * j + 1]); } }
      head.forEach(seen); body.forEach(seen);
      rules.push({ choice, head, bound, body, weights, block: -1 });
    } else if (kind === "4") {
      // 4 m s n l1..ln: the name is m characters and may hold spaces
      const m = +t[1], rest = line.slice(2 + t[1].length + 1);
      const name = rest.slice(0, m), after = rest.slice(m + 1).split(" ").map(Number);
      const n = after[0];
      if (n === 0) outputs.set(name, 0);
      else if (n === 1) outputs.set(name, after[1]);
      // conditions of several literals: not produced by the engine's #show statements
    } else if (kind === "5") { externals.push(+t[1]); seen(+t[1]); }
    else if (kind === "10") continue;
    else throw new Error(`aspif statement ${kind} isn't supported`);
  }
  return { rules, outputs, externals, maxAtom };
}

/** One rule as an aspif line, with atoms renamed by `map`. */
export function ruleLine(r: Rule, map: (a: number) => number): string {
  const lit = (l: number) => (l < 0 ? -map(-l) : map(l));
  const head = `1 ${r.choice ? 1 : 0} ${r.head.length}${r.head.map((a) => ` ${map(a)}`).join("")}`;
  if (r.bound === null) return `${head} 0 ${r.body.length}${r.body.map((l) => ` ${lit(l)}`).join("")}`;
  return `${head} 1 ${r.bound} ${r.body.length}${r.body.map((l, j) => ` ${lit(l)} ${r.weights[j]}`).join("")}`;
}

export const outputLine = (name: string, lit: number) => `4 ${name.length} ${name} 1 ${lit}`;
