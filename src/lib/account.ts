// Player accounts (username + 4-digit PIN) and cloud saves via the API in worker/.
// Progress always lives in localStorage first; when logged in it is also pushed to the
// player's account, and logging in merges the account's progress into this browser.
import { completed } from "./progress";

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? "https://api.wyattsgames.com";
const ACCOUNT = "wyattsgames:account";
const STAMPS = "wyattsgames:saved-at";   // { "<host id>": ms } when each local save was made
const COMPLETED = "wyattsgames:completed";

export interface Account { username: string; token: string }
interface Save { state: unknown; at: number }
interface Progress { completed: string[]; saves: Record<string, Save> }

const read = <T>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
};

export const account = () => read<Account | null>(ACCOUNT, null);
const changed = () => document.dispatchEvent(new CustomEvent("account:change", { detail: account() }));

async function call(path: string, init: RequestInit = {}, token?: string): Promise<Progress & Partial<Account & { created: boolean }>> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({ error: "The save server sent a bad reply." }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: res.status });
  return data;
}

/** Everything this browser has: completed games plus every game save with its time. */
function localProgress(): Progress {
  const stamps = read<Record<string, number>>(STAMPS, {});
  const saves: Record<string, Save> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith("game:")) continue;
    const id = key.slice(5);
    saves[id] = { state: read(key, null), at: stamps[id] ?? 0 };
  }
  return { completed: [...completed()], saves };
}

/** Bring the account's progress into this browser. Returns true if anything changed here. */
function applyRemote(remote: Progress) {
  let dirty = false;
  const done = completed();
  for (const id of remote.completed) if (!done.has(id)) { done.add(id); dirty = true; }
  write(COMPLETED, [...done]);
  const stamps = read<Record<string, number>>(STAMPS, {});
  for (const [id, save] of Object.entries(remote.saves)) {
    if ((stamps[id] ?? -1) < save.at) {
      write(`game:${id}`, save.state);
      stamps[id] = save.at;
      dirty = true;
    }
  }
  write(STAMPS, stamps);
  return dirty;
}

/** Log in (or create the account if the name is new), then merge progress both ways. */
export async function login(username: string, pin: string) {
  const res = await call("/login", { method: "POST", body: JSON.stringify({ username, pin }) });
  const acct = { username: res.username!, token: res.token! };
  write(ACCOUNT, acct);
  const merged = await call("/progress", { method: "PUT", body: JSON.stringify(localProgress()) }, acct.token);
  const dirty = applyRemote(merged);
  changed();
  return { account: acct, created: !!res.created, dirty };
}

export function logout() {
  try { localStorage.removeItem(ACCOUNT); } catch { /* ignore */ }
  changed();
}

/** Record when a game save was made, and send it up shortly (if logged in). */
export function noteSave(id: string) {
  const stamps = read<Record<string, number>>(STAMPS, {});
  stamps[id] = Date.now();
  write(STAMPS, stamps);
  pushSoon();
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function pushSoon() {
  const acct = account();
  if (!acct) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    call("/progress", { method: "PUT", body: JSON.stringify(localProgress()) }, acct.token)
      .catch((err: Error & { status?: number }) => { if (err.status === 401) logout(); });
  }, 800);
}

/** On page load: pull the account's progress. Returns true if this browser changed. */
export async function pull() {
  const acct = account();
  if (!acct) return false;
  try {
    return applyRemote(await call("/progress", {}, acct.token));
  } catch (err) {
    if ((err as { status?: number }).status === 401) logout();
    return false;
  }
}
