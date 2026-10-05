/** One printable sheet. Its PDF lives at public/<slug>/sheets/<file>.pdf; `npm run puzzles` makes <file>.png. */
export interface PacketSheet {
  /** Used in the page URL hash, e.g. #page-4. */
  id: string;
  name: string;
  /** Short label beside the name in the sheet list. */
  kind: string;
  file: string;
  /** One line shown under the sheet. */
  note: string;
}

/** A packet instance's "packet" data (src/games/<slug>.json). */
export interface PacketConfig {
  sheets: PacketSheet[];
  /** The final answer. Only its SHA-256 hash is sent to the browser. */
  answer: string;
}

/** What the browser receives (built by Game.astro). */
export interface PacketClientConfig {
  sheets: PacketSheet[];
  sheetsBase: string;
  answerHash: string;
}
