# Research: what inkit can borrow from Codewars

Codewars is a site of programming exercises ("kata") that its users write, translate, review and
rank. It has run a community-curated beta process since 2013 with numbers that are published and
have been tuned for over a decade, which makes it the closest working model of what inkit wants:
**solvers who rank up, creators who earn honor, and a crowd that decides a new puzzle's difficulty
and whether it is good enough.**

This doc follows `docs/research-reputation.md` (kyu/dan solver ranks, creator crests, private
progress for beginners, mockups in `docs/reputation-mockups/`). Read that first; this one doesn't
repeat its sources.

- **Part 1** is facts, each sourced. Numbers are from docs.codewars.com as of October 2026, the
  public API, and pages I opened logged out on 9 October 2026.
- **Part 2** maps the facts to inkit. **Part 3** covers what to avoid. **Part 4** is a short
  proposal. Parts 2 to 4 are proposals, not facts.
- Screenshots are in `references/codewars-shots/` (internal reference only; Codewars' own UI and docs
  images, © Codewars/Andela). The table at the end lists each image's source.

---

## Part 1. How Codewars works (facts)

### 1.1 Two scores, kept apart: rank and honor

- **Rank** measures skill only. **Honor** "is mostly an indication of your activity and
  contributions" ([Honor](https://docs.codewars.com/gamification/honor)). They're computed from
  different points and shown separately.
