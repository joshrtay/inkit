# Tutorials that teach a rule without stating it

This document covers how good puzzle designers build level sequences that let players work out a
rule for themselves, and proposes an AI tutorial-builder for inkit that does the same. The
builder is a 16th AI creator, which publishes ordinary posts through the existing AI-creator
pipeline: one rule a week, per puzzle type and per sub-rule (each Panel symbol, each Panes rule,
each Sudoku variant).

It has three parts:
- **Research (§1–§3):** what the designers did and said. Sources are numbered and listed at the
  end. **[P]** marks a primary source (the designer's own words, a paper, talk slides or an
  official page). **[S]** marks a secondary one (press, a critic, a fan's analysis, a search
  summary).
- **Proposals (§4–§7):** our design. Everything there is a proposal unless it names existing code.
- **Gaps:** what we looked for and could not confirm.

Read with [panel-design.md](panel-design.md) (introduce / confirm / combine / twist for panels) and
[design-grant.md](design-grant.md) (eurekas, rabbit trails, generate and curate). This document
does not repeat those.

## 1. What the designers do

### Jonathan Blow (The Witness, Braid)

- **No text, on purpose.** Blow wanted "extreme clarity, at least around the first layer of
  puzzles". He cut audio-log narrative and object collecting so that the panels would be the only
  way the game talks to the player [1 P]. He rejects tutorials in which a "little character" tells
  you every obvious thing [2 P]. He calls the opening area a tutorial that gets you used to the
  panels; after it the island is a sandbox [3 P].
- **The first panels can be solved by accident.** The first panels are tiny (2×1) grids that a
  random line can solve. They grow until the rule has to be understood [4 S]. He calls the first
  black/white panels "pre-spatial": the player has to discover that the line *separates* [1 P].
- **The sequence corrects mistaken readings.** In the squares area (the farmland), the first
  screen places the start and end so that separating the colors is the natural move. The second
  screen keeps the rule and moves the endpoints. Later screens grow from one dimension to two [5 S].
  In the marsh, one screen tempts a wrong placement of a shape and forbids it. In the treehouses,
  the belief that same-colored stars stay together is overturned on the very next screen [5 S].
