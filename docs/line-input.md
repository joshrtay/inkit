# Drawing lines: how input should feel

Notes behind `src/game-types/grid/line-input.ts`, the "track cursor" every line in the player
uses: a panel's line (corner to corner), loops through cell centres (Masyu, Simple Path,
Numberlink, Round the Bend) and loops along the grid lines (Slitherlink and other fence types).

## What we had

`game.ts` turned pointer moves into whole segments: a drag snapped to the nearest corner (within
0.42 of a cell) or the cell under the finger, and toggled every edge in a straight run from the
last one. Nothing moved between nodes, a diagonal push did nothing until the finger reached the
next node, panels were drawn edge by edge like a fence (a gap or the other line didn't stop the
drag, only the check afterwards), and a drag back over a segment toggled it again rather than
taking it back.

## The Witness

The line is a cursor that lives on the tracks. The mouse (in pointer lock) or the stick pushes it;
it never leaves the tracks and never jumps.

- **Continuous.** The head moves through every point of a segment, so the line grows smoothly
  and the player feels the length of each segment.
- **Corner sliding.** Pushing diagonally or against a wall is not wasted: part of the push turns
  into motion along the track, so the head slides to the next junction and turns there. Pushing
  "up-right" along a corridor of junctions makes a staircase on its own.
- **Backtracking.** Moving back over the line eats it; there is no separate erase.
- **Blocking.** Gaps stop the head partway into the broken segment; the head can't enter its own
  line, and in symmetry puzzles each head stops short of the other line, both moving at once as
  mirror images.
- **Ends.** An end is a short stub out of the panel; the line has to be pushed into it, and the
  stub glows when the head is there. Releasing anywhere else keeps the line (desktop) or drops it.
- **Pointer lock** on desktop, so the system cursor doesn't wander off the panel; the line is the
  cursor. Touch versions use the finger's relative motion.

### jbzdarkid's web Witness

[jbzdarkid.github.io](https://github.com/jbzdarkid/jbzdarkid.github.io) recreates it in the
browser; the cursor is in [`engine/trace2.js`](https://github.com/jbzdarkid/jbzdarkid.github.io/blob/master/engine/trace2.js).
Its rules, measured in its pixels (a node is 24 px, a segment 58 px, the line 24 px wide):

- `onMove(dx, dy)` first calls `pushCursor` (redirects pushes against walls), then loops
  `hardCollision()` → `move()` → redraw until no cell boundary is crossed, so a fast move crosses
  several cells in one event.
- **Wall push:** the cursor is clamped 12 px (half the line) inside the current cell's box, and the
  overshoot goes onto the other axis at **1/3** (`movementRatio = -3`; "wittle" mode uses 1:1).
- **Turning at a junction:** once the cursor passes a junction's middle, it turns when the
  perpendicular part of the move is more than half the forward part (`turnMod = 2`): turns are
  eager. Away from junctions only the larger axis moves.
- **Stepping:** a move to the next cell happens once the centre crosses the box edge; a move
  opposite to the last segment pops it (backtracking).
- **Limits** (`hardCollision`), from the middle of the segment: a gap stops the head 21 px short of
  the middle; an occupied start lets it 5 px past; its own mirror line stops it 13 px short; the
  mirror side's gap counts as a gap.
- **Ends:** the box grows 24 px into an end, and the trace finishes only when the head is inside
  that extension.
- **Input:** `requestPointerLock()` with `movementX/Y × sensitivity` on desktop; touch uses
  the delta from the last touch position, `preventDefault()` to stop scrolling, and a second
  finger cancels the trace.

## Pointer practice on the web

- **Pointer events** for mouse, pen and touch alike, with `setPointerCapture` so the drag keeps
  coming when the finger leaves the board ([MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events),
  [setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)).
- **`touch-action: none`** on the board only, so a drag on it draws and a drag beside it scrolls
  the page ([MDN: touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)).
- **Coalesced events:** browsers merge moves to one per frame; `getCoalescedEvents()` gives every
  sample, so a fast swipe doesn't cut corners ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)).
  `getPredictedEvents()` can draw slightly ahead to hide latency ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getPredictedEvents));
  on a constrained track a wrong prediction looks worse than a frame of lag, so we don't use it.
- **Draw in `requestAnimationFrame`**, not once per event ([web.dev: input latency](https://web.dev/articles/optimize-input-delay)).
- **Pointer lock** ([MDN: Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API))
  is the Witness's way, but on a web page it hides the cursor, asks the user to press Esc to
  leave, and fights with the page's own scrolling; with an absolute pointer projected onto the
  track the line already can't leave it, so we don't lock.
- **Haptics:** `navigator.vibrate(ms)` gives a tick on Android Chrome; Safari on iOS doesn't
  support it ([MDN: Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)).
  A short tick (5–8 ms) on each junction reached, never a long buzz.
- **Visual feedback:** a round head on the line's tip, the start filling in as the line leaves
  it (the ensō), the line committed only at junctions while the head moves continuously, and the
  head easing to the nearest junction on release.

## Other puzzle apps

- **Simon Tatham's Portable Puzzle Collection** ([Loopy, Pearl](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/)):
  Loopy toggles one edge per click (left line, right cross); Pearl draws by dragging through cell
  centres, and dragging back over the line erases it. Simple and predictable; segments, not a
  continuous head.
- **pzprjs / puzz.link** ([robx/pzprjs](https://github.com/robx/pzprjs), `src/puzzle/MouseInput.js`):
  positions are on a doubled grid; `getpos(0)` snaps to cells, `getpos(0.5)` to crosses, and a
  stroke chooses border or cell input once, at mousedown (`getpos(0.25)`). The first segment of a
  stroke decides draw or erase and the rest follow it. A plain tap on a border cycles it.
- **Conceptis** (Pic-a-Pix, Slitherlink apps): tap a segment to draw, tap again to cross, drag to
  draw a run; erasing is the same gesture over a drawn line.

## What we do

`line-input.ts` keeps a cursor on a graph of tracks (corners for panels and fence loops, cell
centres for cell loops):

- **Projection with corner sliding.** Each move puts the head at the point of the tracks near it
  that is nearest the pointer: the current segment, the other segments at either end of it, and
  the way back. When a segment past the next junction is nearer than the current one, the head
  goes through the junction and on. A diagonal push slides round a corner once the pointer is
  nearer the new segment, the 45° rule, a little less eager than the Witness's 2:1, and with an
  absolute pointer no input is lost. The loop repeats until nothing changes, so a fast move
  crosses many junctions in one event.
- **Backtracking.** Moving back along the line pops it.
- **Blocking.** A gap stops the head 0.3 of the way in; its own line (or, with symmetry, the
  mirror line, or the mirror axis itself) stops it with the heads just short of touching.
- **Ends.** A panel's ends are extra nodes out on their stubs, so the head pushes into the stub.
- **Release.** A partial segment past half snaps to the next junction, otherwise back.
- **Loops.** Fence and cell loops keep tap-to-cycle; a drag is a stroke whose first segment
  decides draw or erase (as before), and the stroke's own segments are taken back by moving back.
  A stroke can close a loop by running into its own start.
