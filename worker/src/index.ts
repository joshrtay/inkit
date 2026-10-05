// Wyatt's Games API (Cloudflare Worker + R2).
//
//   POST /login     { username, pin }        -> { token, username, created }
//   GET  /progress  Authorization: Bearer t  -> { completed: string[], saves: Record<string, Save> }
//   PUT  /progress  Authorization: Bearer t  { completed?, saves? } -> merged progress
//
// One R2 object per player: users/<username>.json. Deliberately light security:
// a 4-digit PIN, stored as a salted hash, with a lockout after repeated wrong guesses.

interface Env {
  SAVES: R2Bucket;
  TOKEN_SECRET: string;
  ALLOWED_ORIGINS: string;
}

interface Save { state: unknown; at: number }
interface User {
  username: string;
  salt: string;
  pinHash: string;
  createdAt: number;
  failed: number;
  lockedUntil: number;
  completed: string[];
  saves: Record<string, Save>;
}

const NAME = /^[a-z0-9_-]{3,20}$/;
const PIN = /^\d{4}$/;
const MAX_FAILED = 10;
const LOCK_MS = 15 * 60 * 1000;
const TOKEN_DAYS = 365;
const MAX_BODY = 512 * 1024;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

/** token = "<username>.<expires ms>.<hmac>" */
async function makeToken(env: Env, username: string) {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  return `${username}.${exp}.${await hmac(env.TOKEN_SECRET, `${username}.${exp}`)}`;
}
async function readToken(env: Env, req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [username, exp, sig] = token.split(".");
  if (!username || !exp || !sig || Number(exp) < Date.now()) return null;
  return sig === (await hmac(env.TOKEN_SECRET, `${username}.${exp}`)) ? username : null;
}

const userKey = (name: string) => `users/${name}.json`;
async function loadUser(env: Env, name: string): Promise<User | null> {
  const obj = await env.SAVES.get(userKey(name));
  return obj ? ((await obj.json()) as User) : null;
}
const storeUser = (env: Env, user: User) => env.SAVES.put(userKey(user.username), JSON.stringify(user));

/** Union of completed games; for each save keep the most recent. */
function merge(user: User, body: { completed?: unknown; saves?: unknown }) {
  if (Array.isArray(body.completed)) {
    const all = new Set(user.completed);
    for (const id of body.completed) if (typeof id === "string" && id.length < 100) all.add(id);
    user.completed = [...all];
  }
  if (body.saves && typeof body.saves === "object") {
    for (const [id, save] of Object.entries(body.saves as Record<string, Save>)) {
      if (id.length > 100 || !save || typeof save.at !== "number") continue;
      if (!user.saves[id] || save.at >= user.saves[id].at) user.saves[id] = { state: save.state, at: save.at };
    }
  }
}

function cors(env: Env, req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(env, req);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
    const fail = (status: number, error: string) => json({ error }, status);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const { pathname } = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST" || req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX_BODY) return fail(413, "That save is too large.");
      try { body = text ? JSON.parse(text) : {}; } catch { return fail(400, "Bad request."); }
    }

    if (pathname === "/login" && req.method === "POST") {
      const username = String(body.username ?? "").trim().toLowerCase();
      const pin = String(body.pin ?? "");
      if (!NAME.test(username)) return fail(400, "Names are 3 to 20 letters, numbers, - or _.");
      if (!PIN.test(pin)) return fail(400, "The PIN is 4 digits.");
      let user = await loadUser(env, username);
      let created = false;
      if (!user) {
        const salt = crypto.randomUUID();
        user = { username, salt, pinHash: await sha256(`${salt}:${pin}`), createdAt: Date.now(),
                 failed: 0, lockedUntil: 0, completed: [], saves: {} };
        created = true;
      } else {
        if (user.lockedUntil > Date.now()) {
          const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
          return fail(429, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
        }
        if ((await sha256(`${user.salt}:${pin}`)) !== user.pinHash) {
          user.failed += 1;
          if (user.failed >= MAX_FAILED) { user.failed = 0; user.lockedUntil = Date.now() + LOCK_MS; }
          await storeUser(env, user);
          return fail(401, "That PIN doesn't match this name.");
        }
        user.failed = 0;
      }
      await storeUser(env, user);
      return json({ token: await makeToken(env, username), username, created });
    }

    if (pathname === "/progress" && (req.method === "GET" || req.method === "PUT")) {
      const username = await readToken(env, req);
      if (!username) return fail(401, "Please log in again.");
      const user = await loadUser(env, username);
      if (!user) return fail(401, "Please log in again.");
      if (req.method === "PUT") {
        merge(user, body);
        await storeUser(env, user);
      }
      return json({ completed: user.completed, saves: user.saves });
    }

    return fail(404, "Not found.");
  },
};