- **Known weakness.** Many squares panels can be solved without fully understanding the rule, so a
  player who fails later can't tell what they got wrong [6 S]. Players often believe that all
  squares of one color must share a region [7 S]. Steam players report the same kind of
  misunderstanding for stars ("stars pair with stars") and for hollow shapes ("It doesn't cut
  figure, it subtracts") [8 S].
- **No red herrings.** Panels are minimal, so a hard panel is hard "because you genuinely don't
  see the possibilities" [1 P]. Blow does lure players toward a move that looks obvious and then
  turns out wrong [9 S].
- **Braid.** Each world has one time rule, and its consequences are explored one object type at a
  time (monsters, keys, doors, platforms). The base platforming is kept "so simple that they would
  be boring" alone, so that a stuck player is thinking about time and not something irrelevant
  [10 P][11 S].
- **Design method.** "Truth in Game Design" (GDC Europe 2011) and "Designing to Reveal the Nature
  of the Universe" (IndieCade 2011, with Marc ten Bosch) argue for keeping the puzzles that show a
  system's truths most cleanly, over combining elements for variety [12 P][13 P].

### Arvi Teikari (Baba Is You)

- **Design backwards from one interaction.** He thinks of an interaction between words, then
  tries to "reverse-engineer a level that requires said interaction in its solution" [14 P].
- **Hunt down unintended solutions.**
  - "almost every single level I made had at least one alternative way" to solve it. He spent a
    long time changing levels so that alternatives still showed the main idea [15 P].
  - When a tester found an alternative he liked, he made it into a level of its own [15 P].
  - Most cut levels (about 70–80) were cut for "excessive unintended solutions" [16 S].
  - In early levels he left some trivial alternatives in, because even those teach something new
    [17 S].
- **Red herrings only when they're funny.** He avoided red herrings "just for their own sake"
  because they made levels "needlessly more difficult", but kept some misdirection when it was
  amusing [14 P].
- **Nothing means anything until a rule says so.** He reworked the game so that "the only meaning
  in the levels came from the interactable rules" [14 P].
- **Hidden machinery isn't taught.** He gave up teaching the rule-priority system and built levels
  so that the player doesn't need to understand it [15 P].

### Patrick Traynor (Patrick's Parabox)

- **The core rule:** "make the easiest possible version of a puzzle, that still features the
  interesting idea" [18 P].
- **Cut ruthlessly.**
  - Big batches of puzzles were added and big batches removed [18 P].
  - 364 puzzles shipped out of more than 600 drafts [19 S, GDC 2024 slides via summary].
  - He reordered the shipped puzzles many times, with many playtesters [20 P].
- **A lucky solve is acceptable** if the puzzles right after it make the player grapple with the
  same idea. He admits "people do end up underprepared at points" [18 P].
- **GDC 2024 talk ("System-Centric Puzzle Design").** The aim is to "showcase/communicate", not
  "challenge/stump". Methods [19 S]:
  - simplify;
  - remove solution steps;
  - trim the possibility space;
  - keep puzzles bite-sized;
  - fix a problem puzzle by inserting, modifying, deleting, reordering or making it optional.
  - He accepted trading some depth of understanding for approachability.
- **Early playtests** found too few introductory puzzles; players got lost on the harder recursion
  ideas [21 S].
- **World 1 order (a fan's analysis).**
  - Levels 1–3 are plain Sokoban.
  - Level 4 shows a block entering a box in a setup that is hard to get wrong.
  - Levels 5–9 each add one twist: walk through the box, push from inside, goal inside, push back
    out.
  - In short: one new concept per level, repeated within and across levels [22 S].

### Alan Hazelden (Draknek: Sokobond, Cosmic Express, A Monster's Expedition)

- "Each puzzle has a single idea it's focused on". If a puzzle doesn't explore that idea well,
  they scrap it [23 P, quoted in an interview about Spooky Express].
- He and his co-designer suggest variations on each other's puzzles to make them more focused and
  "more approachable", and to prevent unintended solutions. Over 400 puzzles were designed and
  about 220 shipped [23].
- They watch first-time players. Where a player gets stuck, they ask whether an earlier level
  should have taught the missing idea [23 P].
- He names his "mental model of player understanding" as his biggest improvement over the years
  [24 S].

### Stephen Lavelle (Stephen's Sausage Roll)

- He declines to explain his process [25 P]. The game's only tutorial text covers movement [26 S].
  The puzzles are hard "from the very start", yet critics call them fair [27 S].
- A fan built an introductory level pack in answer to the common complaint that the game has none
  [28 S].
- Lesson: wordless teaching with no easy ramp works for an enthusiast audience. It is a deliberate
  choice, not a default.

### Elyot Grant

See [design-grant.md](design-grant.md).
- Rules are taught with pictures rather than text, and explicit tutorial panels come late, so that
  players find the deductions themselves (Glimmith) [29 P].
- Rabbit trails (wrong approaches that can't be quickly disproved) are the worst kind of red
  herring; dead ends that fail fast are fine [30 P].
- A run of easy puzzles motivates players to take on a hard one [31 P].

### Nintendo, Mark Brown, Portal, Taiji

- **Nintendo.** Super Mario 3D Land/World stages run introduce, develop, twist, conclude, after
  four-panel comics (kishōtenketsu). "First, you have to learn how to use that gameplay mechanic"
  (Koichi Hayashida) [32 P]. Mark Brown calls these stages self-contained showcases where an idea
  is taught, developed, twisted and then dropped. In Cakewalk Flip, the first panels sit low, so a
  fall costs nothing [33 S]. Miyamoto says World 1-1 lets players "gradually and naturally
  understand" before they play freely [34 P].
- **Mark Brown on puzzles.** A good puzzle has a catch, an assumption the designer leads you to,
  and a revelation [9 S].
- **Portal.**
  - "Playtesting is probably the most important thing we did on Portal" (Kim Swift). The game was
    tested every week, and the advice is to watch people play rather than read reports [35 S].
  - A confusing "shimmery force field" was replaced by glass, and the world kept getting simpler
    [35 S].
  - The designers knew from their student game that players thought portals led elsewhere. So the
    first room is full of memorable objects, and the first portal visibly leads back to the same
    place [36 S].
- **Taiji** (a Witness-like). Symbols are taught on small "test" panels: guess, form a hypothesis,
  confirm on the next panel. Early on, an unsatisfied symbol **blinks red**. Later puzzles drop
  that help [37 S].

### Pencil puzzles: stating the rules is the norm

- **Nikoli.** Puzzles are handmade, and the editors road-test genres sent in by readers before
  adopting them [38 S]. Their convention of rules plus a solved example, with books ordered from
  easy to hard, is well known but unconfirmed online (see Gaps).
- **Grandmaster Puzzles.** "Puzzles get progressively harder throughout the week". Newcomers are
  told to start with the easier entries [39 P]. Serkan Yürekli's *Intro to GMPuzzles* has 21
  easy-to-medium puzzles in each of 12 genres [40 P]. Snyder describes a handmade puzzle as "a
  trail of breadcrumbs" [41 S].
- **Logic Masters Germany** runs a beginner series made to help beginners "without having to rely
  on guesses" [42 P].
- On paper there is no feedback until you check the solution, so the rules have to be stated. The
  teaching is done by easy puzzles that each exercise one technique.

### Research on generated progressions

- **Butler, Smith, Liu and Popović (UIST 2013), on the game Refraction** [43 P]:
  - Each level is tagged with the concepts it *requires*. "Required" means **every** solution uses
    the concept, which is checked with answer set programming, the same family as clingo.
  - The sequence plan follows soft constraints: prerequisites (A appears before B), corequisites
    (B only with A), concepts per level, and the rate at which concepts are introduced.
  - Its generator constrains every solution to use concept X and rules out shortcut solutions
    (Smith, Butler and Popović, FDG 2013) [44 P].
- **Butler et al. (CHI 2015).** Progressions built automatically from solution features were
  tested with 2,377 players. After a few design iterations they were comparable to an expert's
  progression on engagement [45 P].
- **Green, Khalifa, Barros, Nealen and Togelius (FDG 2018).** A Mario level teaches mechanic X if a
  perfect agent wins and an agent *lacking X* fails; the search maximises that gap. Caveat: the
  perfect agent's superhuman play made some levels too hard for novices [46 P].
- **Andersen et al. (CHI 2012).** Tutorials were tested with more than 45,000 players. They raised
  play time (by up to 29%) only in the most complex game. When mechanics can be discovered by
  experimenting, explicit tutorials added nothing significant [47 P].
- **Lomas et al. (CHI 2013).** Easier versions held players longer [48 P].

## 2. Principles

Each principle below says what it is, where it comes from, and how inkit can check it (with
existing code where possible). The principles are a synthesis; the checks are proposals.

1. **One idea per level.**
   - *From:* Hazelden [23], Traynor [18][22], Blow [1], Butler's "concepts per level" [43].
   - *Check:* `ruleLoad(spec)` (`puzzles/ai/score.ts`) is 1 for an "introduce" step and at most 2
     for "combine". In the solve path from `deduce()` (`puzzles/difficulty/deduce.ts`), at least
     one step's `uses` must include the new kind.
2. **The smallest board that forces the idea.**
   - *From:* Traynor's "easiest possible version" [18][19]; Witness 2×1 openers [4].
   - *Check:* try sizes in increasing order and keep the first that passes every other check.
     Prefer fewer symbols, then fewer lines on the bare board.
3. **No way to succeed without understanding.**
   - *From:* Teikari [15][16]; Smith and Butler's "every solution uses X" [43][44]; Green's limited
     agents [46]. This is the hard requirement for the "check" step, not for the first one.
   - *Check:* the rival-rules test (§4.4), and the "rule-blind" count: the solutions with the new
     kind removed.
4. **The obvious move fails.**
   - *From:* Blow's misdirection [9]; the marsh shape screen [5]; Brown's "assumption" [9].
   - *Check:* compute the naive candidates (for a panel: the shortest line and the lines hugging
     the edge; for any type: the answer under the most common misreading) and require them to
     fail.
5. **Show the consequence before the rule.**
   - *From:* the first Witness panels are solvable by accident [4]; Traynor's lucky solves [18];
     Mario's free first fall [33]. The first level should be one the player can win before they
     understand it, so that they see a satisfied symbol.
   - *Check:* the rule-blind count is small (2–6 lines) for step 1.
6. **Counterexamples, through failure feedback.** The Witness and Taiji flash the symbol that
   isn't satisfied [37]. Wordless teaching depends on this: a failed attempt has to say *which*
   symbol objected, or the player can't tell a wrong rule from a wrong line (panel-design §2).
   - *Check:* the player flashes `check()`'s problem cells (separate work, §4.6).
7. **✓/✗ contrast pairs as levels.** Two near-identical boards, one symbol moved, different
   answers. Our guides show these as pictures; a tutorial can make the player draw both.
   - *Check:* the two specs differ by one given, and their unique solutions differ.
8. **Order of introduction.**
   - *From:* prerequisites and corequisites [43]. For panels, the natural order is the guide's
     (dots, squares, stars, triangles, shapes, hollow shapes, erasers, symmetry), and it matches
     `ISOLA_MIXES`. Stars come after squares, because the star-square pairing is the twist.
     Erasers need something to cancel.
9. **Combine two known ideas.**
   - *From:* the "combine" step in panel-design §2; Brown's interaction matrix for Mind Over Magnet
     [49 S]; Butler's combinations of concepts [45].
   - *Check:* both kinds appear in `uses`, and dropping either kind leaves more than one solution.
10. **Spacing and review.** Pick up an earlier idea again inside a later sequence, not as a
    separate drill (Traynor repeats concepts within and across levels [22]). The stars sequence
    reuses squares; the erasers sequence reuses stars.
11. **Difficulty pacing.** Within a sequence, the `deduce` estimate rises, with one easy step
    after the hardest (Grant's runs of easy puzzles [31]; Lomas's finding that easy holds players
    [48]). The weekday difficulty targets are in §4.1.
12. **How many levels per idea.** Parabox spends 6 levels on entering a box [22]. Mario stages
    spend about 4 beats on one idea [32][33]. **Proposal:** five posts per sub-rule, one week
    Monday to Friday (§4.2).
13. **When to let the player fail.** Fail early and cheaply (Mario's low first panels [33];
    Grant's "dead ends are fine" [30]). Never set a rabbit trail. On panels a failure costs one
    redraw, which is cheap.
14. **Checking understanding.** End each sequence with a "check" step that a player holding a
    wrong reading fails. For evaluating a sequence, the guide's ✓/✗ pictures make a ready-made
    quiz (§5).

## 3. Wordless teaching vs our guides

Our guides state each rule and show ✓/✗ pictures, as Nikoli and GMPuzzles do. Wordless teaching
suits rules whose space of plausible readings is small, and players who get feedback that points
at the problem. Andersen's study found that explicit tutorials don't help when mechanics can be
discovered by experimenting [47].

Stating the rule is the better choice when:
- **The reading space is large.** Number clues with many plausible meanings: what does a Compass
  count, and does a Skyscrapers clue count heights or towers?
- **The rule can only be checked on a full grid.** Pencil genres where a wrong answer can't be
  traced to one clue.
- **The player wants to start immediately.** Returning or competitive solvers.
- **Accessibility.**
- **Hidden machinery.** Teikari didn't teach rule priority at all [15].

**What this means for inkit.** Every post page already shows the genre's rules (make.ts's prompt
says so: "The page already shows the puzzle's rules"). So the tutorials can't be truly wordless.
They can be *rule-optional*: a sequence where a player who never opens the rules still learns
them, and a player who has read them finds out what the rule really means in play. That is the
standard to design for:
- Panel symbols and most Panes rules suit it best.
- Number-heavy genres lean on the stated rule, and their posts serve as practice.
- Whether this persona's posts should show the rules collapsed is left as an open question (§7).
  It isn't needed to start.

## 4. The tutor: a 16th AI creator (proposal)

The tutorial bot is not a new feature. It is one more persona in `app/app/ai/personas.ts`. It
publishes ordinary posts on its profile through the existing pipeline:
- `puzzles/ai/week.ts`, the weekly batch;
- `puzzles/ai/backfill.ts`;
- `make.ts`'s `makeFor` and `wordsFor`;
- a `Scorer` from `score.ts`;
- the schedule in `app/app/ai/schedule.ts`.

Its posts teach one rule a week. It is Isola's calendar (`ISOLA_MIXES`: a new symbol twice, then
with an earlier one) made stricter: more steps, each with a job, and checks that prove each step
does its job.

### 4.1 The persona

- **Name and handle (a suggestion):** *Slate*, `slate`. A schoolroom slate: chalk, a cloth, one
  thing at a time. The name is invented, per docs/ai-creators.md "Writing" and the genre-naming
  memory.
- **Bio:** "One rule a week, taught by the puzzles and not by me. Monday is the smallest board I
  can find. By Friday you won't need the rules written down."
- **Voice brief:** a teacher who only ever points. Short plain sentences. It names where to look,
  never what is true there. It never praises and never explains a solution. Every post can be
  read on its own, but the week reads as a lesson.
- **howIMake (sketch):**
  - "Each week has one new idea. On Monday it sits alone on a board so small that the line almost
    draws itself."
  - "On Tuesday I move one thing and the answer changes."
  - "On Wednesday the first line you think of is wrong."
  - "On Thursday there is no way through unless you know it."
  - "On Friday it meets something you learned before."
  - "I never write the rule. It's on the page if you want it, but you shouldn't need it."
- **Schedule:** Monday to Friday, at 07:30 in its time zone. One subject per ISO week. No weekend
  posts, so the week's lesson ends with Friday's combination.
- **Difficulty:** `{ kind: "weekday", by: { mon: 0.02, tue: 0.05, wed: 0.12, thu: 0.22, fri: 0.32, ... } }`.
  The scorer, not the scheme, enforces each step's job (§4.3).
- **Recommends:** Isola, for the panel symbols seen again in company, and Pebble, for a small
  daily panel. Each note is written in Slate's voice.

### 4.2 The schedule: a curriculum, one subject a week

The curriculum is an ordered list of subjects, walked one per ISO week, wrapping round when it
ends. Each subject names its genre, its generator setting, the subjects it requires, and its
rivals (§4.4):

| weeks | subjects | generator setting |
|---|---|---|
| 1–8 | panel symbols: dots, squares, stars, triangles, shapes, hollow shapes, erasers, symmetry | `mix` (`makePanel`); "hollow" needs its own mix (today shapes only *sometimes* get a hollow piece, `panels.ts`) |
| then, interleaved | each Panes rule after a "size" week: twins, opposites, compass, palisade, mingle shape, rose windows, … | `rules` (`"size=4,twins"`) |
| | Sudoku, then thermo and irregular Sudoku | `genre` |
| | each other generator genre's base rules (Nurikabe, Akari, Slitherlink, …), easiest types first | `genre`, tiny `sizes` |

- **Ordering.** A subject comes only after the subjects it requires (Butler's prerequisites
  [43]). Stars come after squares (the star-square pairing). Erasers come after squares and
  triangles (they need something to cancel). A Panes rule comes after the size week.
- **Interleaving.** Panel, Panes and genre weeks take turns, so a returning player doesn't get
  eight panel weeks in a row.
- **Length.** 8 + about 18 + 3 + about 30 ≈ 60 weeks before the curriculum repeats.

Each weekday is a fixed step of the lesson:

| day | step | what the post does | generator setting |
|---|---|---|---|
| Mon | **meet** | the new kind alone, smallest board; nearly forced, so the player wins before understanding (§2.5) | panels 2×2–3×3; other genres their smallest unique size |
| Tue | **contrast** | Monday's board with one given moved, added or removed, and a different answer: a ✓/✗ pair across two days | derived from Monday's spec (§4.3) |
| Wed | **naive fails** | the first line or fill you'd try is wrong; refutes the most common rival reading | 3×3 |
| Thu | **check** | solvable only with the true rule: every remaining rival is broken; the new kind carries the hardest step | 3×3–4×4 |
| Fri | **combine** | the new kind with one subject from `requires` or last week's (spaced review), each needing the other | 4×4 |

For a base-genre week, Friday is just a normal small puzzle of that genre, since there is nothing
earlier to combine with.

**What `personas.ts` needs.** Today a `GenrePlan` with `sequence: true` walks its `mixes` and
`rules` by `seriesIndex` across *all* post days. That is how Isola works, but it can't tell
Monday from Thursday or pick a subject per week. Two small, typed additions:
- `curriculum?: Subject[]` on the persona, where a subject has `{ id, genre, mix?, rules?,
  requires, rivals }`.
- `lessonDays?: Record<Weekday, Step>` on the persona.

`planFor` picks the subject by ISO week (as `oneTypeAWeek` already does) and the step by weekday.
The slot then carries `{ subject, step }` to `makeFor`, the scorer and `factsFor`.

### 4.3 How `make.ts` builds each step

`makeFor` stays the same loop: make candidates, score them, keep the closest to the day's
difficulty among those good enough. The tutor differs in three ways.

1. **More, smaller candidates.** The tutor gets `candidates: 30` or more and a tight `sizes` list
   per day. Its filters are strict, and Grant's lesson is that testing more candidates is cheaper
   than a smarter generator (design-grant.md §12). Later generator options would cut the waste:
   - a symbol cap;
   - fixed endpoints;
   - "forbid this line", which adds the naive line as a forbidden answer in `makePanel`'s clingo
     search.
2. **Tuesday is derived, not generated.** `makeFor` already makes the same puzzle for the same
   slot. So Tuesday's build re-makes Monday's post (or reads it from the week's batch) and
   searches one-given edits of it:
   - each edit moves, adds or removes one given of the new kind;
   - it keeps edits where the result is unique and its solution differs from Monday's;
   - it prefers the edit whose solutions differ most.

   This is the same mechanism as the pairs feature, where a post answers the previous one.
3. **A lesson scorer.** A new `Scorer`, written as plain functions in `puzzles/ai/lesson.ts`
   (unit-tested), wraps `withDeductionDifficulty(proxyScorer)` (`puzzles/difficulty/scorer.ts`).
   It returns quality 0, so the candidate is rejected below `minQuality`, when a step's hard
   checks fail. Its notes say why. The hard checks:

| check | how | steps |
|---|---|---|
| unique | `solve(p, 2)` (already guaranteed by the generator) | all |
| new rule needed | drop every given of the new kind: more than one solution | all but Mon |
| new rule used | some step in `deduce(spec).path` has the new kind in `uses`; on Thu, that step is the costliest | Wed–Fri |
| shown before understood | rule-blind count (solutions with the new kind removed, capped at 50) between 2 and 6 | Mon |
| one idea | `ruleLoad(spec).load` = 1 (Fri: ≤ 2, and both kinds in `uses`, and dropping either kind leaves more than one solution) | all |
| naive fails | the naive candidates are not the answer (panels: the shortest start-to-end lines and the edge-hugging lines; any genre: the answer under the day's rival) | Wed |
| rivals broken | §4.4 | Wed, Thu |
| contrast | one given apart from Monday's post; a different unique solution | Tue |
| small and clean | the smallest size that passes; fewest symbols; `maxSymbolShare`; no gaps unless needed | all |

### 4.4 The rival-rules check (the core test)

For each subject we write 2–5 **rivals**: plausible wrong readings of the rule, each encoded as
an alternative rule block.

- **Encoding.** A rival is a block with the same name and different ASP. It is used only by the
  lesson scorer, in `puzzles/ai/rivals.ts`, never by the engine the site runs.
- **Where rivals come from.** Documented misreadings ([6][7][8]), Claude's suggestions at design
  time, and later the wrong answers players actually make.

Examples:

| subject | rival readings |
|---|---|
| squares | all squares of a color must share one region [7]; every square must be cut off from every other; the line must touch each square |
| stars | stars pair only with stars [8]; at least one partner, not exactly one; all same-colored stars together [5] |
| triangles | count the corners the line touches; at least n sides, not exactly n |
| shapes | every shape may rotate; the region only has to *contain* the shape; the shape sits where it's drawn |
| hollow shapes | the hollow cell is cut out of the region rather than subtracted [8] |
| erasers | an eraser must cancel something even when nothing is wrong; it cancels everything in its region |
| symmetry | point (rotational) symmetry instead of mirror symmetry; the lines may touch |
| panes:twins | same shape only without turning or flipping |
| sudoku:thermo | digits rise by exactly 1 along the thermometer |

**When a rival is broken.** A post breaks a rival when, under the rival, the post has no solution
or a different one. A player who holds that reading fails that post.

**Which rivals each day must break.** These are fixed, so each slot can be checked on its own (a
backfill run included), with no state shared across the week:
- Monday breaks none, and should be solvable under most rivals: show first, refute later [18].
- Wednesday breaks the subject's first-listed (most common) rival.
- Thursday breaks all of them.

So by Thursday, every reading we know of has failed at least once. Green et al.'s "a limited
agent fails" [46] becomes an exact solver test, and "a level only solvable if you understood"
becomes checkable.

### 4.5 Titles and descriptions: pointing, not telling

- **Facts.** `wordsFor` and `factsFor` stay. The tutor's facts add three lines:
  - the step ("Monday: the first time this symbol appears");
  - the subject;
  - **where to look**: the cells of the solve step that first uses the new kind (from `deduce`),
    put in words ("the two squares in the top row").
- **The description.** It directs attention (Grant: whatever matters should stand out [30]) and
  never states what holds there. For example:
  - Mon: "Two squares. Draw a line."
  - Tue: "Yesterday's board. One square has moved."
  - Wed: "The short way round is tempting."
  - Thu: (nothing beyond the title)
  - Fri: "The dots from week one are back."
- **Titles.** The subject, the step as a Roman numeral, and one word: "Squares I · Two",
  "Squares III · The long way". Titles group the week on the profile and in the collection.
- **A code check.** It rejects any title or description that contains the rule's key words: the
  content words of that rule's guide sentence in `guides.ts` (for squares: "apart", "region",
  "separate", "different"), and any rival's wording. On a hit, `wordsFor` runs again with its
  `extra` line ("don't say …"), the way it already steers clear of repeated titles.
- **The usual rules still apply:** docs/ai-creators.md "Writing" and `AI_TELLS`.
- **The profile does the explaining.** Its "How I make puzzles" says the week's shape, so a player
  knows Monday is meant to be easy and Thursday is the test.

### 4.6 Failure feedback (separate work)

Wordless teaching relies on the board showing *which* symbol objected when an attempt is wrong,
as The Witness and Taiji do [37]. `check()` already returns the offending cells. Flashing them in
the player is a general improvement that the main session is handling separately; the tutor
benefits from it but doesn't depend on it to launch.

## 5. Evaluation (proposal)

1. **The scorer's notes.** These are the static checks on every candidate. `week.ts --dry-run
   --persona slate` writes a week to `archive/ai-week/` for review, and the review sheets
   (`puzzles/ai/sheet.ts`, `difficulty-sheet.ts`) can show a whole lesson on one page.
2. **Simulated novice**, run on a dry-run week.
   - A Claude agent gets the five boards in order with no rule text. It has a tool that submits an
     answer and returns pass/fail plus the offending cells (from `check()`). It keeps its notes
     across posts (the ARC-AGI-3 lesson in research-interestingness.md).
   - Record the attempts per post.
   - Afterwards, have it classify the guide's ✓/✗ pictures for that rule and state the rule. Score
     the statement by which rival (or the true rule) it matches.
   - A week the agent finishes holding a rival reading has a hole in the rival list or a step.
   - This is a smoke test, not ground truth.
3. **Human playtests.** 5–8 people who haven't met the subject play a dry-run week in order,
   without opening the rules. Watch silently (Swift [35]) and give the same picture quiz.
   Hazelden's question for every stall: should an earlier post have taught this [23]?
4. **Live.**
   - Today the site records solves by signed-in players (`solves`) and likes per post. Compare
     solve counts Monday to Friday within each week.
   - Does a subject's Thursday get solved by the people who solved its Monday?
   - Do players who followed a week solve that subject's posts by other creators more often?
   - Starts and abandons aren't recorded today. Recording them would be the next measure, but it
     is not needed to launch.

## 6. Build plan (proposal)

0. **Failure flash in the player.** Separate, general work, in hand in the main session (§4.6).
1. **The checks.**
   - `puzzles/ai/lesson.ts`: the step checks as pure functions over a spec, with unit tests.
   - `puzzles/ai/rivals.ts`: the squares and stars rivals as alternative ASP blocks, with tests
     that each rival accepts a board the true rule rejects.
   - The lesson scorer wrapping `withDeductionDifficulty(proxyScorer)`.
2. **The persona, paused.**
   - Add `slate` to `PERSONAS` with `paused: true`, its icon in `icons.ts`, and its voice,
     profile and recommendations.
   - Add the `curriculum` and `lessonDays` fields; teach `planFor` the week's subject and the
     day's step. Add the Tuesday derivation, the tutor's facts in `factsFor`, and the banned-word
     check in `wordsFor`.
   - Add a "hollow" mix to `PANEL_MIXES`.
   - Dry-run the 8 panel weeks; review them on the sheet; run the simulated novice; playtest two
     weeks (squares, stars) with people.
3. **Publish the panel weeks.** Unpause, and let the weekly batch run.
4. **Panes rules, Sudoku variants, base genres.** Rivals for each, added to the curriculum in
   requirement order. Base-genre weeks rely on rivals and size more than on "drop the new kind".
5. **Close the loop.** Read solves per weekday, use players' wrong answers to propose new rivals,
   and reorder the curriculum where Thursdays go unsolved.

## 7. Open questions

- **Rival encodings by hand.** Each rival is a few lines of hand-written ASP. That is fine for 8
  symbols and the Panes rules, and heavier for 30 genres. Their base-rule weeks may skip rivals
  and rely on size and the stated rules.
- **Hidden failure.** A panel fails when the line reaches the end, but a Nurikabe board can only
  fail once it is full. Wordless teaching is weaker there.
- **Rules on the page.** Should Slate's posts show the rules collapsed behind a tap? It would be
  a small player option, not needed to start.
- **Isola overlap.** Isola already does a lighter version for panels. Keep both (Isola as a
  review shelf, Slate as the lesson), or have Isola follow Slate's calendar a week behind?

## Gaps (searched, not confirmed)

- Primary text of Traynor's GDC 2024 slides. The PDF couldn't be parsed, so the points above come
  from search summaries [19]. The talk is on YouTube.
- A Hazelden essay or talk on early-level minimalism ("the smallest level that shows the idea" is
  a paraphrase, not his words). Also his YagmanX conversation.
- Lavelle's own views on tutorials. He has declined to explain his process.
- The Witness dev blog, and the in-game commentary by Blow and Muratori. The commentary is the
  best likely primary source on panel sequences.
- No source found for the exact Witness "refutation" panels beyond the critic's analysis [5].
- Nikoli's rules-plus-example convention and its easy-to-hard ordering, in a citable source.
- How Cracking the Cryptic introduces variants, and whether LMD has "intro" tags.
- Snyder's "capacity" idea (cited in design-grant.md from Grant's talk, not found directly).

## Sources

1. Time, interview with Jonathan Blow (2016): https://time.com/4355763/the-witness-jonathan-blow-interview/
2. Edge, "Post Script" (Blow, 2016): https://www.pressreader.com/australia/edge/20160210/282170765186464
3. GamesBeat, Blow on The Witness: https://gamesbeat.com/inspired-by-myst-jonathan-blow-aims-to-deliver-indie-creativity-with-the-witness/
4. PopMatters on The Witness: https://popmatters.com/the-witness-2495452683.html
5. Intermittent Mechanism, "Let's study The Witness" (2017): https://intermittentmechanism.blog/2017/08/18/lets-study-the-witness/
6. Digital Trends, Witness guide: https://digitaltrends.com/?p=912967
7. The Witness Wiki, squares: https://thewitness.gamepedia.com/
8. Steam community threads: https://steamcommunity.com/app/210970/discussions/4/135509412991591362 and https://steamcommunity.com/app/210970/discussions/0/1489992713712489707
9. Mark Brown, "How Jonathan Blow Designs a Puzzle" and "What Makes a Good Puzzle?" (GMTK): https://amara.org/v/C3BFd and https://amara.org/v/C3BEg/
10. Jesper Juul, interview with Blow on Braid: https://jesperjuul.net/handmadepixels/interviews/blow.html
11. Game Developer, "IndieCade: inside Jonathan Blow's puzzle design process": https://www.gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process
12. Blow, "Truth in Game Design", GDC Europe 2011: https://www.gamedeveloper.com/design/video-jon-blow-on-the-truth-in-game-design-
13. Marc ten Bosch on the IndieCade 2011 talk: https://marctenbosch.com/news/?p=181
14. Indie Game Website, interview with Arvi Teikari (2019): https://www.indiegamewebsite.com/2019/07/19/baba-is-you-developer-arvi-teikari-talks-indie-innovation-influences-and-puzzle-design/
15. MCV, "When we made Baba Is You": https://mcvuk.com/development-news/when-we-made-baba-is-you/
16. "A coffee break with Arvi Teikari" (Medium; blocked, via search summary): https://medium.com/@gofig.news/a-coffee-break-with-arvi-teikari-baba-is-you-e1cf625e7754
17. Red Bull, Baba Is You interview: https://www.redbull.com/us-en/baba-is-you-interview
18. Game Developer, on Patrick's Parabox's puzzle design: https://www.gamedeveloper.com/design/patrick-s-parabox-
19. Traynor, "System-Centric Puzzle Design in Patrick's Parabox", GDC 2024: https://gdcvault.com/play/1034415/System-Centric-Puzzle-Design-in (slides https://media.gdcvault.com/gdc2024/Slides/GDC+slide+presentations/Traynor_Patrick_SystemCentricPuzzle.pdf)
20. PSU, interview with Patrick Traynor: https://www.psu.com/news/interview-with-patricks-parabox-developer-patrick-traynor-ps5-ps4/
21. Game Developer, Road to the IGF: Patrick's Parabox: https://www.gamedeveloper.com/business/road-to-the-igf-patrick-traynor-s-i-patrick-s-parabox-i-
22. Siddarth, "Tutorial Design of Patrick's Parabox": https://siddarthrg.substack.com/p/tutorial-design-of-patricks-parabox
23. Game File, on Spooky Express (Hazelden, Le Slo): https://www.gamefile.news/p/spooky-express-draknek-and-friends-puzzle-game
24. TouchArcade, Draknek interview (2024): https://toucharcade.com/2024/07/19/draknek-interview-lok-digital-thinky-puzzle-games-sokobond-express-mobile-steam-deck-apple-arcade
25. increpare, Stephen's Sausage Roll launch post: https://www.increpare.com/2016/04/stephens-sausage-roll/
26. Destructoid, Stephen's Sausage Roll review: https://destructoid.com/reviews/review-stephens-sausage-roll
27. Thinky Games, "10 years of grilling": https://thinkygames.com/features/10-years-of-grilling-stephens-sausage-roll-remains-one-of-the-most-influential-puzzle-games-ever-created/
28. Stephen's Sausage Roll Tutorial (fan pack): https://geeveedeevee.itch.io/stephens-sausage-roll-tutorial
29. The Artisan of Glimmith, Steam announcements: https://steamcommunity.com/app/4160210/announcements/ (see design-grant.md [5])
30. Elyot Grant, "30 Puzzle Design Lessons" extended cut, part 2: https://www.youtube.com/watch?v=iUi2vMZajco
31. Elyot Grant, ThinkyCon 2024: https://www.youtube.com/watch?v=Q2H1SjdkdBY
32. Game Developer, "The secret to Mario level design" (Hayashida, 2012): https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design
33. MCV on GMTK's "Super Mario 3D World's 4 Step Level Design": https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps
34. Eurogamer, Miyamoto on World 1-1 (archived): https://web.archive.org/web/20160321111454/http://www.eurogamer.net/articles/2015-09-07-video-miyamoto-on-how-nintendo-made-marios-most-iconic-level
35. Game Developer, "Best of GDC: The secrets of Portal's huge success": https://www.gamedeveloper.com/game-platforms/best-of-gdc-the-secrets-of-i-portal-i-s-huge-success
36. Portal developer commentary (fan transcript): https://theportalwiki.com/wiki/Portal_developer_commentary
37. Thinky Games, Taiji review: https://thinkygames.com/reviews/taiji-a-chance-to-relive-the-witness/
38. Japan Focus on Nikoli and Maki Kaji (2007): https://apjjf.org/?p=23432
39. Grandmaster Puzzles, blog README: https://www.gmpuzzles.com/blog/?p=437
40. Intro to GMPuzzles: https://gmpuzzles.com/store/intro-to-gmpuzzles
41. Stanford Daily, profile of Thomas Snyder: https://stanforddaily.com/2010/03/30/sudoku/
42. Logic Masters Germany, site tour: https://logic-masters.de/Raetselportal/Hilfe/rundgang.php
43. Butler, Smith, Liu, Popović, "A Mixed-Initiative Tool for Designing Level Progressions in Games", UIST 2013: https://grail.cs.washington.edu/wp-content/uploads/2015/08/butler2013amt.pdf
44. Smith, Butler, Popović, "Quantifying over Play: Constraining Undesirable Solutions in Puzzle Design", FDG 2013: https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf
45. Butler, Andersen, Smith, Gulwani, Popović, "Automatic Game Progression Design through Analysis of Solution Features", CHI 2015: https://www.microsoft.com/en-us/research/?p=334439
46. Green, Khalifa, Barros, Nealen, Togelius, "Generating Levels That Teach Mechanics", FDG 2018: https://arxiv.org/abs/1807.06734
47. Andersen et al., "The Impact of Tutorials on Games of Varying Complexity", CHI 2012: https://grail.cs.washington.edu/projects/game-abtesting/chi2012/
48. Lomas, Patel, Forlizzi, Koedinger, "Optimizing Challenge in an Educational Game Using Large-Scale Design Experiments", CHI 2013: https://dx.doi.org/10.1145/2470654.2470668
49. On Mind Over Magnet's interaction matrix (secondary): https://enezio.notion.site/How-to-create-many-puzzles-2f29fa92c6c68005a931d103ffb0bebe
