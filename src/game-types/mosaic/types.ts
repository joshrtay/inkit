/** A mosaic instance's "mosaic" data (src/games/mosaic/<n>.json): a pixel-art picture.
 *  Each character of `picture` is a key into `palette`; "." is the background, which is
 *  left unshaded. Every other character is a shaded cell. Clues come from the picture. */
export interface MosaicConfig {
  /** What the picture is, revealed after solving. */
  title: string;
  picture: string[];
  /** Colors for each character, e.g. { ".": "#dff3f7", "r": "#d8443a" }. */
  palette: Record<string, string>;
  /** The sketch this picture was taken from, if any. */
  source?: string;
}

/** What the browser receives (built by Game.astro). */
export interface MosaicClientConfig {
  title: string;
  width: number;
  height: number;
  rows: number[][];
  cols: number[][];
  /** Solution: true = shaded. */
  mask: boolean[][];
  /** The reveal: a color for every cell. */
  colors: string[][];
}
