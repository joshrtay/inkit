// A puzzle type's guide (rules with ✓ / ✗ pictures, and the worked example), shared by the
// /puzzles/<type> page and the puzzle-types pane beside the new-game page.
import type { guidePage } from "~/lib/guides.server";

export type GuideData = ReturnType<typeof guidePage>;

/** `inPane`: in the side pane, without the page-only "Playing here" line. */
export function GuideBody({ g, inPane = false }: { g: GuideData; inPane?: boolean }) {
  return (
    <>
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
                        <div className="mini-frame">
                          <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: p.svg }} />
                          <span className="badge" role="img" aria-label={p.ok ? "Right" : "Wrong"}>{p.ok ? "✓" : "✕"}</span>
                        </div>
                        <figcaption>{p.note}</figcaption>
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
          {!inPane && <p className="controls"><strong>Playing here:</strong> {g.controls}</p>}
        </section>
    </>
  );
}
