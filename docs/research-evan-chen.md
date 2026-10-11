# Evan Chen on learning, problems and teaching

Evan Chen coaches the USA olympiad team, wrote *Euclidean Geometry in Mathematical Olympiads*
(EGMO) and the *Napkin*, and has run OTIS (Olympiad Training for Individual Study) since 2015.
This document catalogues his blog and website, summarizes everything he has written about
learning, problems and teaching, and pulls out what matters for us. Summaries are in our words.
Quotes are kept to one short phrase per piece at most.

How it was gathered (October 2026):
- The blog moved from WordPress to Pelican in May 2026, so the old `wp-json` API and sitemap are
  gone. Its Markdown source is public (github.com/vEnhance/blog.evanchen.cc), and all 169 posts
  (2014-01 to 2026-09) were read from there. Post URLs are `https://blog.evanchen.cc/<slug>/`.
- The website's Markdown source is also public (github.com/vEnhance/web.evanchen.cc, folder
  `input/`). Pages are at `https://web.evanchen.cc/<page>.html`. `evanchen.cc` redirects there.
  Two LaTeX handouts were read from the same repository: *From the Author's Side: Thoughts on
  Problem Writing* (2021) and Evan's slides for coaches at the EXCL program (Nov 2023).
- **Not read:** the PDFs. WebFetch could not parse the MOHS hardness scale or the OTIS syllabus,
  so those were skipped. What we know of them comes from the blog posts and FAQ pages about them.
  Nothing was signed into.

**Short answer to the brief.** Evan has written nothing about adaptive learning systems, and
nothing for or against AoPS's carefully sequenced curriculum as such. His few mentions of Richard
Rusczyk are about writing, teaching as a guide, decentralized education and variance in student
work. His own design leans the other way from fixed sequencing: OTIS lets students choose units
and problems, and he repeatedly says the effect of study order is small compared with energy and
enjoyment. See §3(e).

---

## 1. Catalogue

### 1.1 Blog posts (blog.evanchen.cc), by category

Pieces marked ★ are summarized in §2.

**Learning (18)**

| Date | Title | Slug | One line |
|---|---|---|---|
| 2014-07-27 | What leads to success at math contests? ★ | success | His first list: lots of problems, standard tricks, problems just above your level, extract the motivation, know when to quit. |
| 2016-01-19 | Some Advice for Olympiad Geometry ★ | geo-advice | Three ways to make progress on geometry (synthetic, computation, finding key claims); harder problems need more of them. |
| 2016-04-17 | Against Perfect Scores ★ | perfect | A binomial model shows grinding AIME to near-perfect is wasteful; move to harder problems. |
| 2019-01-31 | Math contest platitudes, v3 ★ | platitudes | His canonical study advice: no right plan, just work, problems just above your level, reflection, ego, enjoyment. |
| 2019-05-03 | Hard and soft techniques ★ | hard-and-soft | Distinguishes moves that end up in the proof from moves that only help you understand the problem. |
| 2019-10-26 | Understanding with System 1 ★ | sys1 | Understanding means the idea lands in fast intuition, not only in step-by-step checking; write for that. |
| 2020-06-14 | On choosing exercises ★ | exercises | Good exercises teach rather than check: concrete, enjoyable, not too tricky, memorable. |
| 2021-09-21 | Sometimes the best advice is no advice ★ | no-advice | For beginners, playing many more games beats a specific fix. |
| 2023-08-09 | Agency ★ | agency | Students don't need permission to teach themselves things; why the OTIS application has a coding task. |
| 2023-10-03 | Yet another reason I don't give much generic advice ★ | generic | "X or Y?" questions: he doesn't know, statistics don't apply to one person, and energy matters most. |
| 2023-10-23 | A story of a town ★ | town | Learning a field is like settling in a new town; get oriented, then explore. Against ordered book lists. |
| 2024-02-04 | NP-hard advice questions ★ | np-hard-advice | General problem-solving questions have no recipe; ask them about specific problems. |
| 2024-03-14 | Brianchon is fair game ★ | brianchon | Contests should reward flexibility a little beyond a fixed syllabus. |
| 2025-02-14 | Getting to know problems ★ | getting-to-know | Explore the problem's objects out of curiosity instead of rushing to extract the answer. |
| 2025-07-16 | 2011 N1 = 2024 A2 ★ | write-well | Two problems with the same idea show why writing well means understanding fully. |
| 2025-09-02 | How to make the most out of MOP ★ | most | Camp is short; use it to see what experts do that surprises you, and apply it later in the year. |
| 2025-11-11 | Foresight ★ | foresight | Planning a whole line of attack before computing, a skill shared with Hanabi and chess. |
| 2026-06-26 | Don't be GPT-3 ★ | gpt3 | Beginners latch onto surface features of a statement and stop thinking. |

**Teaching (18)**

| Date | Title | Slug | One line |
|---|---|---|---|
| 2014-01-15 | Constructing Parallelograms ★ | parallelograms | Reflection on a math circle lecture that ran too hard and lost half the room. |
| 2015-02-18 | Teaching A-Star USAMO Camp ★ | astar | Class format, why problems in a class should share one theme, and why to trim handouts. |
| 2015-05-07 | On Problem Sets ★ | pset | A one-trick problem in a physics pset; when hard problems teach and when to give up. |
| 2016-02-07 | Stop Paying Me Per Hour ★ | per-hour | Homework is the core of tutoring and class is the salt; what a coach actually adds. |
| 2017-03-06 | On Reading Solutions ★ | solread | Read for the one or two key ideas, never line by line; then ask how you could have found them. |
| 2017-04-08 | Some Thoughts on Olympiad Material Design ★ | design | His method: classify problems by main idea, not technical detail; teach themes like Global and Rigid. |
| 2018-01-05 | Lessons from math olympiads ★ | lessons | What contests give students besides math: community, independence, judgment, honesty about understanding. |
| 2018-02-02 | An apology for HMMT 2016 ★ | apology | Early problems should be gettable, not gimmes; think of the whole test, not problem 1. |
| 2018-03-27 | I switched to point-based problem sets ★ | points | Why OTIS sets ask for a points target out of a larger pool rather than every problem. |
| 2018-08-10 | Make training non zero-sum ★ | non-zero-sum | Training should be meaningful, not an arms race; contests should be neither trivia nor IQ tests. |
| 2021-08-24 | OTIS: The RPG ★ | rpg | OTIS points now drive a level system with Easter eggs. |
| 2023-07-03 | What I would add to the K-12 list ★ | k12 | Coding, probability and statistics, game theory, and real writing. |
| 2023-11-03 | Things I've learned from running OTIS ★ | otis | 400 students, no lectures; writing scales, autonomy, engagement mechanics and infrastructure. |
| 2024-01-05 | MOHS was a mistake ★ | mohs | His difficulty scale fed ego-driven arguments; advanced students should stop using it. |
| 2024-02-01 | Against exploitable rubrics ★ | rubrics | Additive partial-credit rubrics reward gaming the grading over solving. |
| 2025-08-08 | Thoughts on teaching multivariable calculus ★ | mulitvar | Teaching a breadth course: write everything up, concrete examples, sound-bites, repetition. |
| 2026-05-16 | Cubics and theater ★ | cubics | Why a lecture designed as a performance didn't get published as a handout. |
| 2026-09-19 | Variance at the Top ★ | variance | 20,000 OTIS submissions vary enormously in craft; craftsmanship matters more than scores. |

**Essays (15)**

| Date | Title | Slug | One line |
|---|---|---|---|
| 2015-03-14 | Writing ★ | writing | Why he came to value writing: it forces understanding, as teaching does. |
| 2016-02-13 | Things SPARC | sparc | Impressions of the SPARC rationality camp (later disowned as out of date). |
| 2016-05-27 | \_\_\_ students have to suffer ★ | blank | How his school district blocked his acceleration; neglect of gifted students is cultural. |
| 2016-08-13 | Against the "Research vs. Olympiads" Mantra ★ | mantra | "Olympiads aren't research" is true but used to belittle; olympiads have their own value. |
| 2017-11-08 | 117(d): Please don't tax PhD tuition waivers | 117d | Short policy post against a 2017 tax proposal. |
| 2019-06-01 | An opening speech for MOP ★ | mop-speech | An imagined orientation speech: camp is for all 80 students, not just the six. |
| 2019-08-25 | MOP should do a better job of supporting its students in not-June | support | Coaches should show students their effort is valued even if they drop out of selection. |
| 2020-01-13 | Meritocracy is the worst form of admissions except for all the other ones ★ | meritocracy | Score cutoffs for MOP aren't a judgment of worth; why they are still used. |
| 2021-07-15 | A short dissent on USA eligibility | dissent | Disagrees with a 2021 citizenship requirement for US teams. |
| 2023-06-03 | Pride ★ | pride | Why he doesn't count how many of his students made the IMO. |
| 2023-09-19 | The depth of Hanabi ★ | hanabi | Stages of learning Hanabi, from memory to logic to judgment and trust. |
| 2024-04-05 | The infinitely many stages of grief ★ | grief | Students no longer feel free to pursue what interests them; prestige chasing has spread. |
| 2024-06-03 | The story of the AutoCarrot | auto-carrot | A parable about all-in-one tools (Overleaf) that hide the parts you need to understand. |
| 2025-01-31 | A poset of math programs ★ | poset | Enrichment programs are teammates, ranked partially, not totally; quotes Rusczyk on decentralization. |
| 2025-05-12 | Words Spent ★ | words-spent | Treat words as a cost: spend them on examples and key steps, not boilerplate. |

