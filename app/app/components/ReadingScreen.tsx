// What you see while Claude reads a drawing (it can take up to a minute): your photo being looked
// over, what's happening now (by how long it's been), and a slow mix of lines: Claude talking to
// itself, where puzzle types come from, and ideas for what to draw next.
import { useEffect, useMemo, useState } from "react";

/** Claude, thinking out loud. */
const MUSINGS = [
  "Squinting at the smudges",
  "Counting the squares. Then counting them again",
  "Deciding whether that's a 4 or a 9",
  "Tracing every line with a careful finger",
  "Asking each pencil mark what it meant",
  "Finding where the grid begins",
  "Lining up the rows and columns",
  "Not peeking at the answer",
  "Hoping for exactly one solution",
  "Admiring the handwriting",
  "Telling clues from doodles",
  "Puzzling over it, professionally",
  "Noodling",
  "Wondering what the eraser marks used to say",
  "Checking the corners twice",
  "Following a line to see where it goes",
];

/** Tips for making a good puzzle. */
const TIPS = [
  "A good puzzle has one moment where it clicks.",
  "Exactly one answer means every step can be worked out, never guessed.",
  "Small grids can be fiendish; big ones can be gentle.",
  "Try your puzzle on someone else: where they get stuck is where it gets interesting.",
  "Fewer clues often make a better puzzle, as long as the answer stays unique.",
  "Writing the puzzle's type at the top of the page helps Claude read it.",
];

/** Shuffled (the same way each mount, so lines don't jump about while rendering). */
function shuffled<T>(xs: T[], seed: number) {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const PHASES: [number, string][] = [
  [0, "Looking at your drawing"],
  [7, "Reading the clues"],
  [22, "Taking a closer look"],
  [45, "Nearly there"],
];

export function ReadingScreen({ image, facts = [], ideas = [], as }: {
  /** the photo being read */
  image?: string;
  facts?: string[];
  ideas?: string[];
  /** the type it's being read as (a re-read with a type chosen) */
  as?: string;
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) / 1000), 250);
    return () => clearInterval(id);
  }, []);

  // musing, fact, musing, idea or tip, ...
  const lines = useMemo(() => {
    const seed = Math.floor(Math.random() * 233280);
    const m = shuffled(MUSINGS, seed), f = shuffled(facts, seed + 1), i = shuffled([...ideas, ...TIPS, ...TIPS], seed + 2);
    const out: { text: string; kind: "musing" | "fact" | "idea" }[] = [];
    for (let k = 0; k < 40; k++) {
      out.push({ text: `${m[k % m.length]}…`, kind: "musing" });
      const other = k % 2 ? i[Math.floor(k / 2) % i.length] : f[Math.floor(k / 2) % Math.max(1, f.length)];
      if (other) out.push({ text: other, kind: k % 2 ? "idea" : "fact" });
    }
    return out;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // musings pass quickly, facts and ideas stay long enough to read
  const [n, setN] = useState(0);
  useEffect(() => {
    const line = lines[n % lines.length];
    const wait = line.kind === "musing" ? 2600 : Math.min(9000, 2500 + line.text.length * 45);
    const id = setTimeout(() => setN((x) => x + 1), wait);
    return () => clearTimeout(id);
  }, [n, lines]);
  const line = lines[n % lines.length];
  const phase = [...PHASES].reverse().find(([at]) => t >= at)![1];

  return (
    <div className="reading-screen" role="status" aria-live="polite" aria-label="Claude is reading your drawing">
      <div className="reading-card">
        <div className="reading-photo">
          {image ? <img src={image} alt="" /> : <div className="reading-paper" />}
          <span className="reading-scan" aria-hidden="true" />
          <span className="reading-corners" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
        <p className="reading-phase">{phase}{as ? ` as ${as}` : ""}<span className="reading-dots" aria-hidden="true"><i /><i /><i /></span></p>
        <p key={n} className={`reading-line ${line.kind}`}>
          {line.kind === "fact" && <span className="reading-tag">Did you know</span>}
          {line.kind === "idea" && <span className="reading-tag">Idea</span>}
          {line.text}
        </p>
        <p className="reading-note">{t < 50 ? "This usually takes 20 to 40 seconds." : "Hard-to-read drawings take a little longer."}</p>
      </div>
    </div>
  );
}
