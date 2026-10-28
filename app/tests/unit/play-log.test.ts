// Solve logging (lib/play-log.ts, games/plays.ts): nothing before a yes, plays carried across a
// reload and ended by a solve, batches as the server takes them.
import { beforeEach, describe, expect, it } from "vitest";
import { BATCH, createPlayLog, setShare, shareAllowed, type PlayBatch } from "~/lib/play-log";
import { checkBatch, MAX_BATCH_BYTES, solvedIn } from "~/games/plays";

// a localStorage and the window events the module uses, for node
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
  },
  dispatchEvent: () => true,
});

describe("solve logging", () => {
  beforeEach(() => store.clear());

  it("is on until turned off, and off forgets the player and any play", () => {
    expect(shareAllowed()).toBe(true);
    createPlayLog("g1", () => {});
    expect([...store.keys()].some((k) => k.startsWith("inkit:play:"))).toBe(true);
    setShare(false);
    expect(shareAllowed()).toBe(false);
    setShare(true);
    expect(shareAllowed()).toBe(true);
    expect(store.has("inkit:player")).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith("inkit:play:"))).toBe(false);
  });

  it("sends batches with times from the start, and a solve ends the play", () => {
    let t = 1000;
    const sent: PlayBatch[] = [];
    const log = createPlayLog("g1", (b) => sent.push(b), () => t);
    const first = log.play.id;
    t = 1500; log.log("m", [["shade", 3, 1]]);
    t = 2500; log.log("s");
    expect(sent).toHaveLength(1);
    expect(sent[0].events).toEqual([[0, "o"], [500, "m", [["shade", 3, 1]]], [1500, "s"]]);
    expect(sent[0].seq).toBe(0);
    expect(solvedIn(sent[0])).toBe(true);
    // the next move is another play
    expect(log.play.id).not.toBe(first);
  });

  it("carries a play across a reload, numbering its batches on", () => {
    const sent: PlayBatch[] = [];
    const a = createPlayLog("g2", (b) => sent.push(b));
    a.log("m", []); a.flush(true);
    const b = createPlayLog("g2", (x) => sent.push(x));
    b.log("m", []); b.flush();
    expect(sent.map((s) => [s.play.id, s.seq])).toEqual([[a.play.id, 0], [a.play.id, 1]]);
  });

  it("sends a batch when it's full", () => {
    const sent: PlayBatch[] = [];
    const log = createPlayLog("g3", (b) => sent.push(b));
    for (let i = 0; i < BATCH; i++) log.log("m", [["fence", i, 1]]);
    expect(sent).toHaveLength(1);
    expect(sent[0].events).toHaveLength(BATCH);
  });
});

describe("the server's check", () => {
  const ok = { play: { id: "abcdefgh12", gameId: "g1", playerId: "player0001", startedAt: 1_800_000_000_000 }, seq: 0, events: [[0, "o"], [10, "m", [["shade", 1, 1]]]] };
  it("takes a well-formed batch", () => {
    expect(checkBatch(ok, 200).ok).toBe(true);
  });
  it("refuses unknown kinds, bad ids, empty or oversized batches", () => {
    expect(checkBatch({ ...ok, events: [[0, "x"]] }, 200).ok).toBe(false);
    expect(checkBatch({ ...ok, play: { ...ok.play, playerId: "Bad Id!" } }, 200).ok).toBe(false);
    expect(checkBatch({ ...ok, events: [] }, 200).ok).toBe(false);
    expect(checkBatch(ok, MAX_BATCH_BYTES + 1).ok).toBe(false);
  });
  it("takes a hint with its ladder, rung and technique, or the shape logged before them", () => {
    const hint = { ladder: "rule-1", rung: 1, rungs: 1, technique: "runs.line", rule: "runs", area: [0, 1, 2], cells: [1] };
    expect(checkBatch({ ...ok, events: [[5, "h", hint]] }, 200).ok).toBe(true);
    expect(checkBatch({ ...ok, events: [[5, "h", { ...hint, rung: 0, rungs: 0, technique: null, rule: null, area: [], cells: [] }]] }, 200).ok).toBe(true);
    expect(checkBatch({ ...ok, events: [[5, "h", { area: [0], cells: [1] }], [6, "h", null]] }, 200).ok).toBe(true);
    expect(checkBatch({ ...ok, events: [[5, "h", { ...hint, ladder: "" }]] }, 200).ok).toBe(false);
    expect(checkBatch({ ...ok, events: [[5, "h", "a hint"]] }, 200).ok).toBe(false);
  });
});
