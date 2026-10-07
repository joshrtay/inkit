// "What kind of puzzle is it?": the game types Claude thought the drawing could be. The same
// clues are tried as each type in this browser (the one-solution check), so the creator can see
// which readings make a real puzzle, and picking one switches the puzzle to that type.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { looseSpec, parseSketch, specToSketch } from "~/games/sketch";
import { kindName } from "~/games/kinds";

type Status = "checking" | "one" | "none" | "many" | "unfit";
const LABEL: Record<Status, string> = { checking: "checking…", one: "✓ one solution", none: "no solution", many: "several solutions", unfit: "doesn't fit" };

export function KindChooser({ sketch, choices, onPick }: { sketch: string; choices: string[]; onPick: (sketch: string) => void }) {
  const loose = looseSpec(sketch);
  const current = loose?.genre ?? "";
  const as = (genre: string) => (loose ? specToSketch({ ...loose, genre }) : sketch);
  const key = loose ? JSON.stringify({ ...loose, genre: undefined }) : "";   // the clues, whatever the type
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    let live = true;
    setStatus(Object.fromEntries(choices.map((g) => [g, "checking"])));
    (async () => {
      const { countSolutions } = await import("~/games/count-solutions.client");
      for (const g of choices) {
        const parsed = parseSketch(as(g));
        let s: Status = "unfit";
        if (parsed.ok) {
          const r = await countSolutions(parsed.spec).catch(() => ({ error: "failed" }));
          s = "error" in r ? "unfit" : r.solutions === 1 ? "one" : r.solutions === 0 ? "none" : "many";
        }
        if (!live) return;
        setStatus((x) => ({ ...x, [g]: s }));
      }
    })();
    return () => { live = false; };
  }, [key, choices.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (choices.length < 2) return null;
  const unique = choices.filter((g) => status[g] === "one");
  return (
    <section className="kind-chooser">
      <h2>What kind of puzzle is it?</h2>
      <p className="muted">The drawing could be more than one kind. These are the same clues read as each.</p>
      <div className="kind-options" role="radiogroup" aria-label="Kind of puzzle">
        {choices.map((g) => (
          <button key={g} type="button" role="radio" aria-checked={g === current} className={`kind-option ${status[g] ?? ""}`} onClick={() => g !== current && onPick(as(g))}>
            <strong>{kindName(g)}</strong>
            <span className="kind-status">{LABEL[status[g] ?? "checking"]}</span>
          </button>
        ))}
      </div>
      {unique.length === 1 && unique[0] !== current && (
        <p className="kind-tip">Only <button className="link" type="button" onClick={() => onPick(as(unique[0]))}>{kindName(unique[0])}</button> has exactly one solution with these clues.</p>
      )}
      <p className="hint">Not sure what one means? <Link to={`/puzzles/${current}`} target="_blank">See how {kindName(current)} works</Link>, or open Puzzle types.</p>
    </section>
  );
}
