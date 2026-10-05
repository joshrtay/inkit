// Which games this player has finished (this browser only). Ids are "<type path>/<n>",
// e.g. "number-line-maze/2". Game pages mark a game when it fires "game:solved".
const KEY = "wyattsgames:completed";

export function completed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function isComplete(id: string) {
  return completed().has(id);
}

export function markComplete(id: string) {
  const all = completed();
  all.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...all])); } catch { /* play without saving */ }
  void import("./account").then((a) => a.pushSoon());   // send to the account, if logged in
}

/** How many of the given ids are complete. */
export const countComplete = (ids: string[]) => {
  const all = completed();
  return ids.filter((id) => all.has(id)).length;
};
