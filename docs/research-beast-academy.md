# How Beast Academy's Puzzle Lab sequences puzzles

Read from a parent account's reports (October 2026): every type's sets, and the puzzles and
solutions of 20 sets across Honeycomb Paths, Akari, Fillominoes, Spiral Galaxies and Find the Cut
Line. Their puzzles are kept nowhere in this repo; this is analysis only.

## Shape

- **17 types, 101 sets**, each set 4–8 puzzles (6 usually), and one-puzzle **Monsters** as
  capstones.
- **Four tiers**, shown as icons: moon, comet, Saturn, galaxy. Every type has its sets in tier
  order, one to three sets per tier, and the order inside a set runs easiest to hardest.
- Sets unlock in order (a lock icon per set).

## Sets have themes, of four kinds

| Kind | Examples | What changes |
|---|---|---|
| A twist on the rules | Akari's Cipher 1–3 and Cipher Monster (clue numbers hidden as letters), Honeycomb Paths' Elastic 1–2 (skip-count by 10s, 5s, 4s), Find the Cut Line's Reflection Only, Abstract Art's Minus One and Minus Two | One added idea, then the same idea harder (Cipher 1 → 2 → 3 → Monster) |
| A feature of the board | Akari's Agoraphobia (8 × 8 with only 4–6 walls) and Countdown, Fillominoes' Nooks and Crannies and Stairs, Spiral Galaxies' Straddling, Checkerboard, Cornerstones, Centered | Where the clues sit, what the open space looks like |
| One board, several puzzles | Akari's and Ice Rinks' Single Layout, Fracturns' Single Layout, Remove a Block's Solve it Twice, Find the Cut Line's Solve it Thrice | The same layout with different clues: contrasting cases |
| A number idea | Sum Blobs' Two Dozen, Units Digits, Powers of Two; Abstract Art's Forty-Eight; Twins and Triplets' Party of Six, Nine, Twelve, Eighteen | The puzzle carries arithmetic: factors, divisibility, place value |

Set names are playful and specific, so a set is remembered as an idea ("Agoraphobia"), not a level.

## How difficulty rises

- **Inside a set, mostly by size.** Fillominoes' Stairs runs 3 × 3, 4 × 4 … 8 × 8; Quintets 20 to 40
  cells; Spiral Galaxies' Centered 15 to 40 cells with 5 to 14 galaxies. The idea stays; the board
  grows.
- **Some sets hold the size and vary the clues**: Akari's Countdown (all 7 × 7, 10–14 walls), Single
  Layout (one 13 × 9 board, four sets of clues).
- **Across sets, by layering ideas**: a plain set, then a twist, then the twist combined or
  intensified, then a Monster that is the biggest board of the last idea.
- **Fewer clues as a theme**: Agoraphobia gives an 8 × 8 Akari only 4–6 walls.

## Solutions

The parent view shows each puzzle's solution, but it is mostly just the solved picture. Words appear
only where there's something to compute: the skip-count sequence in Elastic, each cipher letter's
value, a one-sentence reason in Find the Cut Line ("each piece has a line of symmetry"). There's no
step-by-step logic and no named techniques: the sequence is meant to do the teaching.

## What this suggests for inkit

- It's Rusczyk's model applied to puzzles: hand-made sets, each with one idea, ordered within and
  across, and a capstone. Our sets can work the same way, and a set's name can carry its idea.
- Their difficulty within a set is mostly board size; ours could be the step the set teaches, which
  the solver can measure.
- "Single Layout" and "Solve it Twice" are contrasting cases made simply: hold the board, change the
  clues. The one-edit neighbourhood in [learning-design.md](learning-design.md) does this
  automatically.
- A test worth running: our deduction solver on these sets, to see whether its estimate rises
  within each set and across the four tiers. That would check our difficulty against a hand-made
  sequence from people who design for children.
