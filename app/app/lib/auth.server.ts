// Sign-in for creators: email + password, and Google when its keys are set.
// Better Auth stores people in the `creators` table (plus sessions, accounts, verifications).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { HANDLE_HINT, isReserved, isValidHandle, newId, slugTaken } from "./names.server";
import { resetEmail, sendEmail } from "./email.server";

export function createAuth(env: Env) {
  const db = getDb(env);
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {};

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user: schema.creators, session: schema.sessions, account: schema.accounts, verification: schema.verifications },
    }),
    user: {
      additionalFields: {
        handle: { type: "string", required: false, input: true },
        isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Workers have a tight CPU budget; the platform's native PBKDF2 is fast where a
      // pure-JS hash is not.
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
      // "Forgot your password?": a one-hour link by email; using it signs out everywhere else
      sendResetPassword: async ({ user, url }) => { await sendEmail(env, { to: user.email, ...resetEmail(user.name, url) }); },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: google,
    // Signing in with Google joins an existing account with the same (Google-verified) email,
    // so a creator set up ahead of time (like Wyatt) gets their account, not a new one.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    databaseHooks: {
      user: {
        create: {
          // Every creator needs a handle. Email sign-ups choose one; Google sign-ups get one
          // made from their name, which they can change later.
          before: async (user) => {
            let handle = typeof user.handle === "string" ? user.handle.trim().toLowerCase() : "";
            if (handle) {
              if (isReserved(handle)) throw new APIError("BAD_REQUEST", { message: "That handle is reserved for the site. Try another." });
              if (!isValidHandle(handle)) throw new APIError("BAD_REQUEST", { message: HANDLE_HINT });
              if (await slugTaken(db, handle)) throw new APIError("BAD_REQUEST", { message: "That handle is taken." });
            } else {
              handle = await freeHandle(db, user.name || user.email.split("@")[0]);
            }
            return { data: { ...user, handle } };
          },
          // ...and gets a personal collection at that handle, which they own.
          after: async (user) => {
            const id = newId();
            await db.batch([
              db.insert(schema.collections).values({ id, slug: user.handle as string, title: user.name, personalOf: user.id }),
              db.insert(schema.memberships).values({ collectionId: id, creatorId: user.id, role: "owner" }),
            ]);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The signed-in creator for a request, or null (deleted accounts can't sign in). */
export async function currentCreator(env: Env, request: Request) {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session) return null;
  const db = getDb(env);
  const creator = await db.query.creators.findFirst({ where: eq(schema.creators.id, session.user.id) });
  return creator && !creator.deletedAt ? creator : null;
}

async function freeHandle(db: ReturnType<typeof getDb>, from: string) {
  const base = from.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).padEnd(3, "x");
  if (isValidHandle(base) && !(await slugTaken(db, base))) return base;
  for (;;) {
    const h = `${base.slice(0, 20)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!(await slugTaken(db, h))) return h;
  }
}

// ---- passwords: PBKDF2-SHA256, stored as "pbkdf2$<iterations>$<salt>$<hash>" (base64) ----
const ITERATIONS = 100_000;   // the most Workers allow
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

async function verifyPassword(stored: string, password: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const got = await derive(password, unb64(salt), Number(iterations));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];   // constant time
  return diff === 0;
}
