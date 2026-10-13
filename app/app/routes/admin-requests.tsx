// Puzzle types creators asked for by pasting a puzz.link or Penpa+ link on /new that we don't have
// yet, by type, most asked for first (admins only; lib/link-requests.server.ts).
import type { Route } from "./+types/admin-requests";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { linkRequestCounts } from "~/lib/link-requests.server";
import { utc } from "~/components/BugAdmin";

export const meta: Route.MetaFunction = () => [{ title: "Requested types · inkit" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const rows = await linkRequestCounts(getDb(env));
  return { rows: rows.map((r) => ({ ...r, latest: r.latest ? new Date(r.latest).getTime() : null })) };
}

export default function AdminRequests({ loaderData: { rows } }: Route.ComponentProps) {
  return (
    <main className="wrap bug-admin">
      <h1>Requested types</h1>
      {!rows.length ? <p className="muted">None yet.</p> : (
        <table className="bug-table">
          <thead><tr><th>Type</th><th>From</th><th>Requests</th><th>Latest</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source} ${r.genreId} ${r.variant ?? ""}`} data-genre={r.genreId}>
                <td>{r.genreName}{r.variant ? <span className="muted"> {r.variant}</span> : null}</td>
                <td>{r.source === "penpa" ? "Penpa+" : "puzz.link"}</td>
                <td>{r.requests}</td>
                <td>{r.latest ? utc(r.latest) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
