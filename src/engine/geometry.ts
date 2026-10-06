// The square grid as a graph (see docs/grid-engine.md). Every element has a numeric id:
//   cells    r * cols + c
//   corners  r * (cols + 1) + c          (r in 0..rows, c in 0..cols)
//   borders  between two corners; each separates up to two cells (-1 = outside)
//   links    between two neighbouring cell centers; one per interior border
// Imports use explicit .ts extensions so Node can run the engine directly (build scripts).
export type RC = [number, number];

export interface Border {
  id: number;
  corners: [number, number];
  cells: [number, number];        // [above or left, below or right]; -1 outside the grid
  horizontal: boolean;
  link: number;                    // the link across it, or -1 on the outside
}

export interface Link {
  id: number;
  cells: [number, number];
  border: number;
}

export interface Grid {
  rows: number;
  cols: number;
  cellCount: number;
  cornerCount: number;
  borders: Border[];
  links: Link[];
  cell(r: number, c: number): number;
  rc(cell: number): RC;
  corner(r: number, c: number): number;
  cornerRC(corner: number): RC;
  cellBorders: number[][];         // a cell's 4 borders
  cellLinks: number[][];           // a cell's links to its neighbours
  cornerBorders: number[][];       // the borders meeting at a corner
  borderBetween(a: number, b: number): number;   // -1 if not neighbours
}

export function squareGrid(rows: number, cols: number): Grid {
  const cell = (r: number, c: number) => r * cols + c;
  const corner = (r: number, c: number) => r * (cols + 1) + c;
  const inside = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  const borders: Border[] = [], links: Link[] = [];
  const cellBorders: number[][] = Array.from({ length: rows * cols }, () => []);
  const cellLinks: number[][] = Array.from({ length: rows * cols }, () => []);
  const cornerBorders: number[][] = Array.from({ length: (rows + 1) * (cols + 1) }, () => []);
  const between = new Map<string, number>();

  const add = (c1: number, c2: number, a: number, b: number, horizontal: boolean) => {
    const id = borders.length;
    let link = -1;
    if (a >= 0 && b >= 0) {
      link = links.length;
      links.push({ id: link, cells: [a, b], border: id });
      cellLinks[a].push(link); cellLinks[b].push(link);
      between.set(`${a},${b}`, id); between.set(`${b},${a}`, id);
    }
    borders.push({ id, corners: [c1, c2], cells: [a, b], horizontal, link });
    if (a >= 0) cellBorders[a].push(id);
    if (b >= 0) cellBorders[b].push(id);
    cornerBorders[c1].push(id); cornerBorders[c2].push(id);
  };
  for (let r = 0; r <= rows; r++)          // horizontal borders: cell above / below
    for (let c = 0; c < cols; c++)
      add(corner(r, c), corner(r, c + 1), inside(r - 1, c) ? cell(r - 1, c) : -1, inside(r, c) ? cell(r, c) : -1, true);
  for (let r = 0; r < rows; r++)           // vertical borders: cell left / right
    for (let c = 0; c <= cols; c++)
      add(corner(r, c), corner(r + 1, c), inside(r, c - 1) ? cell(r, c - 1) : -1, inside(r, c) ? cell(r, c) : -1, false);

  return {
    rows, cols, cellCount: rows * cols, cornerCount: (rows + 1) * (cols + 1), borders, links,
    cell, rc: (i) => [Math.floor(i / cols), i % cols], corner, cornerRC: (i) => [Math.floor(i / (cols + 1)), i % (cols + 1)],
    cellBorders, cellLinks, cornerBorders,
    borderBetween: (a, b) => between.get(`${a},${b}`) ?? -1,
  };
}
