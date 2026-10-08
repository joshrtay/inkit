# Research: reputation for solvers and creators

The question: how should inkit give people standing for (a) **the difficulty of the puzzles they
solve** and (b) **the quality of the puzzles they make**, in a way that motivates (kids included),
survives small numbers, and is hard to game, with AI creators in the mix?

This doc has three parts: **what other systems do** (facts, sourced), **a proposal for inkit**
(clearly marked as proposal), and **how to show it on a profile** (with mockups in
`docs/reputation-mockups/`). See also `docs/research-interestingness.md` (the deduction solver D and
the quality instruments a creator score can borrow) and `docs/ai-creators.md`.

**What inkit records today** (checked in the code, October 2026):
- `likes(creator_id, game_id, created_at)` and `solves(creator_id, game_id, created_at)`, one row
  per person per puzzle; authors can't solve their own (`app/app/db/schema.ts`).
- **No solve duration is stored on the server.** `GameHost.solved(result?)` (`src/lib/game-api.ts`)
  carries no time, and the `solves` row has only a timestamp. If solve times exist, they're on the
  client only; phase 0 below adds them. Nothing records starting a puzzle, giving up, or using
  checks, hints or resets.
- AI accounts are `creators.is_ai`. Accounts are for people 13 and over; a parent can make and manage
  one for a younger child (`app/app/routes/privacy.tsx`).

---

## Part 1. What others do (facts)

### Stack Exchange: reputation from votes

