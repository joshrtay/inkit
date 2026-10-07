// Optional secrets beyond those `wrangler types` finds in wrangler.jsonc and .dev.vars (set in
// .dev.vars locally, `wrangler secret put` in production). Google sign-in is offered only when
// both Google keys are set.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Reads uploaded sketches with Claude (app/lib/read-sketch.server.ts). */
  ANTHROPIC_API_KEY?: string;
  /** Lets scripts (and Claude) call the admin endpoints: `Authorization: Bearer <token>` (app/lib/admin.server.ts). */
  ADMIN_API_TOKEN?: string;
  /** Cloudflare Email Service (wrangler.jsonc send_email): password reset emails. */
  EMAIL?: { send(message: { to: string; from: string; subject: string; text?: string; html?: string }): Promise<unknown> };
}
