// Several solves at once, for batch runs: each solve is its own process (deduce-guarded.ts), so a
// batch can use the machine's cores. DEDUCE_JOBS sets how many at a time; the default, half the
// cores, keeps each solve near full speed, so a wall-clock budget means what it does alone (with
// every core busy, a solve near its budget can run out of time).
import { cpus } from "node:os";

export const JOBS = Math.max(1, Number(process.env.DEDUCE_JOBS) || Math.floor(cpus().length / 2));

/** f over items, at most `jobs` at a time; results in the items' order. */
export async function mapPool<T, R>(items: T[], f: (item: T, index: number) => Promise<R>, jobs = JOBS): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await f(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  return out;
}
