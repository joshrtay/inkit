// Numberlink's routes (deduce's technique "routes"): where each pair's line can still run. A pair's
// line is a simple path between its two numbers through cells no other pair holds, so it can use a
// cell only if some simple path between the numbers passes it: the cells of the blocks (biconnected
// parts) on the way from one number to the other in the block-cut tree. A cell where two of those
// blocks meet is one every path passes, so the pair holds it and no other pair can use it; with
// every cell used (cover), a cell only one pair can use is that pair's too. Repeated till nothing
// changes. Pure: deduce.ts reads the board into a RouteInput and turns the result into constraints.
//
// It sees the board as cells and the links not ruled out, ignoring which links are drawn (a drawn
// piece is just cells its pair holds), so what it finds holds for the real board too: a path on the
// board is a path in this graph, so every cell it can use and every cell it must pass is found.

export interface RouteInput {
  /** cells */
  n: number;
  /** the links still possible (not ruled out, between two open cells) */
  edges: [number, number][];
  /** each pair's two numbers */
  pairs: [number, number][];
  /** the pair holding each cell (its number, or a drawn piece joined to one), -1 none, -2 closed
   *  (a wall or rock: no line) */
  owner: Int32Array;
  /** every open cell is on some line */
  cover: boolean;
}

export interface RouteResult {
  /** per pair, the cells its line can use */
  use: Uint8Array[];
  /** per pair, the cells its line must pass (its numbers too) */
  must: Uint8Array[];
  /** the pair holding each cell, after what was found (-1 none, -2 closed) */
  owner: Int32Array;
  /** how the board can't be finished, if it can't */
  contradiction?: string;
}

/** The cells a path from s to t can use and must pass, in the graph of cells `open` allows. */
export function pathCells(n: number, adj: number[][], open: (c: number) => boolean, s: number, t: number): { use: Uint8Array; must: Uint8Array } | null {
  // biconnected blocks from s (Tarjan, with a stack of edges), iteratively
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), blocks: number[][] = [];
  const edgeStack: [number, number][] = [];
  let time = 0;
  disc[s] = low[s] = time++;
  const frames: [number, number, number][] = [[s, -1, 0]];   // cell, parent, next neighbour index
  while (frames.length) {
    const f = frames[frames.length - 1], [c, parent] = f;
    if (f[2] < adj[c].length) {
      const d = adj[c][f[2]++];
      if (d === parent || !open(d)) continue;
      if (disc[d] < 0) { edgeStack.push([c, d]); disc[d] = low[d] = time++; frames.push([d, c, 0]); }
      else if (disc[d] < disc[c]) { edgeStack.push([c, d]); low[c] = Math.min(low[c], disc[d]); }
      continue;
    }
    frames.pop();
    if (!frames.length) break;
    const up = frames[frames.length - 1][0];
    low[up] = Math.min(low[up], low[c]);
    if (low[c] >= disc[up]) {
      // up separates c's side: the edges down to (up, c) are one block
      const cells = new Set<number>();
      for (;;) { const [a, b] = edgeStack.pop()!; cells.add(a); cells.add(b); if (a === up && b === c) break; }
      blocks.push([...cells]);
    }
  }
  if (disc[t] < 0) return null;
  // the block-cut tree as cells joined to their blocks: the way from s to t in it
  const blocksOf: number[][] = Array.from({ length: n }, () => []);
  blocks.forEach((b, k) => { for (const c of b) blocksOf[c].push(k); });
  const B = blocks.length, prev = new Int32Array(n + B).fill(-2);   // nodes: cells 0..n-1, blocks n..
  prev[s] = -1;
  const queue = [s];
  for (let q = 0; q < queue.length && prev[t] === -2; q++) {
    const x = queue[q];
    const next = x < n ? blocksOf[x].map((k) => n + k) : blocks[x - n];
    for (const y of next) if (prev[y] === -2) { prev[y] = x; queue.push(y); }
  }
  const use = new Uint8Array(n), must = new Uint8Array(n);
  for (let x = t; x !== -1; x = prev[x]) {
    if (x < n) must[x] = 1;
    else for (const c of blocks[x - n]) use[c] = 1;
  }
  return { use, must };
}

export function routes(inp: RouteInput): RouteResult {
  const { n, edges, pairs, cover } = inp, owner = inp.owner.slice();
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  let use: Uint8Array[] = [], must: Uint8Array[] = [];
  for (;;) {
    use = []; must = [];
    for (let k = 0; k < pairs.length; k++) {
      const [s, t] = pairs[k];
      const r = pathCells(n, adj, (c) => owner[c] === -1 || owner[c] === k, s, t);
      if (!r) return { use, must, owner, contradiction: `pair ${k + 1} can't be joined` };
      use.push(r.use); must.push(r.must);
    }
    let changed = false;
    for (let k = 0; k < pairs.length; k++) for (let c = 0; c < n; c++) {
      if (!must[k][c] || owner[c] === k) continue;
      if (owner[c] !== -1) return { use, must, owner, contradiction: `two pairs must pass cell ${c}` };
      owner[c] = k; changed = true;
    }
    if (cover) for (let c = 0; c < n; c++) {
      if (owner[c] !== -1) continue;
      const users = [];
      for (let k = 0; k < pairs.length; k++) if (use[k][c]) users.push(k);
      if (!users.length) return { use, must, owner, contradiction: `no pair can reach cell ${c}` };
      if (users.length === 1) { owner[c] = users[0]; changed = true; }
    }
    if (!changed) return { use, must, owner };
  }
}
