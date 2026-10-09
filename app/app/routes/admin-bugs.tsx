// Bug reports, newest first, with the gatekeeper's verdict (admins only; docs/bug-pipeline.md).
import { Link } from "react-router";
import type { Route } from "./+types/admin-bugs";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { listReports } from "~/lib/bugs/bugs.server";
import type { Verdict } from "~/lib/bugs/report";
import { utc, VerdictTags } from "~/components/BugAdmin";

export const meta: Route.MetaFunction = () => [{ title: "Bug reports · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const rows = await listReports(getDb(env));
  return {
    reports: rows.map((r) => ({
      id: r.id, when: r.createdAt.getTime(), state: r.state, handle: r.handle ?? "?", route: r.route,
      what: r.what.length > 120 ? `${r.what.slice(0, 120)}…` : r.what,
      verdict: r.verdict as Verdict | null, verdictError: r.verdictError, issue: r.issueNumber,
    })),
  };
}

export default function AdminBugs({ loaderData: { reports } }: Route.ComponentProps) {
  return (
    <main className="wrap bug-admin">
      <h1>Bug reports</h1>
      {!reports.length ? <p className="muted">None yet.</p> : (
        <table className="bug-table">
          <thead><tr><th>Report</th><th>When</th><th>State</th><th>Verdict</th><th>From</th><th>What went wrong</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} data-report={r.id}>
                <td><Link to={`/admin/bugs/${r.id}`}>{r.id}</Link></td>
                <td>{utc(r.when)}</td>
                <td><span className={`bug-state ${r.state}`}>{r.state}</span>{r.issue ? ` #${r.issue}` : ""}</td>
                <td><VerdictTags v={r.verdict} error={r.verdictError} /></td>
                <td>@{r.handle}<br /><span className="muted">{r.route}</span></td>
                <td>{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
