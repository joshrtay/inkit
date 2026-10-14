# human-targets.json

What human-made puzzles look like, per genre, for steering the generator toward them
(docs/research-human-gap.md). Summary statistics only: no puzzle is in it. Made by
`human_gap.py` from Janko's and Puzzle Square JP's puzzles (local only; the puzzles are others').

```
{
  "<genre>": {
    "n": 970,                      human puzzles read (sizes, settings, density, symmetry)
    "nSolved": 100,                of those, solved by our solver (bands, families, required)
    "sizes": {"10": 0.7, "8": 0.3},
                                   square puzzles by side ("10" is 10 × 10): each side with 1% or
                                   more of the puzzles, as shares of those (summing to 1)
    "nonSquare": 0.2,              share of puzzles that aren't square (left out of sizes)
    "upTo12": 0.8,                 share of puzzles up to 12 × 12
    "settings": {"stars": {"2": 0.65, "1": 0.26, "3": 0.09}},
                                   per rule setting, the share of puzzles with each value
                                   (settings_of in human_gap.py: Star Battle's stars, Easy as ABC's
                                   letters, Sudoku's box when not the default), as gen-set.ts's
                                   HumanTarget reads them
    "clueDensity": [0.15, 0.3],    the 10th and 90th percentile of clues per cell (givens that are
                                   clues, not board: gen-set.ts's FIXED; region genres such as Star
                                   Battle and Aquarium: areas per cell)
    "clueDensityMedian": 0.21,
    "symmetry": {"rot180": 0.6, "mirror": 0.1, "none": 0.3},
                                   share of puzzles whose clue layout (or area walls) is exactly
                                   symmetric, checked in that order (a half-turn-symmetric puzzle
                                   counts as rot180 even if it is also mirror-symmetric; a diagonal
                                   counts as mirror). Clues outside the grid (Skyscrapers) count at
                                   their outside cell, Spiral Galaxies' centres at their point.
                                   Hitori (every cell given) is "none" by definition
    "bands": {"easy": 0.3, "medium": 0.2, "hard": 0.2, "expert": 0.1, "beyond": 0.2},
                                   share per band (bands.ts bandOf); "beyond": no band solves it
                                   without a case split
    "families": {"<family>": 0.12, ...},
                                   the 25 commonest step families as shares of all steps in the
                                   solved human puzzles; keys are exactly gen-set.ts's `families`
                                   strings (signatures.ts family(step.shapeText)), computed the
                                   same way. A human puzzle beyond expert is solved with the
                                   solver's defaults (case splits allowed), so its case-split
                                   steps' families count too
    "required": {"pairs": 0.4, ...}
                                   share of solved human puzzles requiring each technique
                                   (bands.ts requiredOf)
  }
}
```

Sizes above 12 × 12 count in `sizes`, `settings`, `clueDensity` and `symmetry`; bands, families
and required techniques come from puzzles up to 12 × 12 (larger ones take too long to solve).
