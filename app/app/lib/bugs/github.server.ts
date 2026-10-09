// Filing a bug report's GitHub issue (an admin's "Send to GitHub" on /admin/bugs/<id>). The repo is
// public, so the issue holds only what issueBody() builds: the id, the gatekeeper's restatement,
// severity, area, build, route pattern and a link back here. Never the reporter's text, the
// replay, the screenshot or the page's state.
import { issueBody, issueTitle, type IssueFacts } from "./report";

export const GITHUB_API = "https://api.github.com";

export async function fileIssue(env: Env, facts: IssueFacts, options: { api?: string; token?: string } = {}) {
  const token = options.token ?? env.GITHUB_ISSUES_TOKEN;
  if (!token) throw new Error("Sending to GitHub needs the GITHUB_ISSUES_TOKEN secret (docs/bug-pipeline.md).");
  const repo = env.GITHUB_REPO || "joshrtay/inkit";
  const res = await fetch(`${options.api ?? GITHUB_API}/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "inkit.games bug reports",
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: issueTitle(facts), body: issueBody(facts), labels: ["bug-report"] }),
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const issue = await res.json() as { number: number; html_url: string };
  return { number: issue.number, url: issue.html_url };
}
