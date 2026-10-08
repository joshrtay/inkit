# Style

How puzzles look on inkit: ballpoint pen and watercolour on white paper, with a Japanese
accent drawn from Go and craft (stones, star points, crests). One look for every puzzle type.
Styles live in `src/game-types/grid/styles.css`; shared drawing in `src/game-types/grid/panel-draw.ts`
(symbols, stones) and the players (`game.ts`, `figure.ts`) and still pictures (`picture.ts`).

## Two media

**Pen** (`--paper-ink`, with the `#pen` wobble on the whole board): everything structural or
written, and everything the player draws.
- the grid, frame, area outlines, walls, given lines
- clue text, digits, letters
- symbol outlines
- lines the player draws (loops, fences, panel lines, cuts), Xs and dots they mark

**Watercolour** (the `.wash` class: the board's `--wash` filter from `src/lib/ink.ts`): every
coloured fill, printed or played.
- shading, water, rocks, regions and glass, a nonogram's picture, the walk's trail
- printed symbols' fills: stones, crests, triangles, tiles, Star Battle's stars

A printed clue that has a colour is **wash + pen outline**. A player's fill is **wash** alone. Pale
helpers that aren't ink (tracks a line runs in, thermometer tubes, selection and lit highlights,
hint areas) are flat tints of the ink or a wash colour, never full colour.

## Pen weights

Four weights and one wide wash stroke, as CSS variables on `.grid-game`:

| Variable | Width | For |
|---|---|---|
| `--pen-hair` | 1 | faint grid lines; a crest's petals |
| `--pen-fine` | 1.6 | symbol outlines, small marks (X), clue circles, compass, diamonds |
| `--pen-medium` | 2.6 | the frame, area outlines, stones' outline, hollow shapes, arrows, galaxy centres |
| `--pen-bold` | 5.5 | lines the player draws, walls, region cuts, a panel's end |
| `--wash-stroke` | 12 | rivers (loops), panel tracks, the maze's trail and stubs; thermometer tubes are 1.33× |

Don't add a new width: pick the tier. (The solved stamp's check is drawn in its own 100-unit box.)

## Colour

The watercolour palette (`src/styles/global.css`): `--wash-red`, `--wash-orange`, `--wash-yellow`,
`--wash-green`, `--wash-blue`, `--wash-purple`, `--wash-pink`, plus `--sumi` (black stones) and
`--shell` (white stones). Symbols use these by name (`PANEL_COLORS` in `panel-draw.ts`, applied in a
`style`, since CSS variables don't work in SVG attributes). A symmetry panel's two lines are pen
colours (`LINE_COLORS`), not washes. Don't add hex colours in drawing code: add a token.

## The symbol family

| Symbol | Look | Where |
|---|---|---|
| Black / white | **Stones**: a wash disc (`--sumi` / `--shell`) with a medium pen outline | panel squares (any colour), Masyu's pearls |
| Points on the grid | **Hoshi**, the star points of a Go board: a small solid ink dot | panel dots |
| Star-like | **Crest** (kamon): eight rounded petals in wash, hairline outline, an ink eye | panel stars |
| Triangles | **Uroko** (fish scale): wash with a fine outline | panel triangles |
| Polyominoes | **Kumiko tiles**: wash blocks with a fine outline; hollow ones a dashed medium outline; tilted = may turn | panel shapes |
| Cancel mark | **Brush strokes**: three strokes that swell and taper | panel erasers |
| A start | **Ensō**: the brushed open circle; it fills with ink once the line leaves it | panel starts |

New symbols should come from the same world (Go, crests, craft patterns, brush marks) and follow
the two media: a wash fill with a pen outline.

## Type

Puzzle text is handwritten (`--hand`, Kalam). Printed digits and clues are the pen's ink;
digits the player enters are a lighter, bluer ink. Site chrome (menus, buttons) is Nunito.