**Math (52).** Mostly expository mathematics. Ones touching teaching: ★ *A common type-error on
the OTIS application* (2023-01-17, `type`), ★ *Imperative statements in geometry don't matter*
(2024-08-05, `imperative`), ★ *Writing Olympiad Geometry* (2014-07-01, `wander-geo`), *Rant:
Matrices Are Not Arrays of Numbers* (2016-01-17, `rant`). The rest, in date order:

- 2014-02-24 A Sampler of Harvard Math (`harvard-sampler`): pointers to courses he liked.
- 2014-10-19 Why do roots come in conjugate pairs? (`conjugate`): the Galois-symmetry explanation.
- 2014-11-13 / 11-18 Set Theory Parts 1–2 (`zfc1`, `zfc2`): ZFC axioms; ordinals.
- 2014-11-30 Three Properties of Isogonal Conjugates (`isogonal`): olympiad geometry lemmas.
- 2014-12-10 to 2015-01-21 Representation Theory Parts 1–4 (`rt1`–`rt4`): Maschke, Schur, products, the regular representation.
- 2015-04-10 Cauchy's Functional Equation and Zorn's Lemma (`cauchy`): pathological solutions.
- 2015-05-25 / 05-29 von Mangoldt and Zeta; Zeros and Primes (`zeta-1`, `zeta-2`): analytic number theory toward the prime number theorem.
- 2015-06-12 Proof of Dirichlet's Theorem (`dirichlet`).
- 2015-07-05 Linnik's Theorem for Sato-Tate Laws on CM Elliptic Curves (`emory`): his REU work.
- 2015-08-11 The Mixtilinear Incircle (`mixt`).
- 2015-09-05 Some Notes on Valuations (`valuations`).
- 2015-10-04 Constructing the Tangent and Cotangent Space (`tangent`).
- 2015-11-16 Cardinals (`cardinals`); 2015-12-02 Models of ZFC (`zfc`).
- 2015-12-07 Putnam 2015 Aftermath (`putnam-2015`): problems and his experience.
- 2015-12-17 Uniqueness of solutions for diffeq's (`diffeq`).
- 2015-12-22 Writing Olympiad Geometry Problems (`write-geo`): link to his handout.
- 2016-02-28 Tannakian Reconstruction (`tannakian`).
- 2016-03-14 Mechanism Design and Revenue Equivalence (`rev-equiv`).
- 2016-03-31 / 04-04 18.099 Transcripts: Chang's and Bourgain's Theorems (`chang`, `bourgain`).
- 2016-05-03 Artin Reciprocity (`artin`); 2016-06-03 Things Fourier (`fourier`).
- 2016-06-15 Miller-Rabin (`miller-rabin`); 2016-07-12 The Structure Theorem over PIDs (`pid-structure`).
- 2016-07-31 Vinogradov's Three-Prime Theorem (`vinogradov`).
- 2016-09-05 Approximating E3-LIN is NP-Hard (`e3lin`).
- 2016-10-16 Formal vs Functional Series (`genfunc`): why generating-function manipulations are legitimate.
- 2016-10-28 A Sketchy Overview of Green-Tao (`green-tao`).
- 2016-11-23 Algebraic Topology Functors (`algtop-functor`).
- 2016-12-15 Combinatorial Nullstellensatz and List Coloring (`listcolor`).
- 2017-01-05 Facts about Lie Groups and Algebras (`lie`); 2017-02-16 Holomorphic Logarithms and Roots (`holomorphic`).
- 2017-06-12 Positive Definite Quadratic Forms (`qforms`).
- 2017-09-04 Joyal's Proof of Cayley's Tree Formula (`joyal`).
- 2017-11-15 A story of block-ascending permutations (`block-ascend`): a research problem's history.
- 2018-02-28 Revisiting arc midpoints in complex numbers (`arc-mid`).
- 2018-10-10 / 10-25 A trailer for p-adic analysis, halves 1–2 (`p-adic-1`, `p-adic-2`).
- 2020-04-15 Circular optimization (`circular`).
- 2024-07-02 A proof of Poncelet Porism with two circles (`poncelet`).
- 2025-07-11 A stupid "real-life" application of quadratic reciprocity (`qr`).
- 2026-05-06 An example of a symmetric function with an asymmetric minimum (`notsymm`).

**Reports (9)**

| Date | Title | Slug | One line |
|---|---|---|---|
| 2016-11-11 | Notes on Publishing My Textbook ★ | publishing | How EGMO went from office-aide project to MAA book in 30 months. |
| 2018-12-10 | A few shockingly linear graphs | graphs | Plots from an economics paper on IMO medalists' later careers. |
| 2019-02-26 | RMM 2019 pictures and aftermath | rmm-2019 | Team trip report. |
| 2019-07-23 | IMO 2019 Aftermath | imo-2019 | Team report and comments on the problems. |
| 2020-12-16 | USEMO Problem Development, Behind the Scenes ★ | usemo-dev | How a six-problem paper is chosen from proposals: packets, ratings, test-solving. |
| 2024-01-18 | January newsflash ★ | jan-2024 | Comments on AlphaGeometry; OTIS Mock AIME report. |
| 2024-11-10 | FrontierMath ★ | frontiermath | How an AI benchmark inverts two of the three usual criteria for contest problems. |
| 2025-07-29 | IMO 2024 and 2025 ★ | coord | Coordinating at the IMO, strict rubrics, brief remarks on AI results. |
| 2026-06-13 | After AMM 2026 ★ | after-amm-2026 | First American Masters in Math; gaps in the US ecosystem, notably proof feedback. |

**News (26).** Announcements, in date order: first Napkin drafts (2016-07-18, `napkin-first-draft`);
new algebra handouts (2016-10-01, `alg-2016`); Constructing Diagrams handout (2018-09-19,
`diagrams`); plans for 2019 (2018-12-25, `dec-2018`); Napkin v1.5 (2019-02-20, `feb-2019`);
★ MOHS hardness scale launch (2019-11-26, `mohs-scale`); USEMO sign-ups (2020-04-21,
`usemo-2020`); 2021 TST format (2020-11-10, `tst-2021`); end of *Twitch Solves ISL* season 1
(2022-03-11, `twitch-s1`); season 2 (2022-11-04, `twitch-s2`); EGMO errata on GitHub
(2022-11-24, `egmo-book`); Japanese EGMO (2023-02-09, `japanese-egmo`); a Carina Initiatives job
post (2023-02-23, `carina-2023`); *Intro to Proofs for the Morbidly Curious* handout (2023-04-30,
`morbid`); Twitch season 3 and USEMO (2023-08-26, `twitch-s3`); OTIS Mock AIME 2024, written by
students (2023-12-22, `oime-2024`); OTIS X applications (2024-05-06, `otis-x`); September 2024
schedule (`sep-2024`); Mock AIME 2025 and USEMO results (2024-12-06, `dec-2024`); PhD and the Mock
AIME on Hugging Face (2025-03-14, `mar-2025`); OTIS XI applications (2025-06-03, `otis-xi`);
USEMO 2025 (2025-09-25, `usemo-2025`); ★ American Masters in Mathematics, a new proof contest
(2026-03-04, `amm-2026`); September 2026 updates (`sep-2026`); CJ Quines joins OTIS staff
(2026-09-14, `otis-xii`).

**Personal (12).** Restarting the blog (2014-01-01, `wintermelon`); Harvard to MIT (2015-06-28,
`transfer`); "deep conversations" are overrated (2015-08-05, `conversations`); a short story
(2019-02-15, `valentine`); Steam Deck (2021-08-10, `steam-deck`); ★ pitch for an
intro-to-proofs book (2021-08-16, `book-pitch`); a poem about a suspicious coin (2022-11-15,
`poem`); ★ COVID tripled his students' productivity (2023-01-02, `silver`); a StarCraft upset
(2023-02-14, `oliveira`); in a PhD he can no longer "see the ground" of foundations (2023-03-11,
`ground`); advice to his 18-year-old self (2023-08-30, `18yo`); ★ a timestamped day of running
OTIS (2023-09-06, `slice`).

**Hacking (9).** PDF compression (2014), Arch Linux on a Mac Mini (2014), git aliases (2015),
shifting PDFs (2016), DNSCrypt (2016), SysRq (2016), why not JavaScript as a first language
(2022-11-18, `javascript`), Hangul spellcheck in Vim (2024), moving the blog to Pelican
(2026-05-04, `pelican`).

