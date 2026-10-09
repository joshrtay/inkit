/** The commit the site was built from (vite.config.ts), for bug reports. */
declare const __BUILD_SHA__: string;

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
  /** Files GitHub issues for bug reports an admin sends (app/lib/bugs/github.server.ts): a
   *  fine-grained token for this one repo with Issues: write and nothing else. */
  GITHUB_ISSUES_TOKEN?: string;
  /** The repo issues go to, "owner/name" (default joshrtay/inkit). */
  GITHUB_REPO?: string;
  /** Lets the bug-fix workflow fetch one report's bundle (GET /admin/bugs/<id>/bundle) and nothing else. */
  BUG_BUNDLE_TOKEN?: string;
  /** Bug reports per person per day (default 5). */
  BUG_REPORTS_PER_DAY?: string;
  /** Cloudflare Email Service (wrangler.jsonc send_email): password reset emails. */
  EMAIL?: { send(message: { to: string; from: string; subject: string; text?: string; html?: string }): Promise<unknown> };
}
