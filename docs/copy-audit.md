# Copy audit (2026-10-10)

The interface's notes, hints, tooltips and errors, cut to short plain words (the owner's rule: say the one thing the person needs; no system explanations, no clauses stitched with colons or semicolons, no asides). Each row is one change: the string as it was, and as it is now. Code around a string is left in where it helps find it.

102 changes in 19 files.

| File | Before | After |
|---|---|---|
| `sketchpad/checklist.ts` | note: "What doesn't fit is left out until it's fixed; it doesn't change the verdict." | note: "Left out of the puzzle until it's fixed." |
| `sketchpad/checklist.ts` | note: "The solver is looking." | note: "Checking…" |
| `sketchpad/checklist.ts` | note: "No way of filling it in obeys every rule. Take a clue out, or change one." | note: "Nothing fits every rule. Remove or change a clue." |
| `sketchpad/checklist.ts` | note: "It can be solved more than one way, so a player would have to guess. Add a clue that settles it." | note: "Players would have to guess. Add a clue to settle it." |
| `sketchpad/checklist.ts` | note: "The solver looks once every rule holds." | note: "Fix the broken rules first." |
| `sketchpad/checklist.ts` | note: "Press Check to run the solver." | note: "Press Check." |
| `sketchpad/check.ts` | "Choose a puzzle type: its rules decide what counts as a solution." | "Choose a puzzle type." |
| `sketchpad/check.ts` | "Press Check when it's ready: the solver looks for its solutions, and keeps looking as you draw." | "Press Check when it's ready." |
| `sketchpad/check.ts` | "Draw a grid with the Grid tool: the puzzle is read off it." | "Draw a grid with the Grid tool." |
| `sketchpad/check.ts` | text: "The solver is looking for solutions." | text: "Looking for solutions." |
| `sketchpad/check.ts` | broken already, so nothing can solve it. Fix ${v.rules === 1 ? "it" : "them"} and the verdict updates.` | broken. Fix ${v.rules === 1 ? "it" : "them"} first.` |
| `sketchpad/check.ts` | `No way of filling it in obeys every ${name} rule. Take a clue out, or change one.` | `Nothing fits every ${name} rule. Remove or change a clue.` |
| `sketchpad/check.ts` | text: "It can be solved more than one way, so a player would have to guess. Add a clue that settles it." | text: "Players would have to guess. Add a clue to settle it." |
| `sketchpad/check.ts` | text: "It can be solved, one way only. Here it is." | text: "Here it is." |
| `sketchpad/check.ts` | text: "Any line that obeys the symbols solves a panel, so one is enough. Here is the first the solver found." | text: "Here's one." |
| `sketchpad/check.ts` | "Digits rise from the bulb to the tip, at least one a square, so these can't all be right. Change or erase one of them." | "Digits rise from the bulb. Change or erase one." |
| `sketchpad/check.ts` | `Each ${where} holds ${digits} once, so one of these is wrong. Change or erase one of them.` : "Each one can appear only once, so one of these is wrong. Change or erase one of them." | `Each ${where} holds ${digits} once. Change or erase one.` : "Each can appear only once. Change or erase one." |
| `sketchpad/check.ts` | "It's left out of the puzzle. Erase it, or keep it if it's only decoration." | "Left out of the puzzle. Erase it, or keep it as decoration." |
| `sketchpad/check.ts` | "It's left out of the puzzle. Move it onto the grid, or erase it." | "Left out of the puzzle. Move it onto the grid, or erase it." |
| `sketchpad/check.ts` | "It's read the likelier way for now. Make it clear to be sure." | "Read the likelier way. Make it clearer." |
| `sketchpad/check.ts` | "The type sets the grid's look: change it with the Grid tool." | "Change it with the Grid tool." |
| `sketchpad/check.ts` | "The puzzle needs this before it can be checked." | "Needed before it can be checked." |
| `sketchpad/check.ts` | `This square can be a ${d.values[0]} or a ${d.values[1]}, and the rest still works. Add a clue that settles it.` | `It can be a ${d.values[0]} or a ${d.values[1]}. Add a clue to settle it.` |
| `sketchpad/check.ts` | "Two solutions differ here, and both obey every rule. Add a clue that settles it." | "Two solutions differ here. Add a clue to settle it." |
| `sketchpad/to-puzzle.ts` | "The player draws the line: break a track with the eraser instead" | "Players draw the line. Break a track with the eraser." |
| `sketchpad/to-puzzle.ts` | "Two things written in one square: only the last one counts" | "Two things in one square. Only the last counts" |
| `sketchpad/to-puzzle.ts` | `${n} areas: more than a puzzle can have` | `Too many areas (${n})` |
| `sketchpad/to-puzzle.ts` | `Not a box line: the boxes are ${box[0]} × ${box[1]} (set in Rules)` | `Not a box line. Boxes are ${box[0]} × ${box[1]}` |
| `sketchpad/to-puzzle.ts` | "A bulb at both ends: which end is the bulb?" | "Bulbs at both ends" |
| `sketchpad/to-puzzle.ts` | `${gv.value} is too big: the numbers here run 1 to ${p.digits}` | `${gv.value} is too big. Use 1 to ${p.digits}` |
| `components/Paint.tsx` | . Check what it wasn’t sure of against the paper.</span> | .</span> |
| `components/Paint.tsx` | title="Checked: it matches your drawing" | title="Matches your drawing" |
| `components/Paint.tsx` | aria-label="Point at it to draw it on the board" | aria-label="Solution. Point at it to show it on the board" |
| `components/Paint.tsx` | <p className="paint-quiet">Pointing at it draws it on the board.</p> | <p className="paint-quiet">Point at it to see it on the board.</p> |
| `components/Paint.tsx` | `Size ${size[0]} × ${size[1]}, from the grid` | `Size ${size[0]} × ${size[1]}` |
| `components/Paint.tsx` | <span>Check and Publish need to know what kind of puzzle this is: its rules decide what counts as a solution.</span> | <span>Check and Publish need a puzzle type.</span> |
| `components/Paint.tsx` | "This puzzle: its rules, and whether it has one solution" | "Rules and solutions" |
| `components/Paint.tsx` | "Checks it, then on to name it, play it and publish it" : passes(verdict) ? "Name it, play it, and publish it" : "Publishing needs the verdict to pass" | "Check it, then publish" : passes(verdict) ? "Name, try and publish it" : "Fix it first" |
| `components/Paint.tsx` | Claude reads your photo again with this. Its reading replaces the drawing here. | Claude reads the photo again. This replaces your drawing. |
| `components/Sketchpad.tsx` | hint: "Drag a rectangle for a grid; drag the grid to move it, its corner to resize it" | hint: "Drag to make a grid. Drag it to move, its corner to resize." |
| `components/Sketchpad.tsx` | hint: "Draw freehand (hold Shift for a straight line)" | hint: "Draw freehand. Hold Shift for a straight line." |
| `components/Sketchpad.tsx` | hint: "Drag a straight line; it keeps level or upright near the axes" | hint: "Drag a straight line." |
| `components/Sketchpad.tsx` | hint: "Drag from a square across others to put them in its area (with New area, in an area of their own); the borders follow" | hint: "Drag from a square across others to join its area." |
| `components/Sketchpad.tsx` | hint: "Tap or drag across squares to wash them (again to clear); brush off the grid" | hint: "Tap or drag to colour squares. Again to clear." |
| `components/Sketchpad.tsx` | hint: "Tap where the stamp goes (again to take it off)" | hint: "Tap to place a stamp. Again to remove it." |
| `components/Sketchpad.tsx` | hint: "Tap a square and type a number or letter (Enter to finish, arrows to move on); small text goes on corners, lines and a square's sides" | hint: "Tap a square and type. Enter to finish, arrows to move." |
| `components/Sketchpad.tsx` | hint: "Tap or drag over anything to rub it out; along a grid line to break it (again to mend it)" | hint: "Tap or drag to erase. Erase a grid line to break it, again to mend it." |
| `components/Sketchpad.tsx` | tip: "Stone (pearls, a panel's squares, paint dots)" | tip: "Stone: pearls and dots" |
| `components/Sketchpad.tsx` | data-tip="Snap to the grid: line ends to its corners, stamps to its squares and points, washes fill squares" | data-tip="Snap to the grid" |
| `components/Sketchpad.tsx` | {typeName} is played {LOOK_WORDS[kit.look]}: the type sets the look.</p> | {typeName} is played {LOOK_WORDS[kit.look]}.</p> |
| `components/Sketchpad.tsx` | data-tip="Take the grid away (what's drawn stays)" | data-tip="Remove the grid. Your drawing stays." |
| `components/Sketchpad.tsx` | data-tip="A 6 × 6 grid in the middle of the view (or drag one out)" | data-tip="Add a 6 × 6 grid" |
| `components/Sketchpad.tsx` | data-tip="Straight lines (or hold Shift)" | data-tip="Straight lines (Shift)" |
| `components/Sketchpad.tsx` | data-tip="The squares you drag make an area of their own" | data-tip="Drag to make a new area" |
| `components/Sketchpad.tsx` | {newArea ? "Drag across squares: they make a new area." : "Drag from a square across others: they join its area."} The borders are drawn for you.</p> | {newArea ? "Drag across squares to make a new area." : "Drag from a square across others to join its area."}</p> |
| `components/Sketchpad.tsx` | data-tip="Normal: a clue in a square" | data-tip="Normal, for squares" |
| `components/Sketchpad.tsx` | data-tip="Small: on a corner, a line, or a square's side or corner" | data-tip="Small, for corners and lines" |
| `components/Sketchpad.tsx` | {typeName} has no stamps: its clues are {own("text") ? "written with Text" : "drawn with the pen"}.</p> | {typeName} has no stamps. {own("text") ? "Use Text" : "Use the pen"}.</p> |
| `components/Sketchpad.tsx` | data-tip="Hidden until painted (a dashed outline)" | data-tip="Hidden until painted" |
| `components/Sketchpad.tsx` | data-tip="The two borders opposite, not at a corner" | data-tip="Borders on opposite sides" |
| `components/Sketchpad.tsx` | Drag from the bulb through the squares; tap a bulb to take its thermometer off. | Drag from the bulb through the squares. Tap a bulb to remove it. |
| `components/Sketchpad.tsx` | tip="Flip (its mirror image)" | tip="Flip" |
| `components/Sketchpad.tsx` | data-tip="Hollow: a negative shape, outlined" | data-tip="Hollow: a negative shape" |
| `components/Sketchpad.tsx` | <p className="sp-pal-note">{toolHint}.</p> | <p className="sp-pal-note">{toolHint}</p> |
| `components/Sketchpad.tsx` | doesn’t use the {toolLabel.toLowerCase()}: what you draw is decoration, flagged and left out of the puzzle.</p> | doesn’t use the {toolLabel.toLowerCase()}. It’s left out of the puzzle.</p> |
| `components/Sketchpad.tsx` | body: <p>Everything on it goes. Undo brings it back.</p> | body: <p>You can undo this.</p> |
| `components/Sketchpad.tsx` | "Every tool, for decoration or drawing ahead: what the type can't use is flagged" | "Show every tool" |
| `components/TypePicker.tsx` | "Draw a grid first: the types are tried on it" | "Draw a grid first" |
| `components/TypePicker.tsx` | "Claude read your photo as one of these. Each is shown with your drawing and the solver's verdict." | "Claude's best guesses from your photo." |
| `components/TypePicker.tsx` | "Your drawing tried as every type, without asking Claude: these fit it best, each with the solver's verdict." | "The types that fit your drawing best." |
| `components/TypePicker.tsx` | Nothing fits yet: draw a grid and some clues, then ask again. | Nothing fits yet. Draw a grid and some clues, then ask again. |
| `components/TypePicker.tsx` | "The solver is checking each…" : asked.state === "stopped" ? "Stopped: some weren't checked." : "The verdicts are the solver's, on what you've drawn so far." | "Checking each…" : asked.state === "stopped" ? "Stopped before checking them all." : "Based on your drawing so far." |
| `components/TypePicker.tsx` | Plain paint, every tool: choose a type when you know it | Every tool. Choose a type later. |
| `components/TypePicker.tsx` | "Not made in paint yet: it keeps its own editor" | "Has its own editor" |
| `components/TypePicker.tsx` | You can change the type any time; nothing you drew is lost. | Change the type any time. Your drawing stays. |
| `components/TypePicker.tsx` | The full guide, on its own page ↗ | Full guide ↗ |
| `routes/new.tsx` | Either way you finish it in paint. Check it there whenever you like: it needs exactly one solution (panels: at least one) before it can be published. | Either way, you finish it in paint. |
| `routes/new.tsx` | Take or choose a photo of a puzzle you drew on paper. Claude reads it and redraws it here in ink, and marks anything it wasn’t sure of. | Take a photo of a puzzle you drew. Claude redraws it in ink. |
| `routes/new.tsx` | An empty page with the grid, pen, stamps and text. Choose the puzzle type in paint when you know it; from then on paint shows only what that type needs. | Draw it from scratch. |
| `components/BugReport.tsx` | "A replay of this page as you used it: clicks, scrolling and what was on screen. Anything you typed is hidden." | "Clicks, scrolling and the screen. What you typed is hidden." |
| `components/BugReport.tsx` | "No recording: it's turned off in Settings, or the page has only just opened." | "No recording yet, or it's off in Settings." |
| `components/BugReport.tsx` | <span>Include a screenshot<small>A picture of the page as it is now.</small></span> | <span>Include a screenshot</span> |
| `components/BugReport.tsx` | We also send the page’s address, the puzzle you’re on, your browser and screen size, and recent errors. Only the inkit team sees your report. | We also send the page address, your browser and screen size, and recent errors. Only the inkit team sees it. |
| `routes/settings.tsx` | . Links to your old address stop working; your puzzles keep theirs.</span> | . Old links to your profile stop working.</span> |
| `routes/settings.tsx` | . Your email changes when you open it (it works for a day).</p> | . Open it within a day to change your email.</p> |
| `routes/settings.tsx` | At least 8 characters. You’ll stay signed in here; other devices are signed out. | At least 8 characters. Other devices will be signed out. |
| `routes/settings.tsx` | While you use inkit, this browser keeps the last two minutes of the page in memory, so a bug report can show what happened. It’s sent only if you report a bug and leave its box ticked; what you type is hidden, and settings pages are never recorded. | This browser keeps the last two minutes in memory. It’s sent only with a bug report, and what you type is hidden. |
| `routes/game-publish.tsx` | thing${d.warnings.misfits === 1 ? "" : "s"} left out (they don't fit)` | thing${d.warnings.misfits === 1 ? "" : "s"} left out` |
| `routes/game-publish.tsx` | "Publish it: everyone can play it; once published, it can't be changed" : check.state === "checking" ? "The solver is checking it" : "It needs to pass the check in paint first" | "Publish it. It can't be changed after." : check.state === "checking" ? "Checking…" : "Fix it in paint first" |
| `routes/reset-password.tsx` | Your password is changed. Any other devices you were signed in on are signed out. | Your password is changed. Other devices are signed out. |
| `routes/studio-new.tsx` | A shared collection: you'll be its owner, and you can add other creators as owners or contributors. | A shared collection. You own it and can add other creators. |
| `components/AiBadge.tsx` | title="An AI creator: puzzles made by a generator and proved to have one solution; titles and notes written by Claude" | title="AI creator. Puzzles are generated; Claude writes the titles." |
| `components/GameEditor.tsx` | Claude looks at it again, told which type it is. This takes up to a minute and replaces the puzzle here. | Claude reads it again as this type. It takes up to a minute and replaces the puzzle here. |
| `components/GameEditor.tsx` | Give it a title first (at the top of the page). | Give it a title first. |
| `components/GameEditor.tsx` | Claude reads your drawing again with this. It replaces the puzzle here. | Claude reads the drawing again. This replaces the puzzle here. |
| `lib/games.server.ts` | "Check the puzzle first: it needs exactly one solution (a panel, at least one) to be published." | "Check the puzzle in paint first." |
| `lib/games.server.ts` | "Say why it's being taken down; the author and owners will see this note." | "Say why. The author and owners will see this note." |
| `components/LookPanel.tsx` | <span className="hint">(the game type decides unless you change it)</span> | <span className="hint">default: the type’s</span> |
| `components/ReadingScreen.tsx` | "This usually takes 20 to 40 seconds." : "Hard-to-read drawings take a little longer." | "Usually 20 to 40 seconds." : "Messy drawings take longer." |
| `src/game-types/grid/game.ts` | "No hints left: nothing one line alone gives away. Check for mistakes?" | "No hints left. Check for mistakes?" |
| `src/game-types/grid/game.ts` | `You're out! ${walk!.trail.length} squares from the way in to the way out.` | `You're out in ${walk!.trail.length} squares!` |
| `src/game-types/grid/walk.ts` | `The walls are right! Now find the way out: ${trail.length} square${trail.length === 1 ? "" : "s"} so far.` | `The walls are right! Now find the way out. ${trail.length} square${trail.length === 1 ? "" : "s"} so far.` |

## Left for later (files another change is rebuilding)

Not edited here: Explore, its cards and the profile page were being rebuilt at the time.

| File | Now | Suggested |
|---|---|---|
| `routes/explore.tsx` (Today) | The newest puzzles from every creator, the well liked staying up longer. | The newest puzzles. |
| `routes/explore.tsx` (Quick ones) | About five minutes or less: one with a cup of tea. | Five minutes or less. |
| `routes/explore.tsx` (Start here) | New to a type? One easy puzzle each, with the rules a tap away. | One easy puzzle of each type. |
| `routes/explore.tsx` (Browse by type) | N kinds of puzzle. Each opens its puzzles, newest or best first. | N kinds of puzzle. |
| `routes/explore.tsx` (Hard ones) | The toughest of the last seven days. Set aside a while. | The week’s toughest. |
| `routes/explore.tsx` (Creators) | People who publish here, by how well liked their puzzles are and what they’ve made lately. | People who make puzzles here. |
| `routes/explore.tsx` (AI shelf) | N characters with puzzles made by inkit’s generator, each proved to have one solution. Their titles and notes are written by Claude. | Puzzles from inkit’s generator, titled by Claude. |
| `routes/explore.tsx` (meta title) | Explore logic puzzles: new today, quick ones, every type and their creators · inkit | Explore logic puzzles · inkit |
| `routes/collection.tsx` (Drafts empty) | Puzzles you’re still working on wait here until you publish them. | Unpublished puzzles wait here. |
| `routes/collection.tsx` (Puzzles empty) | Draw one on paper, take a photo, and upload it. | (fine as is) |
| `routes/collection.tsx` (deleted studio) | This studio was deleted; its games are offline. | This studio was deleted. |
| `routes/settings.tsx` (Recommendations, new) | Up to N creators, people or AI, shown on your profile with a line about why. | Up to N creators, on your profile. |
| `routes/settings.tsx` (Recommendations, new) | That’s N: remove one to add another. | That’s the most. Remove one to add another. |

## Reviewed and left as they are

- `privacy.tsx` and `terms.tsx`: already plain; the long paragraphs carry legal meaning (what the bug recording holds, who sees reports), so they stay.
- AI creators’ persona text (`ai/personas.ts`): a deliberate style.
- Admin pages and the Rules panel’s rule labels (`editor/coverage.ts`): admin-only; the parenthesised names there are variant names, kept.
- Engine hint messages (`src/engine/rules.ts`), shown to players: mostly short. Wordiest: “Every wall must join the outside edge: these stand on their own, so there's more than one way around them.”

## Guide rules that read wordy (not changed)

`src/guides/guides.ts`, each a single rule line:

- Akari’s cipher line (“In a cipher, black cells show letters instead of numbers. Each letter stands for…”), three sentences.
- Panes’ Palisade line (“the diamond's thick sides are how many of its square's sides are borders, two at a corner or opposite (turned any way)…”).
- The symmetric pieces line (“it matches its mirror image (folded across, down or corner to corner), or it looks the same turned halfway round…”).
- Panel’s Shapes line (“…the way round they're drawn (tilted ones may turn). The line never cuts through a shape.”).
- Abstract Art’s line that adds the Binary Puzzle’s rules (“…or no two rows (or columns) alike. The rules under the puzzle say which.”).
