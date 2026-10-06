// Small helpers for loaders and actions.
import { data, redirect } from "react-router";
import { Forbidden } from "./permissions.server";
import { Invalid } from "./games.server";

/** Signed-out visitors go to sign in, then come back here. */
export function signInFirst(request: Request): never {
  const url = new URL(request.url);
  throw redirect(`/signin?next=${encodeURIComponent(url.pathname + url.search)}`);
}

/** Run an action; rule breaks come back to the form as { error } instead of crashing the page. */
export async function attempt<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Forbidden) return data({ error: e.message }, { status: 403 });
    if (e instanceof Invalid) return data({ error: e.message }, { status: 400 });
    throw e;
  }
}
