// One bug report (admins only; docs/bug-pipeline.md): what the reporter wrote, the gatekeeper's
// verdict, the replay, the screenshot, the page's state and console log, and what to do with it:
// Dismiss, Mark duplicate, or Send to GitHub (an issue with no user text; its preview is shown).
import { data, Form, Link, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/admin-bug";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { BugError, bugKey, getReport, sendToGitHub, setReportState } from "~/lib/bugs/bugs.server";
import { issueBody, issueTitle, quarantined, type Verdict } from "~/lib/bugs/report";
import { ReplayPlayer, utc, VerdictTags } from "~/components/BugAdmin";

export const meta: Route.MetaFunction = ({ params }) => [{ title: `Bug report ${params.id} · inkit` }, { name: "robots", content: "noindex" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const r = await getReport(getDb(env), params.id);
  if (!r) throw data(null, { status: 404 });
  const stateText = await (await env.MEDIA.get(bugKey(r.id, "state.json")))?.text() ?? "{}";
  const state = JSON.parse(stateText) as Record<string, unknown>;
  const { logs = [], fails = [], ...page } = state as { logs?: { at: number; level: string; text: string }[]; fails?: { at: number; method: string; path: string; status: number }[] };
  const verdict = r.verdict as Verdict | null;
  const origin = new URL(request.url).origin;
  const facts = verdict && { id: r.id, verdict, version: r.version, route: r.route, adminUrl: `${origin}/admin/bugs/${r.id}` };
  return {
    report: {
      id: r.id, when: r.createdAt.getTime(), handle: r.handle ?? "?", what: r.what, expected: r.expected, state: r.state,
      version: r.version, route: r.route, gameId: r.gameId, duplicateOf: r.duplicateOf, issue: r.issueNumber ? { n: r.issueNumber, url: r.issueUrl } : null,
      verdictError: r.verdictError,
    },
    verdict,
    files: { replay: r.hasReplay ? `/admin/bugs/${r.id}/files/replay` : null, screenshot: r.hasScreenshot ? `/admin/bugs/${r.id}/files/screenshot` : null },
    page: JSON.stringify(page, null, 2),
    logs, fails,
    // exactly what Send to GitHub files
    issue: facts ? { title: issueTitle(facts), body: issueBody(facts) } : null,
    canSend: !!verdict && !quarantined(verdict) && r.state !== "quarantined" && !r.issueNumber,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const db = getDb(env);
  try {
    if (intent === "dismiss") await setReportState(db, params.id, "dismissed");
    else if (intent === "reopen") await setReportState(db, params.id, "reviewed");
    else if (intent === "duplicate") await setReportState(db, params.id, "duplicate", String(form.get("of") ?? "").trim());
    else if (intent === "send") {
      // the browser tests point this at their own stand-in for GitHub's API; only in development
      const api = import.meta.env.DEV ? String(form.get("github-api") ?? "") : "";
      const issue = await sendToGitHub(env, params.id, new URL(request.url).origin, api ? { api, token: env.GITHUB_ISSUES_TOKEN || "dev-stub" } : {});
      return { ok: true, error: undefined, sent: issue.number };
    } else return { ok: false, error: "Unknown action." };
    return { ok: true, error: undefined };
  } catch (e) {
    if (e instanceof BugError) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message };
  }
}

export default function AdminBug({ loaderData: d, actionData }: Route.ComponentProps) {
  const r = d.report;
  const busy = useNavigation().state !== "idle";
  const [githubApi, setGithubApi] = useState("");
  // the browser tests' stand-in for GitHub (development only, as the action checks)
  useEffect(() => { setGithubApi((window as { __inkitGithubApi?: string }).__inkitGithubApi ?? ""); }, []);
  return (
    <main className="wrap bug-admin">
      <p><Link to="/admin/bugs">← Bug reports</Link></p>
      <h1>Bug report {r.id}</h1>
      <p className="muted">From @{r.handle}, {utc(r.when)} · <span className={`bug-state ${r.state}`}>{r.state}</span>
        {r.duplicateOf && <> of <Link to={`/admin/bugs/${r.duplicateOf}`}>{r.duplicateOf}</Link></>}
        {r.issue && <> · <a href={r.issue.url ?? "#"}>issue #{r.issue.n}</a></>}</p>

      <section className="bug-section">
        <h2>What went wrong</h2>
        {/* the reporter's own words: shown here, never sent anywhere else */}
        <blockquote className="bug-text" data-testid="bug-what">{r.what}</blockquote>
        {r.expected && <><h3>What they expected</h3><blockquote className="bug-text">{r.expected}</blockquote></>}
      </section>

      <section className="bug-section">
        <h2>The gatekeeper</h2>
        <p><VerdictTags v={d.verdict} error={r.verdictError} /></p>
        {r.verdictError && <p className="error">{r.verdictError}</p>}
        {d.verdict && <>
          <p>{d.verdict.restatement}</p>
          {d.verdict.repro_steps.length > 0 && <ol>{d.verdict.repro_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
        </>}
      </section>

      <section className="bug-section bug-actions">
        <h2>Actions</h2>
        {actionData?.error && <p className="error" role="alert">{actionData.error}</p>}
        {actionData && "sent" in actionData && actionData.sent && <p role="status">Sent: issue #{actionData.sent}.</p>}
        <div className="bug-action-row">
          {r.state === "dismissed" || r.state === "duplicate"
            ? <Form method="post"><button className="btn" name="intent" value="reopen" disabled={busy}>Reopen</button></Form>
            : <Form method="post"><button className="btn" name="intent" value="dismiss" disabled={busy}>Dismiss</button></Form>}
          <Form method="post" className="bug-dup">
            <input name="of" placeholder="Report id" defaultValue={d.verdict?.duplicate_of_candidate ?? ""} aria-label="Duplicate of report" />
            <button className="btn" name="intent" value="duplicate" disabled={busy}>Mark duplicate</button>
          </Form>
          <Form method="post">
            {githubApi && <input type="hidden" name="github-api" value={githubApi} />}
            <button className="btn primary" name="intent" value="send" disabled={busy || !d.canSend}>Send to GitHub</button>
          </Form>
        </div>
        {d.issue && (
          <details className="bug-issue">
            <summary>The issue it files (public: no user text)</summary>
            <p><strong>{d.issue.title}</strong></p>
            <pre>{d.issue.body}</pre>
          </details>
        )}
      </section>

      <section className="bug-section">
        <h2>Replay</h2>
        {d.files.replay ? <ReplayPlayer src={d.files.replay} /> : <p className="muted">No recording was sent.</p>}
      </section>

      {d.files.screenshot && (
        <section className="bug-section">
          <h2>Screenshot</h2>
          <img className="bug-shot" src={d.files.screenshot} alt="The reporter's screen when they reported it" />
        </section>
      )}

      <section className="bug-section">
        <h2>Console and requests</h2>
        {!d.logs.length && !d.fails.length && <p className="muted">No errors or failed requests.</p>}
        {d.logs.length > 0 && <pre className="bug-log">{d.logs.map((l) => `${new Date(l.at).toISOString().slice(11, 19)} ${l.level}: ${l.text}`).join("\n")}</pre>}
        {d.fails.length > 0 && <pre className="bug-log">{d.fails.map((f) => `${new Date(f.at).toISOString().slice(11, 19)} ${f.method} ${f.path} → ${f.status || "no answer"}`).join("\n")}</pre>}
      </section>

      <section className="bug-section">
        <h2>The page</h2>
        <p className="muted">Build <code>{r.version || "?"}</code> · <code>{r.route}</code>{r.gameId && <> · <Link to={`/g/${r.gameId}`}>the puzzle</Link></>}</p>
        <details><summary>State JSON</summary><pre className="bug-log">{d.page}</pre></details>
      </section>
    </main>
  );
}
