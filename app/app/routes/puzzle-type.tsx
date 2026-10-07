// One puzzle type's guide: the idea in a sentence, each rule with pictures of what works and what
// doesn't, and a worked example shown unsolved and solved.
import { data, Link } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/puzzle-type";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { exampleGameId, guidePage, isKind } from "~/lib/guides.server";
import "~site/game-types/grid/styles.css";

export async function loader({ params, context }: Route.LoaderArgs) {
  if (!isKind(params.kind)) throw data(null, { status: 404 });
  const page = guidePage(params.kind);
  // link to the example as a game only if it's on the site
  const id = exampleGameId(params.kind);
  const game = await getDb(context.get(cloudflareContext).env).query.games.findFirst({
    where: and(eq(schema.games.id, id), eq(schema.games.state, "published")), columns: { id: true },
  });
  return { ...page, playId: game?.id ?? null };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => d
  ? [{ title: `${d.name}: how to play · inkit` }, { name: "description", content: d.summary }]
  : [{ title: "Not found · inkit" }];

const ink = (c: string) => ({ "--paper-ink": c }) as React.CSSProperties;

export default function PuzzleType({ loaderData: g }: Route.ComponentProps) {
  return (
    <main className="wrap guide" style={ink(g.ink)}>
      <nav className="guide-crumbs" aria-label="Puzzle types">
        <Link to="/puzzles">Puzzle types</Link> <span aria-hidden="true">›</span> <Link to={`/puzzles?q=${encodeURIComponent(g.category)}`}>{g.category}</Link>
      </nav>
      <header className="guide-hero">
        <h1>{g.name}</h1>
        {g.aka.length > 0 && <p className="aka">Also called {g.aka.join(", ")}</p>}
        <p className="lead">{g.summary}</p>
      </header>

      <section className="guide-rules" aria-labelledby="rules">
        <h2 id="rules">Rules</h2>
        <ol>
          {g.rules.map((r, i) => (
            <li key={i} className={r.pictures.length ? "rule" : "rule plain"}>
              <p className="rule-text">{r.text}</p>
              {r.pictures.length > 0 && (
                <div className="rule-pics">
                  {r.pictures.map((p, k) => (
                    <figure key={k} className={`mini ${p.ok ? "ok" : "no"}${p.wide ? " wide" : ""}`}>
                      <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: p.svg }} />
                      <figcaption><span className="mark" aria-label={p.ok ? "Right" : "Wrong"}>{p.ok ? "✓" : "✗"}</span> {p.note}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-example" aria-labelledby="example">
        <h2 id="example">Example: {g.example.name}</h2>
        <div className="example-pair">
          <figure>
            <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: g.example.puzzle }} />
            <figcaption>The puzzle</figcaption>
          </figure>
          <figure>
            <div className="grid-game pic solved" dangerouslySetInnerHTML={{ __html: g.example.solution }} />
            <figcaption>Solved</figcaption>
          </figure>
        </div>
        <p className="controls"><strong>Playing here:</strong> {g.controls}</p>
        {g.playId && <p><Link className="btn primary" to={`/g/${g.playId}`}>Play {g.example.name}</Link></p>}
      </section>

      <nav className="guide-pager" aria-label="More puzzle types">
        {g.prev ? <Link to={`/puzzles/${g.prev.kind}`} rel="prev">← {g.prev.name}</Link> : <span />}
        <Link to="/puzzles">All puzzle types</Link>
        {g.next ? <Link to={`/puzzles/${g.next.kind}`} rel="next">{g.next.name} →</Link> : <span />}
      </nav>
    </main>
  );
}