- **Mechanics.** Upvotes on answers and questions are worth +10 each, and downvotes cost −2. There is
  a **cap of 200 reputation a day** from votes and suggested edits. Accepted answers, bounties and
  association bonuses are exempt ([help: reputation](https://stackoverflowteams.com/help/whats-reputation);
  [cap announcement, 2008](https://stackoverflow.blog/2008/12/31/daily-dose-of-daily-reputation-ca/)).
- **Values have been re-tuned retroactively, twice.** Question upvotes fell from +10 to +5 in 2010,
  to "encourage people to provide the best possible answers"
  ([2010](https://stackoverflow.blog/2010/03/19/important-reputation-rule-changes/)), and went back
  to +10 in November 2019, recalculated for everyone
  ([2019](https://stackoverflow.blog/2019/11/13/were-rewarding-the-question-askers/)). Lesson: the
  constants will be wrong at first. Store the raw events so scores can be recomputed.
- **Privileges by reputation.** Voting up, voting down, editing and closing unlock at thresholds,
  and the privileges page shows your progress to each
  ([2010](https://stackoverflow.blog/2010/10/07/membership-has-its-privileges/)). A 2013 paper lists
  15 to vote up and 125 to vote down
  ([JSAI 2013](https://ai-gakkai.or.jp/jsai2013/webprogram/2013/pdf/829.pdf)). Current thresholds
  vary by site.
- **Bounties.** You attach 50 to 500 of your own reputation to a question. It's paid up front and
  isn't refundable, and you can have at most three active
  ([help: bounty](https://stackoverflowteams.com/help/bounty)). Reputation works as a currency here,
  not just a score.
- **Badges.** Bronze, silver and gold, for specific behaviours, some repeatable. Example: "Curious"
  (bronze) for well-received questions on 5 separate days, "Inquisitive" (silver) for 30 days
  ([badges](https://kompas.wasmer.app/http_unix_stackexchange_com/help/badges), a mirror of the help
  page).
- **What goes wrong.**
  - *Fastest gun in the west*: early answers collect votes and stay on top, even when a better answer
    comes later. Fixes proposed include shuffling answer order and hiding authors for the first hours
    ([HN discussion](https://home5.southeastasia.cloudapp.azure.com/item?id=1127413); community
    reports, not a study).
  - *Reputation as a lifetime sum*: old posts keep earning, so totals mostly measure tenure. (This is
    an inference from the formulas. Stack Exchange has never capped lifetime totals.)
  - *Gaming*: serial voting and sockpuppets. A daily script reverses "anomalous voting patterns",
    most often one user voting on many of your posts in a short time. Sockpuppet accounts used for
    voting are deleted and their votes cancelled. The company won't publish thresholds, so people
    can't optimise around them ([2009](https://stackoverflow.blog/2009/03/21/more-voting-anomalies/);
    [help: serial voting reversed](https://stackoverflowteams.com/help/serial-voting-reversed)).
    Researchers have catalogued fraud types such as voting rings, and detect them by looking for
    isolated communities that mostly vote for each other, and for sudden jumps in reputation
    ([Reputation Gaming in Crowd Technical Knowledge Sharing, arXiv 2111.07101](https://arxiv.org/html/2111.07101v2)).

### Reddit karma

- Karma is the sum of votes. Subreddits use minimum karma as a spam gate, so **karma itself becomes
  the target**. Bots repost old popular posts to farm it, then the accounts are used for spam or sold
  (BotDefense, quoted in a [moderator wiki](https://red.applefritter.com/r/KarmaBotKillers/wiki/index);
  an open-source [karma-farming bot](https://hub.docker.com/r/nelinski/reddit-karma-farming-bot)).
  The evidence is anecdotal, from moderators, but consistent.
- **Lesson:** an unweighted vote total, plus privileges that unlock at a threshold, creates a market
  for fake accounts. Weight votes by who casts them, and don't gate anything valuable on raw totals.

### Rating systems for solving

- **Lichess puzzles (Glicko-2).** Each attempt is a game between you and the puzzle. If you solve
  it, your rating goes up and the puzzle's goes down; how much depends on both ratings and both
  rating deviations. Themed puzzles give fewer points, "as the theme gives a significant hint". New
  puzzles are volatile ([Lichess blog: new puzzles](https://lichess.org/blog/X-S6gRUAAGjNX4ki/new-puzzles-are-here)).
  A puzzle's rating "usually stabilises after around 20-30 attempts", and in 2024 the puzzle
  deviations were reset high when ratings drifted (a forum summary; the
  [lila source](https://mintlify.com/lichess-org/lila/features/puzzles) has the constants). The
  puzzle dashboard has a radar of per-theme performance and lists strengths and "improvement areas"
  ([API docs mirror](https://www.mintlify.com/lichess-org/lila/api/puzzles/dashboard);
  [forum](https://lichess.org/forum/general-chess-discussion/puzzle-dashboard-2)).
- **Chess.com puzzles.** Your rating moves with each puzzle's difficulty relative to you, and a hint
  counts as a failed attempt. A new puzzle's rating is set by who solves it, then **locked** after a
  set period. A target time and a speed bonus are shown, but the help pages don't say speed changes
  your rating ([chess.com help](https://support.chess.com/en/articles/8602396-how-do-puzzle-ratings-work)).
- **Codeforces.** Elo-like contest ratings with coloured titles: Newbie (grey, under 1200), Pupil
  (green), Specialist (cyan), Expert (blue), Candidate Master (violet), Master and International
  Master (orange), Grandmaster and above (red) ([community table](https://codeforces.com/topic/68229/en9)).
  Since 2020, new accounts *show* 0 but are *computed* from 1400, so early contests give big visible
  gains instead of early losses (discussed on [Mirzayanov's blog](https://codeforces.com/blog/entry/77890);
  the exact boosts weren't verified, the page returned 403). Community analysis says the scheme has
  biases ([blog](https://codeforces.com/blog/entry/18734)).
- **LeetCode contest rating.** Elo-style and based on expected rank. The official formula isn't
  published, and the community rebuilds it ([LeetCode discuss](https://leetcode.com/discuss/general-discussion/268476/how-is-rating-calculated-on-leetcode)).
  A community project rates **individual problems** by fitting Elo and maximum likelihood to contest
  results ([zerotrac/leetcode_problem_rating](https://gittrend.io/repo/zerotrac/leetcode_problem_rating)).
  That is a good precedent for estimating puzzle difficulty from who solved it.
- **Project Euler.** Each problem shows a difficulty percentage and a solver count, and problems
  can be sorted by either ([solver's tracker](https://euler.stephan-brumme.com/progress);
  [Wikipedia](https://en.wikipedia.org/wiki/Project_Euler)). I couldn't find PE's formula. It's
  widely believed to come from solve data, but that's unverified.
- **Advent of Code.** In October 2025 the creator dropped the **global leaderboard** and kept
  private ones, discouraging sharing them widely. He called it "one of the largest sources of stress
  for me, for the infrastructure, and for many users". He said people went "way outside the spirit
  of the contest", including DDoS attacks, and that many "incorrectly concluded that they were
  somehow worse programmers" by comparing times
  ([announcement, via Tildes](https://tildes.net/~comp.advent_of_code/1qub/changes_to_advent_of_code_starting_this_december);
  [Wikipedia](https://en.wikipedia.org/wiki/Advent_of_Code)). Coverage also says AI-assisted
  solvers were finishing in seconds ([byteiota](https://byteiota.com/advent-of-code-2025-12-days-no-leaderboard-why/)).
  This is the most relevant precedent for inkit, which has AI and kids.
- **Duolingo XP and leagues.** Critics, a hobbyist newsletter among them, say leagues reward XP
  volume over learning: "doing well in your league often means not doing well in your language"
  ([Duoplanet](https://newsletter.duoplanet.com/posts/has-duolingo-finally-fixed-xp);
  [essay](https://linksiwouldgchatyou.substack.com/p/when-gamification-goes-too-far)). Streaks have
  better evidence. Duolingo reports that letting learners hold two Streak Freezes raised daily active
  learners by 0.38%, citing research that a little slack motivates more than rigid rules
  ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). I found no
  peer-reviewed study of leagues' effect on learning.

### Creator-quality systems

- **Puzzle Square JP.** It shows likes and solver counts per puzzle, and bay-puz/psjp publishes them
  (MIT). `docs/research-interestingness.md` already plans to use likes per solver as a quality signal
  and solver counts as a difficulty one. I couldn't verify how the site uses them in its own rankings.
- **puzz.link / pzv.** These are players and an encoding (puzzles as URLs), with no ratings. One
  author notes that puzzles shared this way lose their author and origin
  ([GM Puzzles post](https://www.gmpuzzles.com/blog/wp-json/wp/v2/posts/10828)). I couldn't confirm
  whether pzv.jp has ratings. Lesson: keep authorship attached to the puzzle, which inkit already does.
- **Logic Masters Deutschland, Rätselportal.** You rate a puzzle's **beauty and difficulty after
  solving it** (you enter a solution code). Comments can be limited to people who solved it, there are
  "nicest puzzles first" sorting and favourites lists, and the Top 100 lists the most productive
  authors and the most industrious solvers. Nothing on the help pages describes an author quality
  score ([tour](https://logic-masters.de/Raetselportal/Hilfe/rundgang.php?chlang=en);
  [search help](https://logic-masters.de/Raetselportal/Hilfe/suchen.php?chlang=en)). A study of the
  LMD data models solve counts, difficulty and satisfaction ratings
  ([NSU abstract](https://nsuworks.nova.edu/student_symposium/2024/program/3)). Lesson: only solvers
  rate, and difficulty and beauty are rated separately.
- **GM Puzzles / Cracking the Cryptic norms.** GM Puzzles posts carry an *estimated* star difficulty
  and three time benchmarks (Grandmaster / Master / Expert, e.g. 6:30 / 9:45 / 19:30 for a 3.5-star
  sudoku). Solvers post their times in the comments and argue about the stars ("felt a lot easier
  than 4 stars") ([example](https://gmpuzzles.com/blog/?p=23878);
  [Star Battle](https://www.gmpuzzles.com/blog/?p=10140)). Here reputation is editorial: the editor's
  curation and the setter's name carry it, not a score. (I found no source for a formal CtC rating
  scheme. Its selection is the hosts' taste.)
- **Steam / Mario Maker.** Steam's store percentage (positive ÷ total) ranks one positive review
  above 48 positive and 1 negative. SteamDB replaced its Wilson-bound rating with a formula that pulls
  low-volume games toward 50% ([SteamDB](https://steamdb.info/blog/steamdb-rating/)). I couldn't find
  a source for Workshop's own ranking. In Super Mario Maker 2, Maker Points come from players playing
  your courses, with weekly and all-time medal ranks for the top 10,000. Medals are relative and can
  be lost ([guide](https://miketendo64.com/2019/07/12/guide-super-mario-maker-2-medal-guide/);
  [infendo](https://infendo.com/super-mario-maker-2-medals/)). Courses show a clear rate. I couldn't
  source exactly how Boos affect points.
- **Letterboxd / Goodreads / IMDb.** Letterboxd changed its weighting because the old one "could be
  swayed (up or down) by a concerted effort or campaign, or because a film was beloved in one region,
  or because superfans were attracted to it first" ([Daily Dot](https://dailydot.com/?p=1348013)).
  IMDb's Top 250 uses a Bayesian average, `WR = v/(v+m)·R + m/(v+m)·C`
  ([explainer](https://neurobiology.substack.com/p/how-imdb-determines-top-250_27)). Goodreads fights
  review bombing by temporarily limiting ratings during unusually high activity, removing ratings
  from such periods, and (since 2026) asking people who rate unreleased books to confirm they've read
  them ([The Bookseller](https://thebookseller.com/news/goodreads-reveals-changes-to-prevent-review-bombing);
  [Publishers Weekly](https://www.publishersweekly.com/pw/by-topic/industrynews/publisher-news/article/93651-goodreads-asks-users-to-help-combat-review-bombing.html)).
  One high-profile case was an author using fake accounts to one-star rivals.

### Research on reputation design

- **Small samples.** Neither net votes nor the plain average works. Sort by the **lower bound of the
  Wilson score interval** ([Evan Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html)),
  or shrink toward the overall mean with a **Bayesian average** (IMDb, above). The lower bound
  punishes newcomers hard (100% of 5 gives ~0.57). The Bayesian average is gentler and needs a prior.
- **Joint skill and difficulty.** *Elo for education*: treat each answer as a match between student
  and item, which estimates both. It's "simple, robust, and effective"
  ([Pelánek 2016, Computers & Education](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)).
  But Elo ratings are biased, and **when items are chosen adaptively from the current ratings, they
  don't converge**. The proposed fix uses two parallel rating chains
  ([Keeping Elo alive, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)).
  *Response times*: van der Linden's lognormal model, `log T_ij = β_i − τ_j + ε`, gives each item a
  time intensity and each person a speed, parallel to two-parameter IRT
  ([van der Linden 2006](https://research.utwente.nl/en/publications/a-lognormal-model-for-response-times-on-test-items/)).
  Extensions add speed sensitivity, and they matter for slow, high-ability people
  ([Frontiers 2021](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.469196/full)).
  **This fits inkit, where nearly every puzzle is eventually solved and time is the signal.**
- **Collusion and sockpuppets.** Collusion does more damage than lone unfair raters. Detection works
  by mining groups that often rate together and by similarity of behaviour
  ([Purdue](https://docs.lib.purdue.edu/ccpubs/495); [URI](https://digitalcommons.uri.edu/ele_facpubs/1464)).
  **SybilRank** spreads trust from known-good seeds through short random walks, because fake
  accounts have few links to real ones. At Tuenti, about 90 to 100% of its most-suspected accounts
  were fake, against about 5% from abuse reports
  ([paper](https://css.csail.mit.edu/6.566/2018/readings/sybilrank.pdf)). VoteTrust gives sybils
  low voting capacity. EigenTrust fails against sybils
  ([arXiv 1211.0963](https://arxiv.org/abs/1211.0963)).
- **Leaderboards and motivation.** In a 16-week class (n≈80), the gamified section with a leaderboard,
  badges and coins showed lower intrinsic motivation, satisfaction and final-exam scores over time.
  The causes proposed include social comparison and mandatory badges
  ([Hanus & Fox 2015, Computers & Education 80](https://doi.org/10.1016/j.compedu.2014.08.019)).
  Other studies find the opposite ([critical review](https://educationaltechnologyjournal.springeropen.com/articles/10.1186/s41239-017-0042-5)),
  so the evidence is mixed. Advent of Code's experience (above) points the same way for public
  speed rankings.
- **Children.** The UK Age Appropriate Design Code requires high-privacy defaults and profiling off
  by default. It bans nudge techniques that lead children to weaken their privacy or "extend use"
  ([ICO code 2.1](https://ico.org.uk/media/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services-2-1.pdf)).
  The US COPPA amendments (compliance from April 2026) require the notice to say if a child's data is
  made public, and require separate consent for most disclosures
  ([Hunton](https://hunton.com/privacy-and-information-security-law/ftc-publishes-final-coppa-rule-amendments)).
  Kids' martial arts uses frequent small steps (stripes between belts) and junior black belts to keep
  children going, and **belts aren't taken away**
  ([belt overview](https://hoop.co.uk/articles/martial-arts/karate/what-karate-belts-can-my-child-get/);
  [junior grades](https://www.englishshotokan.net/childrens-grades-kodomo-tokyu/)).

---

## Part 2. Proposal for inkit

*Everything in this part is a proposal, not established fact.*

### Principles

1. **Two separate standings**, never summed: **solver skill** (from what you solve) and **creator
   standing** (from what others think of what you make). Summing them recreates karma.
2. **Ranks only go up; ratings may move.** The internal estimate can fall. What we show is the
   highest rank you've held, and you can't lose it, as with belts. The Codeforces trick (show 0,
   compute from a prior) is the same idea.
3. **No global public leaderboards** (Advent of Code, Hanus & Fox). Private groups (a family, a
   class) can have one if their owner turns it on.
4. **Store events, not scores**, so we can recompute when the constants change (Stack Exchange did,
   twice).

### Solver skill: a lognormal response-time model per genre

Most inkit puzzles get solved in the end, so pass/fail (Glicko) has little to work with. **Time is
the signal.** Model each genre `g` on its own:

```
log t_ij  =  β_i  −  θ_j  +  ε,      ε ~ N(0, σ_i²)
  t_ij : active solving time of person j on puzzle i (idle and hidden-tab time removed)
  β_i  : puzzle i's time intensity (its difficulty), with a prior from the deduction solver D
  θ_j  : person j's skill in genre g
```

- **Fitting.** Refit nightly by alternating least squares or a small Bayesian fit (each puzzle with
  ≥3 solves). It costs little at inkit's scale. Between refits, update online like Elo/Glicko so a
  solve gives instant feedback. Keep an uncertainty per person and per puzzle, like Glicko's RD.
- **Size.** Use the puzzle's own size: a 4×4 and a 10×10 Sudoku share θ but differ in β. Fit β
  with `log(cells)` and D's profile (hardest step, steps by window size) as covariates. A new puzzle
  starts there, so it has a difficulty before anyone solves it, and AI puzzles do too.
- **Giving up** is information: an abandoned attempt means `t > t_seen`. Use it as a censored
  observation (Tobit-style) instead of dropping it. Hints, checks and reveals count like Chess.com's
  hints: an assisted solve is a censored or down-weighted observation.
- **First solve only.** Replays don't count (the solution is known).
- **Shown rank.** Map θ (with uncertainty) to a **kyu/dan** scale per genre. Start at 20 kyu and
  rise in small steps (Go convention: 30k→1k→1d…). For kids, one step should come every few
  solves at first, like stripes on a belt. Shown rank = max over time of `θ − 2·RD`, so it's
  conservative and never drops. An **overall** rank is the mean of your best genres, weighted by
  how sure we are of each.
- **Puzzle difficulty shown to everyone.** β_i as stars or a "typical time" range (GM Puzzles shows
  times). This is the first public output and helps people pick puzzles.
- **Watch for** the adaptive-selection drift (Keeping Elo alive). If inkit recommends puzzles from
  θ, fit β from a second chain or the nightly batch, not the online one.

### Creator standing: quality per puzzle, shrunk, weighted, then pooled

**Per puzzle** (genre-relative):

```
q_i = (Σ w_k · like_k + m·μ_g) / (Σ w_k + m)      over solvers k of puzzle i
```
- Only **solvers** count, as at LMD. A like without a solve gets weight 0.
- `μ_g` is the genre's mean like rate. Set `m` around 10 solves, so a puzzle needs real solves to
  stand out (Bayesian average, as IMDb does; gentler than Wilson for new creators).
- **Weight `w_k`** of each solver: trust from account age and their own solve history, scaled by
  `1/(1 + likes they've given this creator in the last 90 days)` so friends and superfans add less,
  and **0.3 for subscribers** of the creator and members of the same studio or family group. Use a
  SybilRank-style trust seeded from long-standing solvers to find clusters of new accounts that only
  like each other.
- Add instruments not based on likes, with small weights: the **completion rate** (solved ÷ started,
  which needs phase 0) and, later, the interestingness score from `research-interestingness.md`
  (validated against likes). Don't penalise hard puzzles: compare completion with β_i.

**Per creator.** Pool q_i over their published puzzles with a second shrinkage (`m` ≈ 5 puzzles).
Show **crests**: count each puzzle whose `q_i` lower bound clears a bar ("well liked"). A count of
good things rewards range without rewarding volume, unlike a sum of likes. Old puzzles keep their
crests, but nothing compounds.

**AI creators.**
- Compute the same scores. They're useful inside the generator: `puzzles/ai/week.ts` scoring and
  T9 in the interestingness agenda.
- **Rank them separately.** Show their crests on their profiles with the AI badge, but leave them
  out of any human lists ("creators to follow", featured creators by standing). There are three
  reasons. Their output volume is set by a schedule, not by effort. Comparing a kid's first puzzle
  with a tuned generator discourages the kid, the way AI times did at Advent of Code. And their
  likes are a training signal we don't want people gaming.
- AI accounts can't solve puzzles or like them (they can't sign in), so they don't touch solver
  ratings.

### Public, private, privileges

| | Public (adults, default) | Only you (and a managing parent) |
|---|---|---|
| Solver | overall rank seal; top 3 genre ranks; solve count | per-genre θ and uncertainty, times, history, giving-up stats, the calendar |
| Creator | crests; puzzles and solves on them; per-puzzle difficulty stars | q per puzzle, the like rate, completion rates, where people gave up |
| Kids' accounts (parent-managed) | **nothing beyond name, avatar and puzzles** unless the parent turns on "show rank" | everything above |

**Privileges:** keep them light. A reputation privilege makes reputation worth farming, as Reddit's
karma gates do. Suggested ones:
- solvers' likes carry more weight as their trust grows (invisible);
- creators with N crests can *nominate* puzzles for Featured (an admin still decides);
- difficulty and beauty ratings, later, need a solve and some skill in that genre.

No moderation powers come from reputation.

### Anti-gaming

1. **Implausible solves**: active time below a floor (for example under 25% of the genre's fastest
   for that β), or input with no wrong moves at machine speed, is held back from ratings and shown
   as "solved" only. Solutions pasted from outside can't be detected otherwise.
2. **One update per person per puzzle**, first solve only. Authors are already excluded.
3. **Likes need a solve.** Weights as above. A reciprocal-liking check ("A and B like ≥80% of
   each other's puzzles") flags pairs for review, and their weight drops automatically.
4. **Daily caps** on standing changes (Stack Exchange's 200 a day), and Goodreads-style **rate
   limiting** when a puzzle gets unusually many likes from new accounts.
5. **Don't publish the thresholds** (Stack Exchange's reasoning), but do publish the principles.
6. **No speed leaderboards.** Speed matters in θ, but it's never ranked publicly against other
   people. That limits the incentive to cheat or use AI.

### Kids

- Parent-managed accounts get every public display **off by default** (ICO code: high privacy by
  default). A parent turns on "show my child's rank".
- **No streaks that punish.** If a calendar exists, missing days look like blank paper, not broken
  chains. There are no "you'll lose your streak" notifications (ICO: no nudges to extend use).
- **No losses shown.** Ranks only go up, and difficulty is described as "a stretch for you", not
  "you're behind".
- **Compare with yourself**: "this took you 4 min; last month a puzzle like it took 9."
- **Beginner puzzles count.** The lowest ranks are reachable on 4×4s and in minutes.

### Phased rollout

| Phase | Ships | Data needed | Gate to move on |
|---|---|---|---|
| **0. Instrument** (now) | Record `started_at`, active ms, idle ms, checks/hints/resets/reveals, gave-up (left without solving after ≥1 min), device class; require a solve before a like | new `attempts` table (person, game, started, active_ms, outcome, assists) | 4–8 weeks of data |
| **1. Shadow** | Fit β and θ offline per genre; compute q_i | ≥30 people with ≥10 solves in a genre; ≥5 solves on the puzzles | β predicts held-out log times (R² better than size-only); β agrees with D (Spearman ≥0.5); q stable under bootstrap |
| **2. Puzzle difficulty, public** | Stars or a typical time on every card; "a good next puzzle" picks | phase 1 | creators and solvers don't object (test with a few) |
| **3. Private skill** | Your rank seal and per-genre ranks, shown only to you and a managing parent | phase 1 per genre | fewer people stopping after a hard puzzle |
| **4. Creator crests** | Crests on profiles; nominations for Featured | q_i with weights; pair/cluster flags reviewed for a month | flags mostly true positives |
| **5. Opt-in public** | Adults can show a seal; groups can have private boards | — | — |

---

## Part 3. Showing standing on a profile

### What good profiles do (facts)

- **Stack Exchange**: one big number (reputation) plus gold, silver and bronze badge counts, and a
  progress bar to the next privilege ([privileges](https://stackoverflow.blog/2010/10/07/membership-has-its-privileges/)).
  Badges name *behaviours*, so they tell you what to try next.
- **GitHub**: a year of daily cells shaded by activity. In 2016 GitHub **removed streaks** to focus
  "on the work you're doing rather than the duration of your activity". Private work shows only if
  you opt in, and then anonymised ([GitHub blog](https://github.blog/news-insights/product-news/more-contributions-on-your-profile)).
  Some people missed the streaks and rebuilt them with extensions
  ([TNW](https://thenextweb.com/news/github-streaks-dead-thank-the-sun-god)).
- **Lichess/chess.com**: a rating graph over time and, for puzzles, a per-theme radar with
  strengths and "improvement areas" (sources above).
- **Duolingo**: the streak number is the headline, with a Streak Freeze for slack. Leagues are weekly
  and relative (sources above).
- **Strava**: each activity can be Everyone, Followers or Only You. Only-you activities stay off
  leaderboards and profile stats, but you still see your own segment times
  ([Tom's Guide](https://tomsguide.com/wellness/fitness/how-to-adjust-your-strava-privacy-settings)).
  This is a good model for "private progress".
- **Letterboxd**: (Pro) all-time and yearly stats pages: overview by week, top decades, genres,
  milestone lists. A year page needs at least ten films logged
  ([welcome](https://letterboxd.com/welcome/)). That's a sensible minimum before showing a summary.
- **Codeforces**: the rank *title and colour* on your handle everywhere ("Expert", in blue), which
  makes standing visible at a glance ([table](https://codeforces.com/topic/68229/en9)).
- **Martial arts**: kids' belts add stripes between colours, and junior black belts exist. Ranks are
  stepped and frequent, and never removed (sources above).
- **Go**: 30 kyu up to 1 kyu, then 1 dan up. One rank is worth about one handicap stone, so the rank
  *means* something you can feel across the board
  ([Wikipedia: Go ranks](https://en.wikipedia.org/wiki/Go_ranks_and_ratings)).

### Four concepts for inkit

Mockups are in `docs/reputation-mockups/` (static HTML, the site's tokens and fonts, inline SVG),
each showing a kid solver (**Mika**, 9, parent-managed) and an adult creator (**Tomás**). The
screenshots are next to them.

**A. Hanko: a brushed rank seal** (`a-hanko.html`)
- *Shows:* a red seal stamp with your overall rank (十五級, "15 kyu", with "15k" beside it for people
  who don't read Japanese), an ensō that fills toward the next rank, and small seals for your top
  genres. Creators get a second seal, 作 ("made"), with the crest count.
- *Why it motivates:* one clear thing, stamped like a certificate. Early steps come every few solves.
  It never goes down.
- *Private:* the rating behind it and the per-genre list beyond the top three. Kids' seals are
  hidden from others by default.
- *Little data:* before 5 solves, an empty ensō: "Solve 5 puzzles to get your first seal." A genre
  seal appears only after 5 solves in that genre.

**B. Sumi calendar: solves as ink washes** (`b-calendar.html`)
- *Shows:* 26 weeks of days, each a wash that's darker the harder the hardest puzzle solved that day
  was (β, relative to *you*). Under it, a row of the creator's published puzzles as washes coloured
  by genre, with a crest on the well-liked ones.
- *Why it motivates:* GitHub's graph without streaks, so blank days are just paper. Dark washes
  celebrate stretching, not volume.
- *Private by default for everyone* (it shows when you're online). Adults can share it.
- *Little data:* fewer than 10 solves shows a single sheet with the washes so far and no empty
  grid of months.

**C. Genre board: stones on a Go board** (`c-board.html`)
- *Shows:* a small Go board where each row is a genre. Black stones are your solver rank steps in it
  (one stone per few kyu); white stones are the creator's puzzles in that genre, with a crest stone
  for each well-liked one. Hoshi mark the rank milestones.
- *Why it motivates:* breadth is visible and inviting ("you've never tried Nurikabe": an empty row).
  It shows no comparison with other people.
- *Private:* the exact rank per genre (hover/tap only). Kids: own view only.
- *Little data:* genres you haven't played are faint and labelled "try one".

**D. Kamon cabinet: crests earned** (`d-crests.html`)
- *Shows:* a cabinet of crests. A **creator** earns a crest per well-liked puzzle, its colour the
  genre and its petals 5/6/8 by how well liked. A **solver** earns crests for milestones in a genre
  (first solve, first "stretch" solve, first dan), with the next one outlined in pencil.
- *Why it motivates:* collectible and concrete. The next crest says exactly what to do. Crests are
  never lost.
- *Private:* none of the crests are secret, but the stats behind them are. Kids' cabinets are
  visible to others only with a parent's say.
- *Little data:* a few outlined crests to aim at, the first one easy (solve any puzzle).

### Recommendation

**A + D on the public profile, B and C behind "Your progress" (private).** The seal answers "how good
is this person?" in one glance. The crests answer "what have they done?" and cover the creator side
well. Both only grow, and both read with very little data. The calendar and the board carry the
personal detail that motivates *you*, without being a scoreboard for others. They're the Strava
"only you" layer. Build A first (it needs only θ), D's creator half with phase 4, and B/C with
phase 3.