**Puzzles (6).** ★ Puzzle-writing thoughts from his first Mystery Hunt (2021-02-18,
`puzzle-writing`); revision histories of his 2021 Hunt puzzles (2021-02-21, `mh-2021`); MOP
2021 mini-hunt (`mosp-2021`); Mystery Hunt 2023 retro (`mh-2023`); ★ why puzzle hunts beat
everyday puzzles (2023-11-06, `puzzles`); Teammate Hunt 2025 author notes (2025-04-23,
`tmh-2025`).

**April Fools (4).** BOATIS, a sailing program replacing OTIS (2023); college essay consulting
(2024); a fashion career (2025); an Asian fusion restaurant (2026). The 2019 `tr011ey` post (a
parody of EGMO as a dry 36-page college course) is filed under News; ★.

### 1.2 Website pages (web.evanchen.cc)

These are living pages, not dated. ★ = summarized in §2.

| Page | One line |
|---|---|
| ★ `faq-contest.html` (Math Contest FAQs) | 30 questions on training: where to start, time per problem, hints, write-ups, study plans, difficulty. |
| ★ `wherestart.html` (Beginner's page) | Syllabus, welcome letters, learning to write proofs, books, problem sources. |
| ★ `coaches.html` (Coach's page) | Truisms for coaches: develop talent, be patient, become a guide; links. |
| ★ `otis.html` | OTIS overview: three difficulty tracks, need-blind aid, links to syllabus and samples. |
| ★ `excerpts.html` | The OTIS Excerpts, a free 202-problem mini-book; lists its themed chapters. |
| ★ `faq-raqs.html` (Rarely Asked Questions) | Energy over time, what contests teach, tutors, advice to high schoolers, how to get useful advice. |
| ★ `contact.html` | How to ask him for study advice: 3–10 specific problems you missed and what you tried. |
| `recommend.html` | Reading list: Paul Graham, undergraduate notes, olympiad handouts, books, contests. |
| `mentors.html` | Directory of other olympiad tutors and small programs. |
| `problems.html` | Archive of USA olympiad problems and solutions; hosts the MOHS PDF (not read). |
| `olympiad.html` | His olympiad handouts. |
| `geombook.html`, `napkin.html`, `1802.html`, `coursework.html`, `publications.html` | His books, course notes and papers. |
| `usemo.html`, `mockaime.html`, `opal.html`, `mop.html` | Contests and events he runs; MOP information. |
| `videos.html`, `discord.html` | *Twitch Solves ISL* (live solving and write-ups); his Discord. |
| `faq-rules.html`, `faq-school.html`, `faq-latex.html`, `faq-linux.html`, `faq-personal.html` | FAQs on contest rules and grading, school, LaTeX, Linux, himself. |
| `techspeech.html`, `techsupport.html`, `filesys.html`, `latex-style-guide.html`, `asyguide.html` | Why students should learn to code, and how. |
| `cranks.html`, `letters.html`, `volunteer.html`, `history.html`, `quotes.html`, `games.html`, `puzzlehunt.html`, `personal.html`, `plushies.html`, `photos.html`, `now.html`, `index.html` | Personal and administrative pages. |

Handouts read from the site's source: ★ *From the Author's Side: Thoughts on Problem Writing*
(2021, `handouts/ProblemWrite`) and ★ *Thoughts and Q/A on math olympiad coaching* (EXCL slides,
2023-11-04).

---

## 2. Pieces on learning and problems (summaries)

Grouped by theme. Each heading links its source.

### 2.1 How to practise

**What leads to success at math contests? (2014)** — [success](https://blog.evanchen.cc/success/).
Written just after his last IMO. It replaces an earlier post whose point was that no particular
resource matters. His list: do many problems; learn the standard tricks, with diminishing returns
on obscure ones; work problems just above your reach; understand why solutions work; know when to
quit; do many problems. His test for the right difficulty is suspense: you shouldn't be confident
you'll solve it, or confident you won't. His biggest regret was avoiding IMO problems 3 and 6
until late. To learn from a solution he asks how he would train a student to solve it, which
separates main ideas from routine steps. After reading a solution you should be able to state its
main ideas in a sentence or two. On quitting: a problem that took him two hours in 2011 took 30
seconds a year later, and spending hundreds of hours on problems far beyond you wastes time. His
rule of thumb is to give up after one or two hours with no progress, but some students quit too
early.

**Against Perfect Scores (2016)** — [perfect](https://blog.evanchen.cc/perfect/). A student
averaging 10 out of 15 on the AIME is tempted to keep grinding AIME papers instead of starting
olympiad problems. He models each question as an independent coin flip. Even a student averaging
14/15 sweeps only about a third of the time, because small per-problem error compounds over 15
problems, and beating your own average by one is unlikely. So reliably acing a test needs a level
far above the test, and drilling problems you get right 95% of the time is grossly inefficient:
you only meet a problem you can't solve every 20 or 30 tries. You learn most from problems just
above your level, so he tells students to start olympiad problems before they are sure they will
qualify.

**Math contest platitudes, v3 (2019)** — [platitudes](https://blog.evanchen.cc/platitudes/). His
canonical advice post, linked from FAQ C-1.
- *There is no right training.* Copying his own reading schedule would go badly, because what
  feels natural or hard is personal. As a first approximation, do whatever is most engaging,
  except don't skip a subject you hate.
- *Don't optimize early.* Practice more. Only think about method when you feel stuck. To find out
  whether you're ready for a book, read chapter 1.
- *Work just above your level, and reflect.* Grinding easy problems is the common trap. Short-answer
  contests do reward speed and accuracy on routine problems, but he says at least 70% of time
  should go to getting smarter, not faster. He ranks outcomes by what you learn: knowing the
  answer at once teaches little; struggling and solving, even inelegantly, is great; failing,
  then seeing quickly what you missed, is also great. A solution that quotes an unknown theorem is
  a good moment to learn that theorem, because the context is fresh. If you understand a solution
  but can't see how anyone would find it, either the write-up is bad or the problem was too hard.
  If you can't follow it at all, it was too hard. Better to miss problems "by a little". Read the
  solutions to problems you worked on, solved or not. At olympiad level you start to have feelings
  you can't formalize; note them.
- *Leave ego out.* You need not do every problem in a chapter. Refusing ever to read a solution is
  a mistake, since reflecting on misses is where learning happens.
- *Enjoy it.* Two or three good hours a day is a realistic maximum. One hard problem solved is a
  good day. Thinking about math in the shower is the sign you're doing it right.

**Hard and soft techniques (2019)** — [hard-and-soft](https://blog.evanchen.cc/hard-and-soft/).
*Hard* techniques are moves meant to prove something and that end up in the write-up: angle
chasing, substituting into a functional equation, reducing modulo p, induction. *Soft* techniques
help you understand the problem and never appear in the write-up: small cases, equality cases,
variants with conditions added or removed, hunting for counterexamples, pictures, counting degrees
of freedom, guessing the answer, working out why an attempt failed, heuristic arguments. When
stuck, switch to soft techniques. His example is a USA TST system of three cubics. Endless
manipulation goes nowhere. It moves once you notice that the problem being over the reals rather
than the complex numbers hints at an inequality, and once you guess the integer answer. In
reflection, add soft techniques to the answers to "how could I have thought of that?" They are
hard to learn because solutions omit them, yet they tell you which hard technique to use. He
calls for handouts that train soft techniques, as handouts already train hard ones.

**Some Advice for Olympiad Geometry (2016)** — [geo-advice](https://blog.evanchen.cc/geo-advice/).
He says he has neither great ingenuity nor great stamina for computation, yet solves geometry
reliably with methods any trained student could find. Three kinds of progress: synthetic tools
(and recognizing standard configurations); computation ("bashing"), which is reliable but slow and
needs a judgment of whether it will finish in time; and finding the crucial claim, usually through
a large accurate diagram. A hard problem is often a chain of steps, each no harder than an easy
problem; the difficulty is knowing what to prove. Rule of thumb: the n-th problem on an IMO paper
needs about n of the three methods. Compared with other subjects, geometry rewards known theory
most, varies least (like chess), always has a computational fallback, and lets you test claims
empirically. Combinatorics is the opposite on all counts.

**Getting to know problems (2025)** — [getting-to-know](https://blog.evanchen.cc/getting-to-know/).
A reply to a student who did small cases on the size of a set, proved it was even, then ran out of
ideas. Evan says the student rushed toward the quantity the problem asks for instead of learning
what the objects look like: can I build any example, can I generate large ones, is this even
possible. His analogy is a first date, which should flow from curiosity, not run down a checklist.
Every attempt should return information beyond "did it work". Running out of ideas quickly, again
and again, means the approach is wrong. He notes one counterexample, a problem where the right
move is to ignore the structure and go straight for a construction.

**Don't be GPT-3 (2026)** — [gpt3](https://blog.evanchen.cc/gpt3/). Beginners fix on a surface
feature of the statement, match it to something they've seen, and stop thinking. His example is a
toy problem that tripped 2020-era language models into Pythagorean-triple algebra when common
sense solves it at once. Other cases: "I'm bad at sequence problems" (such problems share nothing
but the word), "I tried induction" as if naming a method were progress, matching inequality
shapes to Cauchy-Schwarz, and students trying to prove a false bound on TSTST 2016/4.

**Imperative statements in geometry don't matter (2024)** —
[imperative](https://blog.evanchen.cc/imperative/). Asking for strategies for "collinearity
problems" is as superficial as asking about problems containing "ABC". He gives five trivially
equivalent statements of one configuration (concurrence, collinearity, concyclicity) to show that
advice keyed to the imperative can't tell cosmetic rephrasings apart.

**A common type-error on the OTIS application (2023)** — [type](https://blog.evanchen.cc/type/).
Applicants "solve" minimum problems by AM-GM to a bound that still depends on the variables, then
plug in the equality case. That isn't false but meaningless: a minimum can't depend on the inputs.
He builds an example where the bogus method gives the wrong number.

**Foresight (2025)** — [foresight](https://blog.evanchen.cc/foresight/). Hanabi experts plan a
"line" many moves ahead, and so do strong solvers. He asks students to see a whole complex-number
computation, roughly how many terms of what degree, before starting it. Approaches are like moves
with dead ends, and when you can't see far enough you rank them by heuristics. Math has the
advantage that the goal is known, so you can search from both ends. He proposes the name
"foresight" for this unnamed skill.

**The depth of Hanabi (2023)** — [hanabi](https://blog.evanchen.cc/hanabi/). Not about math, but
a clear account of how expertise develops in stages. Memory and guesswork first. A website removes
the memory load. Shared conventions turn it into logic. Familiarity makes conventions automatic,
freeing attention for strategy and look-ahead. Hard variants teach when to break conventions.
Advanced play weighs competing metrics (efficiency, tempo, safety, clarity to teammates). Expert
play rests on trust. He enjoyed learning many conventions because each was required to be
intuitive, not arbitrary.

### 2.2 Reading solutions, writing, and understanding

**On Reading Solutions (2017)** — [solread](https://blog.evanchen.cc/solread/). Most solutions are
written as a chore, so the key step (the "ocean-crossing point", after Scott Aaronson) is buried
among routine details. Read solutions as you would explain one to a friend: find the one or two
sentences that are the difference between stuck and solved. He reads under 10% of the words of a
solution to a problem he missed. Reading line by line and checking each step misses the point,
since most lines follow from the main idea. If line by line is the only way you can follow it, the
problem is probably too hard for you, because what counts as a detail depends on your level. A
hard solution's lemmas are details to an expert but problems in their own right to a novice.
Reading solutions to problems you haven't tried is pointless. Afterward, ask how you could have
thought of it. Beyond technical lessons, give names to vague shared feelings across problems: his
"Equality" theme links two unrelated Putnam problems whose solutions both come from guessing the
optimal case by smoothing. Naming the feeling helps him recognize it in new problems.

**Understanding with System 1 (2019)** — [sys1](https://blog.evanchen.cc/sys1/). Using Kahneman's
two systems: understanding math means the concept resonates with fast intuition (System 1). An
expert sees at once that a set is a group, where a novice checks axioms one by one with slow
deliberate reasoning (System 2). Verifying a solution step by step is easy in principle; making
it resonate is the hard part, which is why not to read solutions line by line. For teaching:
concrete examples, pictures (even for non-geometric ideas), writing like you talk and passing on
emotional reactions ("compactness is good"), and page layout that draws the eye (boxed examples
and theorems in the Napkin). For learning: don't force System 2 to grind through a proof you don't
get. Find the example that makes it click, ask a friend, or come back later.

**On choosing exercises (2020)** — [exercises](https://blog.evanchen.cc/exercises/). Most
university exercises are chosen because a student can eventually do them, mastery makes them
straightforward, and the result is worth knowing. Necessary but not sufficient. These criteria
confuse what you can do after mastering a topic with what helps while first learning it, and an
exercise that checks understanding is not one that builds it. He contrasts a routine
measure-completion exercise with one concrete computation in algebraic geometry that finally made
a concept click for him. Criteria he adds: *concrete* (examples can't be symbol-pushed, so they
force you to see the object); *enjoyable* (textbooks could learn from contests, where people fight
over the prettiest problems and name them like heirlooms); *not too tricky* (assume a hard
exercise won't be solved, so it had better be worth the frustration). Also, write full solutions,
since the solve-then-read-solution loop is the student's only feedback. Final test: will the
student remember it later? If they don't recognize the statement a year on, they learned nothing.

**2011 N1 = 2024 A2 (2025)** — [write-well](https://blog.evanchen.cc/write-well/). A Shortlist
problem whose nice idea is easy to bury in notation: many full-mark write-ups don't show
understanding. A 2024 problem has the same key idea in disguise. Full understanding of the first
means easily finding the elegant (non-induction) solution to the second. That is why practice
write-ups should aim to be good, not merely correct.

**Words Spent (2025)** — [words-spent](https://blog.evanchen.cc/words-spent/). Student solutions
pad trivial steps and skip critical details. Treat words as a cost: cut what isn't needed, spend
most on what matters, so length shows importance. Spend heavily on good examples and diagrams.
The Napkin was cheap on purpose (intuition over proof); his 18.02 book was costly on purpose,
because beginners need everything spelled out.

**Writing (2015)** — [writing](https://blog.evanchen.cc/writing/). Says school math has become
regurgitating presented solutions, and that the real purpose of math class, teaching people to
think, has been forgotten. Writing exposition forces complete understanding. He cites Rusczyk's
"Learning Through Teaching" questions (how do you know, when would you use it, how could you have
found it).

**Variance at the Top (2026)** — [variance](https://blog.evanchen.cc/variance/). Having read about
20,000 OTIS submissions, he finds the variation in quality startling, from better-than-textbook to
incomprehensible. The worst aren't explained by trading polish for speed, and doing work well
itself becomes fast. He quotes Rusczyk noticing the same spread in AoPS challenge sets among
students who all look identical in school. What he values is a habit of craftsmanship, or
"trust", more than exam scores, and he regrets the culture where only the 7 points count.

### 2.3 Problem selection, sequencing and material design

**Teaching A-Star USAMO Camp (2015)** — [astar](https://blog.evanchen.cc/astar/). A three-hour
format: short warm-up, lecture with examples (students try each for about five minutes first; he
calls it immoral to discuss a solution before students have tried), an hour of practice with each
student on a different problem while he circulates, then presentations. Key claim: a class should
be built around one specific theme, not a mix of unrelated problems. The Shortlist already
provides mixed practice. His demonstration: letter–number pairs grouped by letter reveal their
pattern at once, while the same pairs interleaved hide it. So to write a good handout you need
something to say, controlled problem by problem. He also cut handouts from 30 problems to 5–7, and
would go to about 4 so everyone works the same problems. Mistakes: assuming what students knew
(ask "have you seen this before?", not "has anyone not seen it?"), and practice problems so hard
that his hints became outlines of solutions.

**Some Thoughts on Olympiad Material Design (2017)** — [design](https://blog.evanchen.cc/design/).
His teaching centres on connections and recurring themes. Solutions reduce to one or two main
ideas, so studying problems reduces to studying main ideas: summarize each solution in a few
sentences and structure notes so the key idea shows. He thinks olympiad taxonomy is underrated and
usually done by technical details (which theorem appears) rather than by main idea. Sorting by
technique works for geometry, where themes map to tools: his ten buckets are EGMO's ten chapters,
and diagrams come to "feel" like a bucket. It fails for combinatorics: a "pigeonhole" problem's
real idea is counting over all rotations. So he teaches non-technical themes, e.g. **Global** (add
everything up at once, ignoring local detail; double counting, linearity of expectation). Seeing
related problems together is what builds connections, hence keep a problem journal. Gaps:
functional equations often have no main idea, so they resist taxonomy, and he has no way to train
for truly novel problems like the windmill. New themes come from surprise: when students score far
below what he expected on a problem he found easy, he has found a framework he holds and they
don't. TSTST 2016/4 led to **Rigid**: before attacking the goal, first understand fully how a
fixed structure behaves, and the requested bound falls out.

**I switched to point-based problem sets (2018)** — [points](https://blog.evanchen.cc/points/).
OTIS sets used to be 6–9 problems, all required. Now they are 10–15 problems weighted 2, 3, 5 or 9,
with a target of roughly 60–75% of the points, multiple difficulty versions of many sets, and 2–4
problems marked red as especially nice or important. The old format came from scarcity: vetting a
problem took him from half an hour to an afternoon. He used to agonize over adding an eighth hard
problem that would cost students two or three more hours, and realized the students should decide.
The switch came from noticing his own feelings: with half a required set done he panicked; with
half a points set done he was choosing what looked fun. The number of problems solved is about the
same. What changes is that students count problems solved, not problems missed, and an
unattempted problem costs nothing. A second hope is that shy students who won't ask for help can
switch problems and read the solution later. He thinks students avoid asking about problem sets
for fear of seeming not to have tried, so he declares there are no stupid or lazy questions. His
remaining worry is that students can skip the 9-pointers; he counters with red marks and targets
that need one.

**Things I've learned from running OTIS (2023)** — [otis](https://blog.evanchen.cc/otis/). OTIS
has about 400 students, no synchronous meetings, and a Python web server that serves PDFs. Lessons:
1. Much of the work is unglamorous: email and writing solutions (he cites Rusczyk's joke that his
   job is writing emails).
2. Lectures are worse than he thought. Text is self-paced, untimed, easy on memory, reusable at no
   cost, and fixable at once. Live questions now go to an 800-member Discord. He found lecturing
   pushed him to optimize for popularity, and gave no lectures at MOP 2023.
3. That only works if you write well and write everything out. Don't write "left as an exercise"
   (most motivated students won't swallow their pride and ask); polish solutions, because writing
   scales. Rewrite at once whenever a student finds something unclear.
4. Motivated students do best with autonomy: no deadlines, free choice of units, point-based sets,
   and hints or full solutions on demand with no human in the loop, so nobody feels guilty about
   giving up. He thinks more students give up too late than too early.
5. Engagement matters: counting up, levels from points, cover art, hidden achievements, and a
   "buffet unlock" where new units open only after current ones are finished, because full access
   bred procrastination.
6. Infrastructure matters as much as content (problem database, materials repository, staff tools,
   Discord bot). Small frictions, like a one-click link to a problem's forum thread, add up across
   students.
He cites Rusczyk's idea that with great students a mentor becomes a guide.

**OTIS: The RPG (2021)** — [rpg](https://blog.evanchen.cc/rpg/). Points earned across units now
show as an RPG-style level, which makes completing sets feel more rewarding.

**Slice of life of the OTIS GM (2023)** — [slice](https://blog.evanchen.cc/slice/). A timestamped
day: financial aid, grading, answering questions, and rewriting unit text while replying to
students.

**Stop Paying Me Per Hour (2016)** — [per-hour](https://blog.evanchen.cc/per-hour/). Tutoring is
paid per meeting hour, which implies the meeting is the work. In fact the student alone with
problems is the active ingredient, and class is the salt. A coach helps with regularity, someone to
talk to, answers, and feedback on write-ups. More valuable: guidance, taste in problems (some
teach nothing or don't resemble real olympiad problems; others are instructive or beautiful),
taste in topics (he prefers narrow classes like "looking at equality cases" over broad ones like
"collinearity and concurrence"), and above all passing on heuristics, both general and
problem-specific. Hearing a solution explained is 4–10× faster than reading an official one. But
time on task matters most: top students think about math all day, about ten times a typical
qualifier's effort, which no coach's 2–3× efficiency gain can match. He later reversed one claim
(see the OTIS post): the in-person meeting can be dropped entirely.

**USEMO Problem Development (2020)** — [usemo-dev](https://blog.evanchen.cc/usemo-dev/). How to go
from proposals to a six-problem paper: a submission window, then a packet of about 20 problems
(30 is the limit) in random order, labelled to avoid "C7 must be hard" bias, covering a spread of
difficulties and subjects. Then 10–25 reviewers over 6–8 weeks give a quality rating (five words
from Unsuitable to Excellent, weighted so the jump between Acceptable and Nice counts most) and a
difficulty rating (IMO1/2/3 with half-steps). Free-text comments matter more than numbers.
Solutions go out halfway through. He asks each reviewer which six they would pick. The draft
balances "art" (the most attractive problems) against "science" (difficulty and subject balance).
He rejects rigid subject rules and lets a problem count partly as two subjects. A blind
test-solve follows as a sanity check.

**From the Author's Side: Thoughts on Problem Writing (2021 handout)** — [source on
GitHub](https://github.com/vEnhance/web.evanchen.cc/tree/main/handouts/ProblemWrite). His fullest
statement of taste. A good problem has **Art** (aesthetics) and **Science** (being a good test).
Art: a clean, natural statement (one sentence is inviting); a fundamental feel; a slick solution
with one big a-ha rather than computation or casework; surprise; a statement that invites you to
start playing with examples; a low-tech solution (the windmill); depth (generalizations, rich
diagrams); several solutions; legendary difficulty. Science: difficulty right for the contest *as
a whole* (two beautiful problems can spoil a paper together); a good test of real understanding;
instructive; approachable, so partial progress is possible; novel. Tricks go stale: Vieta jumping
was beautiful once and despised after contestants recited it from memory. He agrees with the
Putnam view that a problem almost nobody solves fails however beautiful, because contests are
meant to educate. On writing: work backwards from a solution idea (slick solution, contrived
statement) or forwards from a natural setup (nice statement, plainer solution), and aim for both.
Then edit: cut, specialize parameters (2017 instead of n), clean up what is asked, push the core
idea to its limit so you know the space of versions, and copy-edit.

**Writing Olympiad Geometry (2014)** — [wander-geo](https://blog.evanchen.cc/wander-geo/).
Drawing random lines until something looks concurrent produced nothing. Starting from a known
configuration, transforming it into an equivalent "proxy", then adding elements until a
conjecture appears worked every time. Wandering works only from somewhere with structure.

**An apology for HMMT 2016 (2018)** — [apology](https://blog.evanchen.cc/apology/). As problem
czar he sent over 100 students home with two or fewer of 30 problems solved. Making problem 1
trivially easy is the wrong fix. Use ARML's distinction: early problems should be **gettable**
(everyone feels they could have solved it on a good day, with no knowledge some lack) but not
**gimmes** (everyone actually solves it). At the IMO a third of the problems are gettable, so think
in fractions: three or four of ten. Design the test as a whole. Several medium problems spread
scores out through errors and time pressure, so a test of 4 easy, 6 medium and no hard problems
could work. Hit-or-miss easy problems are a hazard.

**MOHS hardness scale (2019)** — [mohs-scale](https://blog.evanchen.cc/mohs-scale/), with the PDF
on [problems.html](https://web.evanchen.cc/problems.html) (not read). A 0–50 scale in steps of 5
rating every USAMO, IMO and USA TST problem in his archive, with a long essay on how he judges
difficulty. Meant to help students pick practice problems and to interest coaches. He worried at
launch that rating a student's first solved olympiad problem "0" might spoil the moment.

**MOHS was a mistake (2024)** — [mohs](https://blog.evanchen.cc/mohs/). The scale did its job but
set off endless arguments over whether a problem is 10 or 30. His diagnosis: difficulty is tied up
with identity. Missing an "easy" problem threatens your self-image, calling a problem easy looks
elitist, and the backlash feeds itself. Students are badly wrong even on objective questions like
solve rates, which he blames mostly on ego rather than on difficulty being hard to judge (plus the
real cost of trying problems yourself; the IMO jury has too little time). Advice: intermediate and
advanced students who can already pick their own problems should not use MOHS. Asking what the
hardest step is, or what makes a problem hard, is useful reflection. Putting a number on it is
not. Unexpectedly low scores, though, have guided his teaching (the Rigid theme).

**Against exploitable rubrics (2024)** — [rubrics](https://blog.evanchen.cc/rubrics/). Traditional
olympiad rubrics were strict and sublinear: half a problem earned little. IMO schemes have become
additive and generous. Because rubrics repeat year to year, students learn to farm partial-credit
items (small cases, one direction of an iff) instead of solving. He wants a test where the winning
strategy is plainly to solve more problems. Incomplete coordinate bashes get no credit, so a
student who correctly judges a calculation hopeless isn't beaten by one who dives in blindly. He
would rather add a second easy problem than inflate partial credit.

**Brianchon is fair game (2024)** — [brianchon](https://blog.evanchen.cc/brianchon/). The
counterpart to the non-zero-sum post: problems shouldn't be locked to a rigid unofficial syllabus.
A theorem derivable from two on-syllabus ones is fair. Contests should reward some flexibility.

**Make training non zero-sum (2018)** — [non-zero-sum](https://blog.evanchen.cc/non-zero-sum/).
He worked out barycentric coordinates himself in high school, and that effort was the learning;
now it is in a $60 book. If contests become trainable trivia, they become an arms race favouring
the rich. If they swing to untrainable IQ tests, effort stops mattering. Both are bad. Training
must be meaningful (buying the PDF isn't; working its problems is), problems should be neither
too easy nor too hard, and credit for success belongs to the student's hours, not the coach.

**Lessons from math olympiads (2018)** — [lessons](https://blog.evanchen.cc/lessons/). The two big
benefits are community and growth through a deep challenge. Lessons include working hard *and*
learning to give up (better taught by experience than by "never give up" slogans), asking for help,
patience, independence (designing your own training, which he notes his teaching takes away),
working neatly, writing well (writing changes the math), thinking about how to learn, honesty about
fundamentals (fancy named theorems are useless without them), knowing what deep understanding
feels like, and reasoning about things that can't be defined: when a problem "feels projective" or
"rigid", which parts are natural. He teaches this "philosophy" because students solve fewer
problems without it. Since most participants don't win, contests teach valuing the journey.

**Against the "Research vs. Olympiads" Mantra (2016)** — [mantra](https://blog.evanchen.cc/mantra/).
"Olympiads aren't research" is true but works as a put-down and a recruiting slogan, like telling
a ping-pong champion that table tennis isn't tennis. Olympiads are valuable for their own sake.
Quotes Rusczyk wanting problem solvers everywhere, not just in mathematics.

### 2.4 Teaching beyond olympiads

**Thoughts on teaching multivariable calculus (2025)** —
[mulitvar](https://blog.evanchen.cc/mulitvar/). Recitation for MIT 18.02, a breadth-over-depth
course. You can't teach math well without good written material, and writing alone can beat most
instructors; whenever a student asks something, ask whether you failed to write it down. Small
logistics help (an extra office hour). Examples should be *illustrative*, not just plugged-in
numbers: show three "random" vectors with an unexpectedly large linear dependence so the
determinant visibly does the work; drop to 2D where school intuition works. Be opinionated and use
repeated **sound-bites** that move a story forward ("normal vectors replace slopes"). When
speaking, repeat important points many times (writing can instead link back). Plan, then drop the
plan; answering students' questions comes first. Recitation *is* the class.

**Cubics and theater (2026)** — [cubics](https://blog.evanchen.cc/cubics/). A MOP lecture built as
theatre (narrow, flashy, a skeleton handout to keep attention on the speaker) that he held back so
as not to spoil it, then published.

**Constructing Parallelograms (2014)** — [parallelograms](https://blog.evanchen.cc/parallelograms/).
An early lecture at the Berkeley Math Circle where half the students disengaged, problems were too
hard even with the key trick stated, and he wrongly assumed prerequisite knowledge. A strong final
problem saved it.

**What I would add to the K-12 list (2023)** — [k12](https://blog.evanchen.cc/k12/). Schools teach
specific knowledge over general skills, understandably, since skills are harder to teach. His
additions: computing literacy, probability and statistics (overconfidence), game theory, and
writing for a reader who wants to read it. Quotes Rusczyk on students rewarded for gibberish prose.

**Pitch for an intro-to-proofs book (2021)** — [book-pitch](https://blog.evanchen.cc/book-pitch/).
Wants a proofs text that is pragmatic (no logic and set theory first), substantial, intuitive
(work with intuition, not against it) and combinatorial. Argues that for enriched students the
rigorous and post-rigorous stages should merge, because they arrive with intuition worth using.

**Agency (2023)**, **Sometimes the best advice is no advice (2021)**, **Yet another reason I
don't give much generic advice (2023)**, **A story of a town (2023)**, **NP-hard advice questions
(2024)** — [agency](https://blog.evanchen.cc/agency/),
[no-advice](https://blog.evanchen.cc/no-advice/), [generic](https://blog.evanchen.cc/generic/),
[town](https://blog.evanchen.cc/town/), [np-hard-advice](https://blog.evanchen.cc/np-hard-advice/).
A cluster on why he resists prescriptions:
- Experience is the best teacher. A chess beginner who fell to scholar's mate needs 100 more
  games, not one fix. Overfitting to few data points hits a wall.
- For "X or Y?" questions: nobody has run the controlled study, statistics don't apply to one
  person, and energy dominates. If he says X is slightly better, students do a little X instead of
  a lot of Y.
- Asking for an ordered reading list is like asking for a route through a new town before
  walking it; get oriented, then explore by instinct.
- Questions like "how do I know which point to add?" or "how do I tell if I'm progressing?" can't
  have a general recipe, or you'd have a recipe for solving problems. There are heuristics,
  special cases, and above all better instincts from experience. Ask them about specific
  problems; advice-givers should show well-chosen examples rather than tell.
- Gifted students don't need permission to learn things; the OTIS coding task exists to show
  students they can teach themselves.

**How to make the most out of MOP (2025)** — [most](https://blog.evanchen.cc/most/). Three weeks
can't change your level, since a year of one hour a day outweighs it. What camp uniquely offers is
watching experts and peers do things you didn't expect (a classmate's unexpected use of quadratic
reciprocity he still remembers). Classes now showcase a perspective rather than list theorems; the
goal is to learn that a style exists, with examples, as a map for later in the year. Wisdom isn't
acquired in 90 minutes. At camp he will interrupt a student proving a false claim, to show that
experience could have flagged it, while admitting mixed feelings about letting students make their
own mistakes.

### 2.5 Website pages

**Math Contest FAQs** — [faq-contest](https://web.evanchen.cc/faq-contest.html). The most
practical source. Key answers:
- *C-0 (start):* exposure first, borrowing the Go proverb to lose your first fifty games quickly.
  Work past problems without a time limit, read the solution after an hour stuck. Contest problems
  punish surface understanding: in school you get a recipe per exercise; in contests you invent
  recipes. You will often ask "how was I supposed to think of that?", which is normal and never
  stops.
- *C-1:* do many problems just above your level and reflect. No method is a silver bullet (it
  couldn't be an equilibrium). The best predictor is thinking about math in the shower, which
  means both enjoyment and the right difficulty.
- *C-5 (proofs):* there is no real leap from computation to proof. Believing proofs are hard makes
  them hard.
- *C-6/C-7:* to see if you're ready, try it. The effect of choices like book X versus Y or M versus
  N hours is small, personal and rounding error.
- *C-9:* write at least a few sentences of each solution's main idea (OTIS requires it).
- *C-12 (when to give up or take a hint):* at least an hour. For the upper bound go by progress,
  not the clock: keep going while you're finding things, stop after hours of nothing, or when it
  stops being fun. Always read the solution when you stop. Keep several problems going at once.
- *C-14:* use whichever tool suits the problem; switching between synthetic and computational
  views often produces the synthetic solution.
- *C-15:* try all three problems in an exam, even 20 minutes each in reverse order, because
  difficulty is volatile and personal.
- *C-16/C-17:* don't race the clock, and don't over-plan, since energy management beats time
  management. The one exception is avoiding a feared subject.
- *C-20:* don't read a problem's difficulty as a judgment of your skill; difficulty varies more
  than you do. Only difficulty *for you* matters.
- *C-24:* writing and solving can't be separated. Writing up restructures and simplifies the
  solution and catches errors.
- *C-25:* "olympiad algebra" is a hodgepodge, so study coherent sub-skills instead.
- *C-27:* hours on a problem you don't solve are fine if you're pursuing an idea. Practice aims to
  maximize experience, not speed. Pushing a failing method until you see why it fails is learning.
- *C-29:* he won't give magic numbers (hours per day, chances), because they would be misused,
  like phone timers for daily quotas.

**Beginner's page** — [wherestart](https://web.evanchen.cc/wherestart.html). A path: an unofficial
syllabus, the USAMO welcome letters (examples across the difficulty range, with full solutions),
learning to write proofs alongside solving (practising writing alone is probably
counterproductive), a feedback loop through AoPS threads, beginner books, and an endless supply of
past problems. He stresses these are suggestions, not a guaranteed list.

**Coach's page** — [coaches](https://web.evanchen.cc/coaches.html). Truisms: develop talent rather
than just identify it. Expect slow early results, since exponential growth looks flat at first.
Once students can check proofs themselves, shift from lessons to teaching them to fish, and from
named techniques to unformalizable heuristics. Systems must work in practice; a problem set nobody
does has failed whoever is to blame. It also notes for coaches that "find all" and "find the
max/min" problems are implicitly two-part problems.

**EXCL coaching slides (2023)** — [source on
GitHub](https://github.com/vEnhance/web.evanchen.cc/tree/main/handouts/EXCL-2023-11-04-slides).
The two essentials are excellent problems and solutions at every level, and a community where
strong students return as trainers. Process matters: competent people with weak processes fail.
His example is his own old "college homework" model: a PDF of 7 problems, all required, email when
stuck. It caused enormous friction because nobody emails every time they're stuck. Fix:
point-based sets, a peer Discord, and an automated pre-written hint system.

**OTIS page and Excerpts** — [otis](https://web.evanchen.cc/otis.html),
[excerpts](https://web.evanchen.cc/excerpts.html). Three difficulty tracks (B easiest, D, Z
hardest), a unit catalogue, need-blind aid, admission for background and writing only, not merit.
The free Excerpts book is organized by his themes, not by technique alone: Monsters, Two-part
problems, Global, Local, Rigid, Free, Anti-problems, alongside standard units.

**Rarely Asked Questions** — [faq-raqs](https://web.evanchen.cc/faq-raqs.html). Energy beats time
management; drop whole commitments rather than shave minutes. The most important thing contests
taught him: working hard while knowing you may not succeed, which requires enjoying the work.
Tutors help, but not how people expect. To get useful advice, ask for specific examples and for
what most surprised them. For high schoolers: learn one hard skill deeply, and build things you're
a perfectionist about.

**Contacting Evan** — [contact](https://web.evanchen.cc/contact.html#advice). For study advice,
send 3–10 recent problems you couldn't solve with what you tried. He compares this to StarCraft
players sharing replays.

### 2.6 AI and benchmarks

**FrontierMath (2024)** — [frontiermath](https://blog.evanchen.cc/frontiermath/). Contest problems
traditionally need creative insight, little implementation, and elementary background.
FrontierMath keeps insight but drops the other two (solvers have code and references), which lets
it use short checkable answers, like Project Euler. The organizers rejected problems whose answers
could be guessed by pattern.

**January newsflash (2024)** and **IMO 2024 and 2025 (2025)** —
[jan-2024](https://blog.evanchen.cc/jan-2024/), [coord](https://blog.evanchen.cc/coord/). He
praised AlphaGeometry's output as machine-verifiable yet readable, using classical steps rather
than coordinate brute force, and saw its advance in pairing a neural model (to propose auxiliary
points) with a symbolic engine. On 2025 model results: impressive, but human-vs-machine medal
comparisons distract; read the problems instead. That year P1–P5 were unusually easy and P6
brutal.

**After AMM 2026 (2026)** — [after-amm-2026](https://blog.evanchen.cc/after-amm-2026/). Asked by
Rusczyk what the ecosystem lacks, he wishes he'd said almost everything. The biggest gap is regular
feedback on proofs for ordinary high schoolers. He suggests AI might help one day but has found it
not yet reliable.

### 2.7 Puzzles (hunt puzzles, not math)

**Some puzzle-writing thoughts from an amateur (2021)** —
[puzzle-writing](https://blog.evanchen.cc/puzzle-writing/). He splits puzzle design into the
mechanical half (steps, confirmations, no unused information, redundancy so one error garbles only
a letter) and the aesthetic half (theme). The aesthetic half matters more: mechanically trivial
puzzles can test well if they're fun, and several a-has are fine if they belong to one theme. Cut
steps that don't fit the theme. Put yourself in the solver's place at every step: what feedback do
they get when right, and when wrong? Testsolving is debugging. Drafts fall apart in testers' hands,
so don't polish much before the first test. One fix was adding an easy scenario as a foothold.

**An advertisement for puzzle hunts (2023)** — [puzzles](https://blog.evanchen.cc/puzzles/). A
hunt puzzle is a choreographed experience more than a challenge: no red herrings, quick error
detection, guard rails, and fast confirmation on the right path. He contrasts these with sudoku,
where mistakes surface late, and with math problems, where fruitless paths are normal. Good puzzles
have coherent themes where every piece of information is used.

---

## 3. Synthesis

### (a) Learning to solve unfamiliar problems versus building fluency

Evan separates the two sharply and says the first is where almost all the value is.

- **Speed and accuracy are a minor goal.** Short-answer contests do reward fast routine work, but
  at least 70% of practice should make you smarter, not faster ([platitudes]). Problems you
  already know how to do teach little beyond speed. Grinding to 95% accuracy is grossly
  inefficient, and perfect accuracy needs a level well above the test, so the path to fluency on
  easy material is to work on harder material ([perfect]). Careless errors also drop as you get
  better at solving, because solving leaves time to compute ([faq-contest] C-8).
- **Insight comes from problems just past your reach, followed by reflection.** He wants suspense
  ([success]), misses "by a little" ([platitudes]), and the question "how could I have thought of
  that?" ([solread]). Learning is the update to your instincts after a problem, which is why he
  always says to read the solution.
- **Novel problems need understanding, not pattern matching.** His recurring failure mode is
  matching surface features ([gpt3], [imperative], [type]) or rushing to extract the answer
  ([getting-to-know]). The cure is soft techniques: small cases, examples, equality cases, guessing
  the answer ([hard-and-soft]), and understanding a fixed structure before attacking the goal
  (Rigid, [design]). Hard problems are mostly about finding *what* to prove ([geo-advice], [solread]).
- **Understanding is intuitive.** Mastery means the idea lands in fast intuition, not only in
  step-by-step checking ([sys1]). Many advanced skills can't be put into words: when a problem
  "feels projective", whether you're making progress ([lessons], [np-hard-advice]). These come only
  from many examples, and he teaches them as named themes so students can recognize the feeling
  ([solread], [design]).
- **Automaticity does matter: it frees attention.** His Hanabi account shows conventions becoming
  automatic and freeing attention for strategy and look-ahead ([hanabi], [foresight]). Fundamentals
  must be mastered before fancy named theorems help ([lessons]). Geometry is the subject where
  known configurations give the biggest advantage, and combinatorics the least ([geo-advice]).
  Some things he admits he can't train: truly novel ideas like the windmill ([design]).
- **Experience is the teacher.** There is no recipe for meta-skills ([np-hard-advice]); more games
  beat a specific fix ([no-advice]); experts' surprising moves are the best data ([most]).

### (b) His taste in problems and how sets should be built

- **Good problems** ([ProblemWrite] handout, [exercises]): a short natural statement that invites
  play; a surprising truth; one main a-ha and a short, low-tech solution; depth and connection to
  other ideas; instructive and a fair test of understanding; possible to make progress on; fresh;
  memorable (he likes problems named "IMO 2008/3", which gives them an identity).
- **Bad problems:** heavy computation or casework as the whole content; one-trick problems where
  you either know the trick or waste hours learning nothing ([pset]); stale tricks recited from
  memory, his example being Vieta jumping (handout); artificial expression-pushing like most
  functional equations, which he dislikes and finds hard to teach because they lack a main idea
  ([design], [coaches], [faq-contest] C-25); problems only an obscure syllabus item unlocks. He
  also rejects the opposite: problems pinned to a rigid syllabus that punish flexibility
  ([brianchon]). Contests should be neither trivia nor IQ tests ([non-zero-sum]).
- **"Bash" is a tool, not a sin.** Coordinates are a reliable fallback; the skill is judging
  whether a computation will finish, and the best solvers mix methods ([geo-advice],
  [faq-contest] C-14, [foresight]). For writing problems, though, a computational solution counts
  against the problem.
- **How sets should be built:**
  - *Group by one theme,* defined by main idea rather than technique. Interleaving related problems
    hides the shared pattern ([astar], [design]). He cuts handouts to a few problems so everyone
    works the same ones ([astar]). Narrow topics ("looking at equality cases") beat broad ones
    ([per-hour]). (Note the tension with interleaving research; Evan explicitly prefers grouping
    for teaching a theme and leaves mixed practice to the Shortlist.)
  - *A pool with a points target,* not "solve all": weighted problems, a target well under 100%,
    the best problems marked, several difficulty versions ([points]).
  - *Write full solutions* that put the main idea first ([solread], [exercises], [otis]).
  - *For tests:* judge the paper as a whole; a third of it gettable but not gimmes ([apology]);
    balance attractive problems against difficulty and subject spread, without rigid rules
    ([usemo-dev]).

### (c) Hints, struggle, time per problem, reading solutions

- **Time:** at least about an hour before giving up. After that, stop when progress stops (1–2
  hours stuck, or about three hours of nothing), or when it stops being fun. Many hours are fine
  while you're finding things ([success], [faq-contest] C-12, C-27). A problem teaches more in its
  first hour than in the next six ([pset]). Keep several problems going at once.
- **Struggle is good up to a point.** Both too-early and too-late quitting are failures. He thinks
  his students more often quit too late ([otis], [platitudes]). He dislikes the school culture that
  calls giving up lazy ([pset], [points]).
- **Hints:** OTIS has a database of pre-written hints and full solutions students can get with no
  human involved, so they don't feel guilty ([otis], [EXCL]). His camp regret: hints that became
  solution outlines mean the problem was too hard ([astar]). At camp he will intervene directly
  when a student pursues a false claim ([most]).
- **Reading solutions:** always read them after stopping ([faq-contest] C-12). Never read line by
  line; find the one or two key ideas and summarize in a couple of sentences; if you need every
  line, the problem was too hard; don't read solutions to problems you haven't tried; then ask how
  you could have found it, including soft techniques ([solread], [hard-and-soft], [platitudes]).
  The best feedback loop is attempt, then a well-written solution ([exercises]).

### (d) Difficulty scales and sequencing

- **Difficulty is personal and volatile.** Problem numbers mislead, and only difficulty for you
  matters ([faq-contest] C-15, C-20). Judging it well needs actually trying the problem ([mohs]).
- **MOHS:** a 0–50 scale meant to help beginners and coaches pick problems ([mohs-scale]). Five
  years later he says advanced students should stop using it, since putting numbers on difficulty
  feeds ego arguments, though asking what makes a problem hard is useful ([mohs]). He also refuses
  to give targets like hours per day ([faq-contest] C-29). For test review he uses coarse,
  intuitive difficulty buckets because finer scales measure how people read the scale
  ([usemo-dev]).
- **Calibration:** pick problems by suspense; "just try it and see" is the readiness test
  ([success], [faq-contest] C-6). He uses his own surprise at low scores as a teaching signal
  ([design], [mohs]).
- **Sequencing:** loose. No ordered book list; get oriented, then explore ([town]). Order of study
  has small effects next to energy and enjoyment ([generic], [faq-contest] C-7, C-17). OTIS lets
  students choose units, with no deadlines, over a fixed course, because "these students know
  themselves" better than he does ([otis]). The structure that remains: three difficulty tracks;
  an unlock rule (finish current units to open new ones) that limits procrastination rather than
  enforcing order ([otis]); fundamentals before fancy theorems ([lessons]); and EGMO's first three
  chapters as the core ([faq-contest] C-28). Within a lesson he sequences tightly around one theme
  ([astar], [design]).

### (e) Rusczyk, AoPS, adaptive systems

- **No views found on adaptive learning or on AoPS's sequenced-curriculum philosophy as such.** We
  searched all blog posts and site pages for "adaptive", "Alcumus", "Khan", "spaced repetition".
  The nearest positions:
  - He recommends AoPS books and classes for AMC/AIME-level students ([faq-contest] C-2,
    [platitudes]).
  - He is sceptical of prescription in general: claimed population effects don't help one student
    ([generic]); he doubts anyone knows how study choices affect outcomes ([faq-contest] C-4).
  - He relies on student choice plus coarse structure rather than algorithmic routing ([otis]).
  - He worries that giving specific answers teaches students to outsource learning ([no-advice]),
    and celebrates students teaching themselves ([agency]).
  - His only engineering for scale is infrastructure, gamification (levels, achievements, unlocks)
    and self-serve hints ([otis], [rpg]).
- **Rusczyk.** Cited approvingly as: valuing problem solvers everywhere, not just in research
  ([mantra]); a mentor becoming a guide for great students ([otis]); a job that is mostly email
  ([otis]); decentralized education policy, since one central planner's mistake harms a whole
  generation ([poset], which Evan extends to enrichment programs as a poset of teammates); students
  rewarded for writing gibberish ([k12]); large variance in work quality among students who look
  identical in school ([variance]); teaching as the route to complete understanding ([writing]). He
  also notes that Rusczyk credits geometry problems with training him to run a business ([pset]).
  Rusczyk asked him at AMM 2026 what the ecosystem is missing ([after-amm-2026]).
- **AI and automated systems.** Measured: impressed by AlphaGeometry's readable, verifiable
  hybrid design ([jan-2024]); medal comparisons distract ([coord]); AI benchmarks invert human
  contest criteria ([frontiermath]); AI might one day give proof feedback but isn't reliable yet
  ([after-amm-2026]). He uses "GPT-3" as a name for mindless pattern matching ([gpt3]) and found
  ChatGPT drafts of solutions needed cutting by half or more ([words-spent]).

### What this suggests for inkit (brief)

These are inferences, not Evan's words:
- Sort and present practice by the *idea* that cracks a puzzle (his themes), not by surface
  features. Group a few related puzzles to teach an idea; save mixed practice for later.
- Prefer a pool with a target and a few highlighted puzzles over "complete all". Count solves up,
  never misses.
- Offer self-serve hints and full solutions without friction or shame, and make solutions lead
  with the key step.
- Calibrate by "suspense", not a public numeric rating. If we show difficulty, keep it coarse and
  for picking puzzles, not for identity.
- Let players choose freely within coarse tracks. Use unlocks to fight procrastination, not to
  force an order.
- Watch for puzzles players find much harder than expected. That gap marks an idea worth teaching.

---

## 4. Sources

Blog (all at `https://blog.evanchen.cc/<slug>/`, Markdown source at
github.com/vEnhance/blog.evanchen.cc):

[success]: https://blog.evanchen.cc/success/
[perfect]: https://blog.evanchen.cc/perfect/
[platitudes]: https://blog.evanchen.cc/platitudes/
[hard-and-soft]: https://blog.evanchen.cc/hard-and-soft/
[geo-advice]: https://blog.evanchen.cc/geo-advice/
[sys1]: https://blog.evanchen.cc/sys1/
[exercises]: https://blog.evanchen.cc/exercises/
[no-advice]: https://blog.evanchen.cc/no-advice/
[agency]: https://blog.evanchen.cc/agency/
[generic]: https://blog.evanchen.cc/generic/
[town]: https://blog.evanchen.cc/town/
[np-hard-advice]: https://blog.evanchen.cc/np-hard-advice/
[brianchon]: https://blog.evanchen.cc/brianchon/
[getting-to-know]: https://blog.evanchen.cc/getting-to-know/
[write-well]: https://blog.evanchen.cc/write-well/
[most]: https://blog.evanchen.cc/most/
[foresight]: https://blog.evanchen.cc/foresight/
[gpt3]: https://blog.evanchen.cc/gpt3/
[astar]: https://blog.evanchen.cc/astar/
[pset]: https://blog.evanchen.cc/pset/
[per-hour]: https://blog.evanchen.cc/per-hour/
[solread]: https://blog.evanchen.cc/solread/
[design]: https://blog.evanchen.cc/design/
[lessons]: https://blog.evanchen.cc/lessons/
[apology]: https://blog.evanchen.cc/apology/
[points]: https://blog.evanchen.cc/points/
[non-zero-sum]: https://blog.evanchen.cc/non-zero-sum/
[rpg]: https://blog.evanchen.cc/rpg/
[k12]: https://blog.evanchen.cc/k12/
[otis]: https://blog.evanchen.cc/otis/
[mohs]: https://blog.evanchen.cc/mohs/
[rubrics]: https://blog.evanchen.cc/rubrics/
[mulitvar]: https://blog.evanchen.cc/mulitvar/
[variance]: https://blog.evanchen.cc/variance/
[writing]: https://blog.evanchen.cc/writing/
[mantra]: https://blog.evanchen.cc/mantra/
[poset]: https://blog.evanchen.cc/poset/
[words-spent]: https://blog.evanchen.cc/words-spent/
[hanabi]: https://blog.evanchen.cc/hanabi/
[type]: https://blog.evanchen.cc/type/
[imperative]: https://blog.evanchen.cc/imperative/
[usemo-dev]: https://blog.evanchen.cc/usemo-dev/
[mohs-scale]: https://blog.evanchen.cc/mohs-scale/
[frontiermath]: https://blog.evanchen.cc/frontiermath/
[jan-2024]: https://blog.evanchen.cc/jan-2024/
[coord]: https://blog.evanchen.cc/coord/
[after-amm-2026]: https://blog.evanchen.cc/after-amm-2026/
[faq-contest]: https://web.evanchen.cc/faq-contest.html
[coaches]: https://web.evanchen.cc/coaches.html
[ProblemWrite]: https://github.com/vEnhance/web.evanchen.cc/tree/main/handouts/ProblemWrite
[EXCL]: https://github.com/vEnhance/web.evanchen.cc/tree/main/handouts/EXCL-2023-11-04-slides

- Learning: [success], [perfect], [platitudes], [hard-and-soft], [geo-advice], [sys1],
  [exercises], [no-advice], [agency], [generic], [town], [np-hard-advice], [brianchon],
  [getting-to-know], [write-well], [most], [foresight], [gpt3].
- Teaching: [astar], [pset], [per-hour], [solread], [design], [lessons], [apology], [points],
  [non-zero-sum], [rpg], [k12], [otis], [mohs], [rubrics], [mulitvar], [variance],
  https://blog.evanchen.cc/parallelograms/, https://blog.evanchen.cc/cubics/.
- Essays and others: [writing], [mantra], [poset], [words-spent], [hanabi], [type],
  [imperative], https://blog.evanchen.cc/wander-geo/, https://blog.evanchen.cc/book-pitch/,
  https://blog.evanchen.cc/slice/, https://blog.evanchen.cc/pride/,
  https://blog.evanchen.cc/meritocracy/, https://blog.evanchen.cc/grief/,
  https://blog.evanchen.cc/mop-speech/, https://blog.evanchen.cc/publishing/,
  https://blog.evanchen.cc/amm-2026/.
- Problem development and AI: [usemo-dev], [mohs-scale], [frontiermath], [jan-2024], [coord],
  [after-amm-2026], https://blog.evanchen.cc/puzzle-writing/, https://blog.evanchen.cc/puzzles/.

Website (`https://web.evanchen.cc/`, source at github.com/vEnhance/web.evanchen.cc/input):
[faq-contest], https://web.evanchen.cc/wherestart.html, [coaches],
https://web.evanchen.cc/otis.html, https://web.evanchen.cc/excerpts.html,
https://web.evanchen.cc/faq-raqs.html, https://web.evanchen.cc/contact.html,
https://web.evanchen.cc/recommend.html, https://web.evanchen.cc/problems.html.

Handouts (LaTeX source): [ProblemWrite], [EXCL].

Not read (PDF, unparseable by WebFetch): MOHS hardness scale
(https://web.evanchen.cc/upload/MOHS-hardness.pdf), OTIS syllabus
(https://web.evanchen.cc/upload/otis-syllabus.pdf), OTIS Excerpts, EGMO, Napkin, the
*Intro to Proofs for the Morbidly Curious* handout.