- **Ranks** are 8 kyu → 1 kyu → 1 dan → 8 dan, borrowed from martial arts and Go, and the same
  scale rates both users and kata. Kata only go up to 1 kyu; there are no dan kata. Each pair of
  kyu has a colour: **white** (8–7 kyu, beginner), **yellow** (6–5, novice), **blue** (4–3,
  competent), **purple** (2–1, proficient); dan ranks are black
  ([Kata Ranks](https://docs.codewars.com/curation/references/kata-ranks); colours also in the API).
- **Rank score** (hidden on the profile, visible in the API) comes **only from solving**. Each kata
  rank awards a fixed score and the next rank needs a growing total
  ([Ranks](https://docs.codewars.com/gamification/ranks)):

  | Kata rank | Score awarded | | User rank | Score needed |
  |---|---:|---|---|---:|
  | 8 kyu | 2 | | 7 kyu | 20 |
  | 7 kyu | 3 | | 6 kyu | 76 |
  | 6 kyu | 8 | | 5 kyu | 229 |
  | 5 kyu | 21 | | 4 kyu | 643 |
  | 4 kyu | 55 | | 3 kyu | 1,768 |
  | 3 kyu | 149 | | 2 kyu | 4,829 |
  | 2 kyu | 404 | | 1 kyu | 13,147 |
  | 1 kyu | 1,097 | | 1 dan | 35,759 |
  | | | | 2 dan | 97,225 |

  The docs give the effect as a rule of thumb: a kata **two ranks above you gives ~30%** of a
  level, one above ~12%, your own rank ~5%, one below 1.7%, two below 0.3%, three below 0.09%. So
  farming easy kata raises honor but barely moves rank. Only the **first** completion of a kata
  counts for the overall rank; each language has its own rank too, and a **forfeited** kata
  (you unlocked the solutions) gives nothing.
- **Honor** comes from many sources ([Honor](https://docs.codewars.com/gamification/honor)):

  | Source | Honor |
  |---|---|
  | Solve a kata: white / yellow / blue / purple | 2 / 8 / 32 / 128 |
  | Solve a **beta** kata | 4, then the ranked amount once it's approved |
  | Rank up: 7k 20, 6k 30, 5k 45, 4k 70, 3k 100, 2k 150, 1k 225, 1d 450, 2d 900, 3d 1,800, 4d 3,200, 5d 6,400, 6d 12,800 | |
  | **Author**: publish to beta | 3 |
  | **Author**: approved as white / yellow / blue / purple | 3 / 15 / 75 / 375 |
  | **Author**: kata upvoted / downvoted | +2 / −2 |
  | **Translation** approved: white / yellow / blue / purple | 4 / 16 / 64 / 256 (twice the solve honor) |
  | **Curation**: rank assessment on a beta kata; satisfaction vote | +1 each |
  | Comment upvoted / downvoted | +1 / −1 |
  | Kumite (playground snippet) or fork published | 2 |
  | Solution upvoted as "best practice" or "clever" | 1 |
  | Referral: first 5 / after | 3 / 1 |

  No cap is documented. The only losses are downvotes.
- **Reviewers** are paid explicitly for the risk of a beta kata: solving one is +2 over a normal
  solve, the two votes +1 each, and when the kata is approved they also get the solve's honor and
  rank progress ([Reviewing a kata](https://docs.codewars.com/curation/kata)).

### 1.2 Privileges unlocked by honor

From [Privileges](https://docs.codewars.com/gamification/privileges):

| Honor | Privilege |
|---:|---|
| 25 | Vote on kata satisfaction |
| 50 | Mark another's comment as a spoiler |
| 75 | Estimate the rank of your own beta kata |
| 100 | Assess the rank of a beta kata |
| 300 | **Create kata** |
| 500 | Unmark a spoiler |
| 1,000 / 2,000 / 3,000 | Satisfaction vote counts **2× / 3× / 4×** toward leaving beta |
| 4,000 | Co-author (edit others' kata, under conditions) and **approve translations** |
| 5,000 | Resolve others' comments (e.g. close issues) |
| 6,000 | **Approve a beta kata and set its final rank** |
| 10,000 | Edit locked test cases |

- Co-authoring someone else's kata needs the privilege **and** one of: the kata is in beta
  awaiting approval, the author allows contributions, or it's approved and has an issue or
  suggestion unresolved for over a week. Past contributors can always edit.
- Honor is the only gate. Moderators are a separate, small, **appointed** group (eight named
  people) with tools honor never unlocks: flag cheating solutions, revoke authoring privileges,
  **remove dubious beta votes**, force a satisfaction recount, unpublish broken beta kata
  ([Moderation](https://docs.codewars.com/community/moderation),
  [Tools](https://docs.codewars.com/community/moderation/tools)). Staff (Andela) are admins.
- In 2018 the beta vote needed 50 honor ([wiki, Feb 2018 revision](https://github.com/codewars/codewars.com/wiki/Kata-Beta-Process/116b2d8dc4b550c67b90e95fd72e4ed909e9c091));
  it's 25 now.

### 1.3 The beta process

Every new kata is published **into beta**. Anyone may solve it; solvers with privileges vote.
States shown in the library: *Testing & feedback needed*, *Ranking feedback needed*, *Waiting for
issues to be resolved*, *Awaiting approval* (seen live; see `live-beta-list.jpg`). On 9 October
2026 the library listed **1,566 beta kata**.

**What solvers do** ([Reviewing a kata](https://docs.codewars.com/curation/kata)):
1. **Solve it.** Every later step unlocks only after a solve.
2. **Satisfaction vote**: *Very / Somewhat / Not* satisfied (`docs-solved-satisfaction-vote.png`).
   The guidance: vote on the kata "as a concept", not its open bugs. If it's good but broken, vote
   Somewhat or Very **and file an issue**; don't vote None for fixable problems
   ([Satisfaction rating](https://docs.codewars.com/concepts/kata/satisfaction-rating)).
3. **Rank assessment**: which kyu it should be. The author only proposes an initial estimate
   (at 75 honor). The kata page shows the count and the average, highest and lowest assessed rank
   (`live-beta-kata-votes.jpg`). Reviewers are asked to "consider a broader picture than just
   their own skills" ([Reviewing guidelines](https://docs.codewars.com/curation/guidelines/kata)).
4. **Discourse**: comments labelled **Issue** (broken), **Suggestion** (could be better) or
   **Question**, and a **Spoiler** flag. Issues block approval until resolved
   ([Discourse](https://docs.codewars.com/concepts/kata/discourse)).

**When it can be approved** ([Approval & retirement criteria, Feb 2026](https://docs.codewars.com/curation/references/approval-retirement-criteria)):

| Average assessed rank | Min. satisfaction | Votes needed if the author has <10 / <20 / <30 / 30+ approved kata |
|---|---|---|
| White | 80% | 12 / 10 / 8 / 6 |
| Yellow | 80% | 10 / 8 / 7 / 5 |
| Blue | 75% | 8 / 6 / 5 / 4 |
| Purple | 70% | 5 / 4 / 3 / 3 |

- No pending issues; satisfaction at least the minimum; and **either** the raw vote count reaches
  the requirement, **or** at least 3 votes whose **power-weighted** score (1×–4×) reaches it.
- **Harder kata need fewer votes and less satisfaction** (fewer people can solve them).
  **Proven authors need fewer votes.** In 2018 white needed 90% and yellow 85%; both are 80% now
  (wiki revision above).
- A person with the **Approve Kata** privilege (6,000 honor) then reviews it, **sets the final
  rank** (advised to check the assessment breakdown, which is only in an API
  `/api/v1/code-challenges/:id/assessed-ranks` that needs auth) and releases it. Approvers are
  told they "keep responsibility" for issues that slip through.
- **Satisfaction %** counts Somewhat as half. Check: "Valid Braces" shows 91% of 7,575 with 6,414
  Very, 1,032 Somewhat, 129 Not: (6,414 + 516) / 7,575 = 91.5% (`live-kata-approved-satisfaction.jpg`).
  This formula is my inference from the shown numbers, not documented.
- Worked example (live): "Shrinking Prime Powers", 15 solves, 8 votes, 88%, assessed 6–7 kyu
  (average 6 kyu, yellow), status *Awaiting approval*. Yellow needs 80% and 10 votes from a new
  author, so it qualified via the power rule (≥3 votes, weighted score ≥10).

**What removes a kata.**
- **Auto-unpublish**: a beta kata with **two** posts labelled Issue goes back to draft and can't be
  republished while any issue is open ([Reviewing a kata](https://docs.codewars.com/curation/kata)).
- **Auto-retire** (beta only): (a) 4+ votes, all Not satisfied; (b) enough votes to approve but
  satisfaction ≤ half the minimum (e.g. ≤40% for white); (c) it would need **10 or more Very
  votes in a row** to reach the minimum. The page says the feature "needs improvement" and links
  [issue #1672](https://github.com/codewars/codewars.com/issues/1672).
- Retirement is final. A retired kata leaves search, can be reached only by direct link, and
  **everyone keeps the points, rank and honor they earned from it** ("the Honor Guarantee").
- **Approved** kata are retired by hand: moderators log the reason, admins retire it, and the
  description says why and links the replacement. A 4-tier triage (minor → obsolete/duplicate)
  decides whether to fix or retire ([Maintenance](https://docs.codewars.com/curation/maintenance)).

### 1.4 Translations, review and maintenance

- After solving a kata you may **translate** it to another language (privilege-gated). One
  pending translation per language per kata. It's reviewed and approved by the kata's author at
  any time, or by a 4,000-honor user if it's over a week old or the author has been inactive for a
  month, and never by its own translator
  ([Reviewing a translation](https://docs.codewars.com/curation/translation)).
- The translator gets **twice the solve honor**, rank progress in that language, and a co-author
  credit ([Translations](https://docs.codewars.com/concepts/kata/translations)).
- The docs admit "no reliable way to prevent approval of translations of insufficient quality":
  translations have **no beta**, and their comments can't be labelled Issue.
- **Ownership comes with duty**: authors are told "You are responsible for your kata"; approvers
  and translators keep responsibility for what they approved; others may fix a kata only if its
  author is inactive or not maintaining it, or the bug is severe
  ([Authoring guidelines](https://docs.codewars.com/authoring/guidelines/kata)).
- **Quality benchmarks** name examples. Anti-patterns include "troll" kata ranked 8 kyu that need
  research-level maths, vague specs ("guess the test"), duplicates. Gold standards include
  "7x7 Skyscrapers" (yes, the logic puzzle) as a rewarding hard kata. Hard maths in a beginner kata
  should be tagged and warned about in the description
  ([Benchmarks](https://docs.codewars.com/authoring/guidelines/kata-quality-benchmarks)).

### 1.5 Stats boards

**Profile** (logged-out view of the #1 user, `live-profile-top.jpg`, `live-profile-stats.jpg`):
- Header: **rank badge** (a hexagon in the rank colour, "1 kyu"), handle, **honor** as a big
  number, clan, member since, last seen, following / followers / allies, a moderator shield.
- Tabs: Stats, Kata, Collections, Kumite, Social, Discourse.
- **Progress**: rank, honor, **leaderboard position (#1)**, **honor percentile ("Top 0.000%")**,
  total completed kata; languages trained, highest-trained, most recent.
- **Contributions** split in two:
  - *Community*: comments (and replies), collections, kumite, translations (approved),
    contributed kata, **kata approvals**.
  - *Authored kata*: created (in beta), **total completions of your kata (2.76 M)**, **total
    stars (bookmarks)**, total collected, **average rank**, **average satisfaction (84%)**, top tags.
- Signed in, you also see a **rank wheel** (progress to the next rank, "1 kyu / 70.0%") with a
  scrollable per-language list, and an **honor breakdown** as bars by source: completed kata,
  authored kata & translations, kumite, comments, solution upvotes, referrals, achievements
  (`docs-rank-breakdown.png`, `docs-honor-breakdown.png`; [Ranks](https://docs.codewars.com/gamification/ranks)).
- An embeddable **badge** (SVG: rank hexagon, handle, honor) for READMEs (`live-profile-badge-large.svg`).
- The **API** `GET /api/v1/users/:user` returns: honor, clan, `leaderboardPosition`, overall and
  per-language rank `{rank, name, color, score}`, `totalAuthored`, `totalCompleted`. Kata:
  `totalAttempts`, `totalCompleted`, `totalStars`, `voteScore`, rank, languages, approvedBy,
  `contributorsWanted`, unresolved issues and suggestions.

**Kata page** (`live-kata-approved-header.jpg`): rank hexagon, title, completions, author. Stats
at the bottom: warriors trained, **skips**, submissions, completions per language, stars,
**% positive of N votes** and the three vote counts. Beta kata add rank assessment count and
average / highest / lowest (`live-beta-kata-votes.jpg`).

**Leaderboards** (public, logged out): four tabs, **Overall** (honor), **Completed Kata** (honor from
solving), **Authored Kata & Translations** (honor from contributing), **Ranks** (rank score). Each
row: position, rank hexagon, avatar, handle, clan, number (`live-leaderboard-*.jpg`).
- The Overall and Authored boards are nearly the same list: the top 4 overall are the top 4
  authors, and #1 has 445,589 of their 489,191 honor from authoring and translating. Overall #1 is
  **1 kyu**, #2 is 2 kyu, and the 8 kyu account at #58 overall has 55,148 of its 57,337 honor
  from authoring and translating. The Ranks board (all 1–2 dan) is a different set of people.
  **Overall honor is in practice a contribution score.** (Observation from the live boards.)
  The API makes the point in two lines: PG1, #4 overall, has 384,612 honor, is 2 kyu, has solved
  969 kata and authored 152; monadius, #1 on the Ranks board (2 dan, score 209,230), has 126,303
  honor, has solved 10,050 and authored 18.

**Social** ([Following](https://docs.codewars.com/community/following)): follow anyone; mutual
follows are **allies**; your profile has *Following*, *Followers* and *Allies* boards ranked by
honor (`docs-allies-board.png`). You can filter a kata's solutions to people you follow.

**Clans** are a free-text field on the profile. Typing the same name makes everyone in it follow
each other (allies). A clan is created when the first member types it; leaving means clearing the
field (you stay allies until you unfollow). Clans show in leaderboards. There's no clan page,
owner or clan leaderboard in the docs (`docs-join-clan.png`). Common clan names are employers,
schools and bootcamps (live boards: "freeCodeCamp", "University of Oulu", "IIT BHU").

**Kumite** is a playground: post code (optionally with tests), others reply by **forking**, and a
kumite can be **converted to a kata**. Publishing one is 2 honor
([Kumite](https://docs.codewars.com/concepts/kumite)).

**Finding kata**: a personal trainer suggests the next kata by language and focus ("Fundamentals"
for beginners, "Rank Up" for a climb); **skipping is free** and the kata isn't suggested again
([Finding kata](https://docs.codewars.com/getting-started/finding-kata), `docs-training-routines.png`).

### 1.6 What's gone wrong (community record)

Mostly from GitHub issues and discussions on `codewars/codewars.com`, where staff (jhoffner,
co-founder; kazk, lead developer 2017–22) and moderators (hobovsky, Kacarott, Blind4Basics)
answer. Links are `…/issues/N` = `https://github.com/codewars/codewars.com/issues/N` and
`…/discussions/N` likewise. I couldn't reach Reddit (blocked to the tools), so there's no Reddit
sentiment here.

**Beta voting.**
- **Votes without solving.** In 2017 someone voted "somewhat" on many beta kata without solving
  them. jhoffner then required a solve before voting, lowered white/yellow to 80%, and added the
  "4+ votes, 0%" auto-retire ([#1174](https://github.com/codewars/codewars.com/issues/1174)).
- **Satisfaction punishes easy kata and can't recover.** At a 90% bar, one "somewhat" in twelve
  votes sank a kata. Voters "move on" and never revise after a fix. jhoffner found only ~9% of
  ~2,000 stuck kata were held back by satisfaction alone, and suggested a structured exit survey
  in place of the vote (test problems, description problems, duplicate, "did you learn something").
  It was never built. A psychometrician commenter argued the vote measures neither satisfaction
  nor quality because it has side effects ([#1166](https://github.com/codewars/codewars.com/issues/1166)).
- **One vote mixes two questions**, "would I recommend it" and "is it built well"; some power users
  vote Not on any kata without random tests ([#997](https://github.com/codewars/codewars.com/issues/997)).
- **Paying +1 per vote makes people vote anyway**: courtesy "Very" votes, pile-ons before the
  author can respond ([#1672](https://github.com/codewars/codewars.com/issues/1672)); someone
  published a script that clicked "Very" on everything ([#2560](https://github.com/codewars/codewars.com/issues/2560)).
- **Silent downvotes.** One author went from 100% to 50% on a single unexplained vote after three
  days of polishing; authors asked for a required reason, power users refused
  ([#1138](https://github.com/codewars/codewars.com/issues/1138)). Votes can be inferred from the
  order of solves, which has led to sock puppets, vote begging and pressure on downvoters
  ([#3052](https://github.com/codewars/codewars.com/issues/3052)).
- **Auto-retire cuts both ways.** New authors were retired within a day by four silent votes, with
  no undo ([#1672](https://github.com/codewars/codewars.com/issues/1672)); one "Very" vote kept a
  kata at 11% alive ([#1719](https://github.com/codewars/codewars.com/issues/1719)). Requiring four
  solvers to retire handed four working solutions to someone posting homework as kata, so since
  2022 a kata under 48 hours old with two open issues goes back to draft
  ([#2560](https://github.com/codewars/codewars.com/issues/2560), [discussion 2600](https://github.com/codewars/codewars.com/discussions/2600)).
- **The backlog.** A moderator (~2023) counted "multiple thousands" of zero-effort beta kata with
  only a few hundred approvable ([#1672](https://github.com/codewars/codewars.com/issues/1672));
  1,566 are in beta today. Kacarott (2024): "Beta is a punishing environment"; a kata that isn't
  near-excellent at publish rarely recovers, so he proposed a "re-review" call to past solvers
  ([discussion 3157](https://github.com/codewars/codewars.com/discussions/3157)). In 2025 few
  privileged users actually approve; the working route is asking on Discord
  ([discussion 3351](https://github.com/codewars/codewars.com/discussions/3351)).

**Rank assessment.**
- No shared scale: kazk called it "Codewars' fault for not providing any guidance", and wanted a
  sparkline of votes in place of one average. A "power user average" counted anyone over 500
  honor and was removed in 2022 ([#2207](https://github.com/codewars/codewars.com/issues/2207)).
- Niche topics get overranked (one Idris kata got 7 kyu and 1 kyu from two solvers), and
  overranking compounds along a series of kata ([#1769](https://github.com/codewars/codewars.com/issues/1769)).
  Fixing a rank after approval meant un-approving and re-voting ([#2001](https://github.com/codewars/codewars.com/issues/2001)).
- Beginners find two 8 kyu kata wildly different and assume authors set the rank
  ([discussion 3482](https://github.com/codewars/codewars.com/discussions/3482)).

**Honor farming and cheating.**
- Upvotes pay authors +2 each with no cap, so two 8/7 kyu kata solved by 100,000+ people made one
  user top-100 with 44 solves; the request to cap it is open
  ([#1880](https://github.com/codewars/codewars.com/issues/1880)). Critics said the system
  "rewards mass posting of low quality" kata, and kazk that high-honor users make poor
  translations that pay them well ([#1626](https://github.com/codewars/codewars.com/issues/1626)).
- Raising the honor needed to author (75, then 300) didn't help; moderators found no honor level
  that predicted quality ([#2560](https://github.com/codewars/codewars.com/issues/2560),
  [#1468](https://github.com/codewars/codewars.com/issues/1468)).
- Copied solutions: a cheater list ran to 642 comments ([#1378](https://github.com/codewars/codewars.com/issues/1378));
  students cheated because a course graded them on honor ([discussion 2513](https://github.com/codewars/codewars.com/discussions/2513)).
  Suspension now covers "excessive use of AI-generated solutions"
  ([Keeping Codewars safe](https://docs.codewars.com/community/moderation/keeping-codewars-safe)).
- A CodinGame cautionary tale, from the same thread: paying XP for reviews produced farmed,
  low-quality reviews ([#1626](https://github.com/codewars/codewars.com/issues/1626)).

**Tone and newcomers.** Reviews can be harsh: kazk asked a power user to tone down negativity
that would "lead to maintainer(s) to burn out" ([#1626](https://github.com/codewars/codewars.com/issues/1626));
some authors block reviewers; a beginner complained that 1 kyu users reject simple kata
([#1866](https://github.com/codewars/codewars.com/issues/1866)). The code of conduct now asks
reviewers to "consider the learner behind the code"; the maintenance guide says to aim critiques
"at the code and structure, never at the author".

**AI.** AI-written solutions are banned but hard to detect, and there have been false
accusations ([discussion 3252](https://github.com/codewars/codewars.com/discussions/3252)). A
user reports a current model solving many 1 kyu kata ([discussion 3018](https://github.com/codewars/codewars.com/discussions/3018)).
I found no policy on AI-*authored* kata.

**Leaderboards and clans.** Rank leaderboards were API-only until December 2022; a moderator
said the honor boards reflect "grinders" who prefer quantity ([discussion 2371](https://github.com/codewars/codewars.com/discussions/2371)),
and hobovsky has proposed dropping honor or separating it from rank
([#2944](https://github.com/codewars/codewars.com/issues/2944)). A clan leaderboard was
requested in 2018 and is still open ([#1356](https://github.com/codewars/codewars.com/issues/1356)).

**Why people author anyway.** Power users say authors create for self-expression and because
they "like to solve/create interesting problems", not for honor, which buys nothing
([#1626](https://github.com/codewars/codewars.com/issues/1626), [#1769](https://github.com/codewars/codewars.com/issues/1769)).
Payout is still watched closely: in a 2017 thread the top author tracked his translation honor
to the point, others said there was "no incentive to translate" or to author, and a reply warned
that paying more would invite low-quality translations, since translations have no beta
([#871](https://github.com/codewars/codewars.com/issues/871)). kazk's unbuilt
2018 plan was **tiers**: *Official* (hand-picked, held to standards, a bonus for promotion),
*User* (namespaced, can be hidden) and *Educational* (procedurally generated), and **badges in
place of one honor number** ([#1626](https://github.com/codewars/codewars.com/issues/1626)).

---

## Part 2. What inkit can borrow (proposal)

*Everything from here on is proposal.*

inkit differs in three ways that change the design:
1. **inkit puzzles can't be broken the way kata can.** `npm run new` and the editors prove a unique
   solution (or, for panels, at least one), and a published puzzle is locked
   (`app/app/db/schema.ts`). Most Codewars beta work is debugging tests; ours would be **only
   difficulty and satisfaction** (plus "the clue I drew isn't what I meant", which is a new
   version, not a fix).
2. **We have a machine difficulty estimate before anyone solves** (the deduction solver D and β's
   prior in `research-reputation.md`). Codewars starts from the author's guess.
3. **Kids and AI.** Codewars is adults and has neither.

### 2.1 A beta shelf ("Fresh ink")

- **Every new puzzle starts in beta**, the way kata do. It's playable and linked from the author's
  profile and their subscribers' feeds at once (so a creator's friends can play), but it's off the
  **Explore** front shelves and can't be **Featured** until it leaves.
- A **Fresh ink** shelf lists beta puzzles for people who opt in to test. Label it plainly
  ("New, help rate it"). Codewars' states map directly: *needs solvers* → *needs votes* →
  *ready*.
- **After a solve**, two one-tap questions (only after a solve, as Codewars and LMD do):
  - **"Did you enjoy it?"** Loved it / OK / Not for me (Codewars' Very / Somewhat / Not, with
    Somewhat = ½). Kid-friendly wording; faces like Codewars' icons.
  - **"How hard was it for you?"** Easier / About right / Harder than its stars said. Ask relative
    to the shown estimate, not on an absolute scale: it's easier for kids, and it shows which way D
    is off. Codewars' docs concede that absolute rank votes are "not balanced well".
  - Optional "Something's wrong" (Codewars' Issue), routed to the author and admins: an unclear
    rule, a clue that looks off.
- **Leaving beta** ("inked"), adapted from Codewars' table: enough solver votes and a minimum
  enjoyment, scaled by difficulty and by the author's record.

  | Estimated difficulty | Min. enjoyment | Votes if the author has <3 / <10 / 10+ inked puzzles |
  |---|---|---|
  | Easy | 75% | 8 / 6 / 4 |
  | Medium | 75% | 6 / 5 / 3 |
  | Hard | 70% | 4 / 3 / 3 |

  Starting numbers only, to be tuned: Codewars' are ~1.5× higher, but it has hundreds of
  thousands of users. Votes are weighted by solver trust (`research-reputation.md` §weights), not
  by honor tiers. Unlike Codewars, approval is **automatic** when the bar is met. There's no
  human sign-off, because there's nothing to debug; an admin can still hold one.
- **Difficulty on leaving** = the time model's β where there are enough timed solves, otherwise D
  nudged by the votes. Show the vote spread to the author, as Codewars shows highest/lowest.
- **Not good enough**: we don't retire. If a puzzle stays below the bar after twice the votes, it
  **stays playable** on the author's profile and in their collection, just never leaves Fresh ink.
  Codewars' rule (c), "would need 10 Very votes in a row", is a good stopping test. Tell the
  creator kindly and privately, with the comments.
- **Timeouts** matter at our scale: if a puzzle gets too few votes in 30 days, it leaves beta on D
  alone if its author has inked puzzles before, and otherwise stays in Fresh ink. Codewars' backlog
  of 1,566 is the cautionary number.
- **Honor guarantee**: nothing a solver earned is taken back if a puzzle is hidden or deleted
  (Codewars' rule; also `research-reputation.md`'s "ranks only go up").

### 2.2 Should AI puzzles go through beta?

**Yes, the same beta, with two differences.**
- They're the volume problem: ~50 posts a week (`docs/ai-creators.md`) against a few human ones.
  If they skip beta they fill Explore; if they go through it as-is they drown the human puzzles on
  Fresh ink and use up the testers.
- So: AI puzzles go through beta, but **on their own Fresh ink tab** (or interleaved at a fixed
  ratio, at most 1 AI to 2 human), and they **never count toward a human-style track record**
  (each AI puzzle needs the full "<3" votes). Beta votes on AI puzzles are the best training signal
  the generator can get: feed enjoyment and difficulty votes back into `puzzles/ai/week.ts`
  scoring.
- An AI puzzle that fails beta stays on its persona's page and never reaches Explore. That's the
  honest version of "AI creators look like any creator".
- Children's votes count for difficulty (they are the audience for easy puzzles), with trust
  weights as for anyone.

### 2.3 Privileges unlocked by standing

Codewars gates on honor alone, and the record (Part 1.6) shows the limits: low thresholds let
people create and translate before they understand quality, and high-honor users can still be
careless. For inkit:
- **Gate on what you've done, not a single number.** Each privilege names its own condition, and
  the profile shows progress to it, as Stack Exchange and Codewars both do.
- Proposed ladder (none of them unlocks moderation; moderators are appointed, as at Codewars):

  | Unlocks | When |
  |---|---|
  | Enjoyment & difficulty vote | after a solve, from the first solve (for kids too) |
  | "Something's wrong" report | 5 solves |
  | Tester (Fresh ink shelf, votes weigh 1×) | 10 solves in that genre |
  | Votes weigh 2× | 50 solves and 20 beta votes that agreed with where the puzzle ended up |
  | Nominate for Featured | 3 inked puzzles with crests, or 100 beta votes |
  | Curator: make public collections of others' puzzles ("Paths", like Codewars collections) | 25 solves |
  | Studio owner can let members' puzzles skip Fresh ink | studio with 10+ inked puzzles |

- **"Agreement" weighting** is the borrowable idea in Codewars' vote power, without its flaw.
  Codewars weighs by total honor, which is mostly volume. We'd weigh by how often your past votes
  matched the final verdict, a calibration record that can't be farmed by volume.
- **Creating puzzles stays open** (no 300-honor gate). Our editors guarantee correctness, and
  beta handles quality. Making things is the point for kids.

### 2.4 Honor sources for creators and helpers

Keep `research-reputation.md`'s principle: solver standing and creator standing **never summed**
(Codewars sums them; the leaderboards show the result is a contribution score that buries
solvers). Then borrow Codewars' **breakdown**:
- **Creator honor** (feeds crests): a puzzle **inked** (leaves beta), scaled by difficulty like
  Codewars' 3/15/75/375 but flatter (1/2/3/4) so easy puzzles for kids aren't worth nothing; its
  enjoyment after inking (the shrunk q_i); Featured.
- **Helper honor**, a third, separate track: beta votes that agreed with the outcome; "something's
  wrong" reports the author or an admin confirmed; a remix/translation (see below) that's inked.
  Codewars pays +1 per vote. We'd pay only for *useful* votes and show it as a "tester" crest
  line, not a number.
- **Remixes** in place of translations: a puzzle redrawn in another genre or size by someone else
  (Codewars' translation, inkit-style), credited to both, the remixer as co-author. It gets its
  own beta (Codewars' translations don't, and its docs regret it).
- **Never pay for**: comments' votes, referrals, raw solve counts, or volume of anything.

### 2.5 How difficulty and enjoyment combine into visibility

- **Two separate public numbers**, never multiplied: difficulty (stars or a typical time) and
  enjoyment (% loved, shown only once there are ~10 votes). Codewars shows rank and "% positive of
  N" separately, and that reads well.
- **Thresholds scale with difficulty** (harder puzzles: fewer votes and a lower enjoyment bar), as
  in Codewars' table. Hard puzzles get fewer solves and more mixed reactions; without this, Explore
  fills with easy ones.
- **Explore ordering** within a difficulty band: Bayesian enjoyment (as in research-reputation)
  times a freshness decay, plus "good next for you" (β near your θ). Use **skips** (opened, not
  solved, left) as Codewars counts them, but only as a soft negative relative to β.
- **Author track record lowers the bar**, as at Codewars. That's both a reward and a throughput
  fix.

### 2.6 Stats boards: public vs private

Borrow the **structure** of the Codewars profile (rank badge in the header; "Progress" and
"Contributions" as two blocks; authored-puzzle aggregates), and fit it to the mockups:

| Codewars shows | inkit public (adults) | inkit private (you, a managing parent) |
|---|---|---|
| Rank hexagon in the rank colour, everywhere the name appears | The hanko seal (mockup A), only if opted in; small and colour-coded like Codewars' hexagon | Always |
| Honor as a big number | **No total.** Crests (mockup D) | Helper and creator tallies |
| Leaderboard position, honor percentile | **None** | "You've solved harder puzzles than last month" |
| Rank wheel with % to next | — | Ensō filling toward the next step (mockup A) |
| Honor breakdown bars by source | — | Yes: made / helped / solved, which teaches what counts |
| Authored: completions, stars, avg rank, **avg satisfaction** | Puzzles, solves on them, **inked count**, avg difficulty | Avg enjoyment, per-puzzle votes, comments |
| Community: comments, translations, approvals | Remixes, tester crest | Beta votes, agreement rate |
| Per-language ranks | Top 3 genre seals | All genres (mockup C board) |
| Kata page stats: votes, % positive, spread | Difficulty + enjoyment once ≥10 votes | Author sees the vote spread from the first vote |

- Leaderboards: **none global** (as research-reputation argued). Codewars' Completed-Kata/Authored
  split is the useful idea: if we ever list creators, list **by inked puzzles in a genre this
  month**, humans and AI on separate lists.

### 2.7 Clans → studios

- Codewars' clans are a text field that makes everyone mutual followers; their real use is
  "colleagues and friends can easily keep track of each other's progression". There's no owner
  or clan page.
- inkit's studios (`collections` with members) are already better structured. Borrow:
  - **Allies board inside a studio or family**: members' recent solves, seals and inked puzzles,
    private to the studio (research-reputation's "private groups can have a board").
  - **"Solved by people you follow"** filter (Codewars' solutions filter): on a puzzle, see which
    of your studio-mates solved it.
  - A studio **beta circle**: members test each other's puzzles first. Their votes count at reduced
    weight (research-reputation's 0.3 for same-studio), so it helps polish without inflating.
- Don't borrow: free-text clans that anyone can join by typing a name. A child could join any
  "clan".

### 2.8 Kumite → sketches in public

Kumite's "publish a draft, others fork it, convert to a kata" fits inkit's paint editor: a
**public draft** others can remix, which its author can promote into beta. Low priority.

---

## Part 3. What to avoid

| Codewars problem | Why it happens | inkit counter |
|---|---|---|
| Honor is one sum dominated by authoring volume; upvotes pay forever | Lifetime, uncapped, linear rewards | Separate tracks (solve / make / help), crests that count good puzzles not likes, no totals in public |
| Easy content farms honor | Popular easy kata collect votes from every newcomer | Rewards per puzzle are flat-ish and bounded; enjoyment is a shrunk rate, not a count |
| +1 per vote → courtesy votes, scripts, pile-ons | The vote is paid and missable | Don't pay for votes; pay (privately, as a tester crest) only for votes that agreed with the outcome |
| One satisfaction vote mixes "fun" and "well made" | One question, two meanings | Two questions (enjoyment; difficulty vs. stars) and a separate "something's wrong" |
| Early bad votes are permanent; voters never return | Votes are final and the kata can't be re-launched | Show the author comments, not just votes; allow a **new version** to start a fresh beta, linked to the old one |
| Silent downvotes feel cruel; votes are de-anonymisable | Small numbers, visible order | Authors see vote **totals** only once ≥5 votes, never per-person; "Not for me" asks an optional reason from a fixed, kind list ("too easy", "too long", "a guess was needed") |
| Auto-retire within a day, no undo | Low thresholds at small n | Nothing retires automatically; "not inked" just means not promoted |
| Backlog of thousands; approval bottleneck on a few privileged humans | Manual approval, little tester supply | Automatic inking at the bar; a 30-day timeout; AI puzzles on their own tab so they don't eat tester time |
| Rank votes on private scales; niche overranking | No guidance, absolute scale | Ask relative to the shown estimate; machine D as the anchor; per-genre models |
| Honor-gated authoring didn't improve quality | Honor measures activity, not judgement | Keep making open; beta handles quality |
| Harsh expert reviews, intimidated newcomers | Expert reviewers, public critique, labelled "Issue" | Kids see no public comments on their puzzles by default; feedback to a child's puzzle goes through fixed kind phrases; "something's wrong" goes to admins first |
| Graded on honor → cheating | An external stake on the number | No public number; ranks private for kids; implausible-solve filter (research-reputation) |

**Kids.** Codewars is adult and text-heavy; three of its mechanisms would hurt children
directly: the public honor percentile and leaderboards (comparison), retirement and
"not satisfied" counts on their own work (public failure), and expert reviewers posting issues
(critique from strangers). Keep the beta for kids' puzzles, but: their puzzles' votes are shown
to them as a few kind summaries ("12 people solved it; most loved it; some found it easy"), never
as a failing percentage; their puzzles never get a public "not inked" state (they simply stay in
their collection); and only admins see "something's wrong" reports on them first.

**AI creators.** Codewars bans AI *solutions* but has no rule for AI *authors*. That gap is the
one inkit fills. AI puzzles go through beta (Part 2.2), carry the AI badge in Fresh ink, are
judged by the strictest vote counts (no track-record discount), and are listed apart from
humans' wherever creators are ranked. They can't vote or solve, so they can't touch others'
standing.

---

## Part 4. Proposal: what to adopt, in order

Each step depends only on those before it, and fits the phases in `research-reputation.md`.

1. **Post-solve votes** (with phase 0 instrumentation). After a solve: "Did you enjoy it?"
   (Loved / OK / Not for me) and "How hard was it, compared with its stars?" (Easier / About right
   / Harder). Solve required; one vote per person, changeable. Nothing public yet. *(Codewars:
   satisfaction vote, rank assessment, solve-before-vote.)*
2. **Two public numbers on every card**: difficulty (from D now, from β later) and enjoyment
   (% loved, Somewhat = ½, shown from 10 votes). *(Codewars: rank hexagon + "% positive of N".)*
3. **Fresh ink beta.** New puzzles start in beta: playable from the author's page and feeds, off
   Explore and Featured until inked. Bar scaled by difficulty and the author's record; inking is
   automatic; nothing is retired; a 30-day timeout. AI puzzles take the same path on their own
   tab, at full vote counts, and their votes train the generator. *(Codewars: beta, approval
   table, vote reduction for proven authors; minus manual approval and auto-retire.)*
4. **Private honor breakdown and progress** on "Your progress": made / helped / solved bars, the
   ensō to the next rank, inked count, enjoyment per puzzle. *(Codewars: honor breakdown, rank
   wheel; minus the totals and percentile.)*
5. **Standing-based privileges**, each with its own condition and a progress line: tester shelf,
   2× votes for calibrated testers, nominate for Featured. Moderation stays appointed.
   *(Codewars: privileges table, vote power; weighted by calibration rather than honor.)*
6. **Creator and helper crests**: inked puzzles (by difficulty), well-liked puzzles, tester
   crest. Public on adults' profiles; with a parent's say for kids. *(Codewars: authored-kata
   stats block, honor for approval and reviews; kazk's "badges in place of one number".)*
7. **Studio boards and beta circles**: a private allies board per studio or family, "solved by
   people in your studio", and members testing each other's puzzles at reduced weight.
   *(Codewars: clans/allies, follow filter.)*
8. **Remixes** (later): redraw someone's puzzle in another genre or size, co-credited, through its
   own beta. *(Codewars: translations, with the beta they lack.)*

**Not adopted:** a single honor total, global leaderboards, honor percentile, honor-gated
creation, paid votes, auto-retirement, free-text clans.

---

## Screenshots

All in `references/codewars-shots/`, for internal reference only.

| File | What it shows | Source |
|---|---|---|
| `live-profile-top.jpg` | Profile header and Stats tab: rank hexagon, honor, leaderboard #, percentile, contributions | codewars.com/users/g964, logged out, 9 Oct 2026 |
| `live-profile-stats.jpg` | Progress and Contributions blocks (authored totals, avg satisfaction) | same |
| `live-profile-badge-large.svg` | Embeddable profile badge | codewars.com/users/g964/badges/large |
| `live-leaderboard-overall.jpg` | Overall honor leaderboard, tabs | codewars.com/users/leaderboard |
| `live-leaderboard-authored.jpg` | Authored Kata & Translations leaderboard | codewars.com/users/leaderboard/authored |
| `live-kata-approved-header.jpg` | Approved kata header: rank, completions, author | codewars.com/kata/5277c8a221e209d3f6000b56 |
| `live-kata-approved-satisfaction.jpg` | % positive of N and the three vote counts | same |
| `live-beta-list.jpg` | Beta library card: status, estimated rank (1,566 in beta) | codewars.com/kata/search?beta=true |
| `live-beta-kata-votes.jpg` | Beta kata: votes, rank assessments, average/highest/lowest | codewars.com/kata/6aba3308e1eccf969195899f |
| `docs-solved-satisfaction-vote.png` | Post-solve satisfaction prompt (Very / Somewhat / None) | docs.codewars.com/getting-started/kata-solved |
| `docs-solved-rank-progress.png` | Rank progress wheel after a solve | same |
| `docs-satisfaction-score.png`, `docs-satisfaction-vote-old.png` | Older UI of the satisfaction score and vote | docs.codewars.com/concepts/kata/satisfaction-rating (Evernote-hosted images) |
| `docs-rank-breakdown.png` | Rank wheel with overall and per-language ranks | docs.codewars.com/gamification/ranks |
| `docs-honor-breakdown.png` | Honor breakdown bars by source | docs.codewars.com/gamification/honor |
| `docs-allies-board.png`, `docs-followers-board.png` | Allies and followers boards | docs.codewars.com/community/following |
| `docs-join-clan.png` | Clan field in profile settings | same |
| `docs-training-routines.png` | Personal trainer: focus, skip | docs.codewars.com/getting-started/finding-kata |
| `docs-add-translation.png` | Language menu with "add translation" | docs.codewars.com/concepts/kata/translations |
