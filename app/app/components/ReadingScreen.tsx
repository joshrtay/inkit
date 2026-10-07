// What you see while Claude reads a drawing (it can take up to a minute): your photo being
// scanned, a word for what Claude's doing that changes slowly, and one fact about puzzles and the
// people who make them (a new one each read). The words and facts are in games/reading-words.ts.
import { useEffect, useState } from "react";
import { FACTS, WORDS } from "~/games/reading-words";

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function ReadingScreen({ image, as }: {
  /** the photo being read */
  image?: string;
  /** the type it's being read as (a re-read with a type chosen) */
  as?: string;
}) {
  const [fact] = useState(() => pick(FACTS));
  const [word, setWord] = useState(() => pick(WORDS));
  const [n, setN] = useState(0);
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setT((Date.now() - start) / 1000), 1000);
    // a new word every few seconds (never the same twice running)
    const next = setInterval(() => {
      setWord((w) => { let x = w; while (x === w) x = pick(WORDS); return x; });
      setN((k) => k + 1);
    }, 3600);
    return () => { clearInterval(tick); clearInterval(next); };
  }, []);

  return (
    <div className="reading-screen" role="status" aria-label={`Claude is reading your drawing${as ? ` as ${as}` : ""}`}>
      <div className="reading-card">
        <div className="reading-photo">
          {image ? <img src={image} alt="" /> : <div className="reading-paper" />}
          <span className="reading-scan" aria-hidden="true" />
          <span className="reading-corners" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
        <p key={n} className="reading-word" aria-hidden="true">{word}…</p>
        {as && <p className="reading-as">Reading it as {as}</p>}
        <aside className="reading-fact">
          <span className="reading-tag">Did you know</span>
          <p>{fact}</p>
        </aside>
        <p className="reading-note">{t < 50 ? "This usually takes 20 to 40 seconds." : "Hard-to-read drawings take a little longer."}</p>
      </div>
    </div>
  );
}
