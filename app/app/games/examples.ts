// Starting points for the editor: a small valid sketch per genre (not yet a finished puzzle;
// add givens until Check finds exactly one solution).
export const EXAMPLES: Record<string, string> = {
  river: `river
// Round the Bend: one loop through every white cell. "block" cells are rocks.
{
 "size": [4, 4],
 "givens": [{ "at": "cell", "cell": [1, 1], "kind": "block" }]
}`,
  slitherlink: `slitherlink
// a number counts the lines on its cell's four sides
{
 "size": [4, 4],
 "givens": [{ "at": "cell", "cell": [0, 0], "kind": "number", "value": 3 }]
}`,
  nurikabe: `nurikabe
// each number is an island of that many cells; the sea is connected, with no 2x2 pools
{
 "size": [4, 4],
 "givens": [{ "at": "cell", "cell": [0, 0], "kind": "number", "value": 2 }]
}`,
  nonogram: `nonogram
// draw the hidden picture with letters ("." is empty); the clues are worked out from it
{
 "size": [5, 5],
 "picture": {
  "title": "Plus",
  "rows": ["..r..", "..r..", "rrrrr", "..r..", "..r.."],
  "palette": { ".": "#eef4fb", "r": "#d8443a" }
 }
}`,
  sudoku: `sudoku
// 4x4: every row, column and 2x2 box holds 1 to 4 once
{
 "size": [4, 4],
 "givens": [{ "at": "cell", "cell": [0, 0], "kind": "number", "value": 1 }]
}`,
  panes: `panes: size 4, twins
// split the grid into regions of 4; the regions on either side of a ◆ have the same shape
{
 "size": [4, 4],
 "givens": [{ "at": "border", "cells": [[1, 1], [1, 2]], "kind": "twins" }]
}`,
};
