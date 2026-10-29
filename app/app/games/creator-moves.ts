// The order a creator made their moves in, on the publish page, where they solve a puzzle the
// hint solver can't finish alone (app/games/hint-solve.client.ts). Every board the player reports
// is compared with the one before; a mark counts from the last time it was set to the value it ends
// with, so a wrong guess fixed later counts where it was fixed.
import { LAYERS, type BoardLike, type KeyMark } from "~site/lib/hint-ladder";

export interface MoveOrder { prev: BoardLike | null; last: Map<string, number>; t: number }
export const noMoves = (): MoveOrder => ({ prev: null, last: new Map(), t: 0 });

/** Note a board: each mark that changed since the last one is stamped now. */
export function noteBoard(o: MoveOrder, board: BoardLike | null): MoveOrder {
  const last = new Map(o.last);
  let t = o.t;
  if (board) for (const layer of LAYERS) {
    const now = board[layer], was = o.prev?.[layer];
    const n = Math.max(now?.length ?? 0, was?.length ?? 0);
    for (let i = 0; i < n; i++) if ((now?.[i] ?? 0) !== (was?.[i] ?? 0)) last.set(`${layer}:${i}`, t++);
  }
  return { prev: board, last, t };
}

/** The finished board's marks, in the order the creator made them (a mark never seen change, as
 *  on a board loaded already marked, comes first). */
export function creatorMarks(o: MoveOrder, board: BoardLike | null): KeyMark[] {
  if (!board) return [];
  const out: [KeyMark, number][] = [];
  for (const layer of LAYERS) {
    const v = board[layer];
    if (v) for (let i = 0; i < v.length; i++) if (v[i]) out.push([[layer, i, v[i]], o.last.get(`${layer}:${i}`) ?? -1]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(([m]) => m);
}
