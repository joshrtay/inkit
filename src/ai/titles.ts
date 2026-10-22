// Whether two of an AI creator's titles are too alike to post both (puzzles/ai/backfill.ts asks
// Claude again when they are). Pure; unit-tested in tests/unit/ai-backfill.test.ts.

const SMALL = new Set(["the", "a", "an", "of", "and", "in", "on", "at", "to", "for", "with", "by", "is", "no"]);

/** A title's words, lower case, without punctuation or the small words. */
export const titleWords = (t: string) =>
  t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !SMALL.has(w));

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Too alike: the same words (in any order, small words aside), most of the same words, or the
 *  same text but for a letter or two ("The Quay of Stars" and "The Quays of Stars"). */
export function nearDuplicateTitle(a: string, b: string) {
  const x = titleWords(a), y = titleWords(b);
  if (!x.length || !y.length) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const sx = new Set(x), sy = new Set(y);
  const shared = [...sx].filter((w) => sy.has(w)).length, union = new Set([...sx, ...sy]).size;
  if (shared === union) return true;
  if (union >= 3 && shared / union >= 0.6) return true;
  const jx = x.join(" "), jy = y.join(" ");
  return 1 - editDistance(jx, jy) / Math.max(jx.length, jy.length) >= 0.85;
}

/** The first of `titles` too like `title`, if any. */
export const clashingTitle = (title: string, titles: Iterable<string>) => {
  for (const t of titles) if (nearDuplicateTitle(title, t)) return t;
  return undefined;
};
