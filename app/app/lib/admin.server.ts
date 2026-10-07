// Who may use the admin endpoints (/admin/...): a signed-in admin, or a request carrying the admin
// API token (`Authorization: Bearer <ADMIN_API_TOKEN>`), so scripts and Claude can call them.
// Anyone else gets a 404, as if they didn't exist.
import { data } from "react-router";
import { currentCreator } from "./auth.server";

/** Compared in constant time, so the token can't be guessed a character at a time. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function requireAdmin(env: Env, request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token && env.ADMIN_API_TOKEN && token.length >= 32 && sameSecret(token, env.ADMIN_API_TOKEN)) return;
  if ((await currentCreator(env, request))?.isAdmin) return;
  throw data(null, { status: 404 });
}
