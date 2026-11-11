// The tutor's guards (src/lib/tutor.ts, app/lib/tutor.server.ts): the checks on a reply's words,
// the plain reply given without the model, and what the limits allow.
import { describe, expect, it } from "vitest";
import { type BoardRead, plainReply, recentTurns, replyProblems, REPLY_WORDS, SENT_TURNS, tutorLog } from "~site/lib/tutor";
import { checkBatch } from "~/games/plays";
import { chatOfStored } from "~/components/TutorPanel";
import { allowed, DAILY, dailyLimit, isAsk, PER_HOUR, readOfBody, turnsOfBody } from "~/lib/tutor.server";

const move = { facts: [{ mark: "line(3)", value: true, text: "a line" }], where: "the top row", clues: [], cost: 1, tier: 0, focus: [3] };
const read = (over: Partial<BoardRead> = {}): BoardRead => ({ mistakes: [], moves: [], done: false, ...over });

describe("replyProblems", () => {
  it("passes a short reply in landmarks", () => expect(replyProblems("Look at the black pearl on the right edge. How far must its leg run?")).toEqual([]));
  it("catches coordinates", () => expect(replyProblems("Try r3c4 next.")).toEqual(["names a square by coordinates"]));
  it("catches a long reply", () => expect(replyProblems(Array(REPLY_WORDS + 1).fill("word").join(" "))).toEqual(["too long"]));
  it("catches an empty one", () => expect(replyProblems("  ")).toContain("empty"));
});

describe("plainReply", () => {
  it("points at mistakes first", () => expect(plainReply(read({ mistakes: [{ text: "x", cells: [1], ruledOut: true }], moves: [move] } as Partial<BoardRead>))).toMatchObject({ move: 0, mistake: true }));
  it("then at the easiest move", () => expect(plainReply(read({ moves: [move] } as Partial<BoardRead>))).toMatchObject({ move: 1, mistake: false }));
  it("says so when solved or when nothing was found", () => {
    expect(plainReply(read({ done: true })).text).toMatch(/solved/);
    expect(plainReply(read())).toMatchObject({ move: 0, mistake: false });
  });
  it("passes its own checks", () => {
    for (const r of [read(), read({ done: true }), read({ moves: [move] } as Partial<BoardRead>)]) expect(replyProblems(plainReply(r).text)).toEqual([]);
  });
});

describe("the limits", () => {
  it("lets the model answer under both", () => expect(allowed({ mineThisHour: 0, modelToday: 0 }, DAILY)).toBe("model"));
  it("asks a player to wait past the hour's replies", () => expect(allowed({ mineThisHour: PER_HOUR, modelToday: 0 }, DAILY)).toBe("wait"));
  it("answers plainly past the day's", () => expect(allowed({ mineThisHour: 1, modelToday: DAILY }, DAILY)).toBe("plain"));
  it("turns the model off at 0", () => expect(allowed({ mineThisHour: 0, modelToday: 0 }, 0)).toBe("plain"));
  it("reads the day's limit from the setting", () => {
    expect(dailyLimit({ TUTOR_DAILY_REPLIES: "50" })).toBe(50);
    expect(dailyLimit({ TUTOR_DAILY_REPLIES: "0" })).toBe(0);
    expect(dailyLimit({ TUTOR_DAILY_REPLIES: "lots" })).toBe(DAILY);
    expect(dailyLimit({})).toBe(DAILY);
  });
});

describe("what the page sends", () => {
  it("takes a chat ending anywhere, of the two roles", () => expect(turnsOfBody([{ role: "player", text: "hi" }, { role: "tutor", text: "hello" }])).toHaveLength(2));
  it("refuses other roles, long turns and long chats", () => {
    expect(turnsOfBody([{ role: "system", text: "hi" }])).toBeNull();
    expect(turnsOfBody([{ role: "player", text: "x".repeat(601) }])).toBeNull();
    expect(turnsOfBody(Array(25).fill({ role: "player", text: "hi" }))).toBeNull();
  });
  it("takes a board read by its shape", () => {
    expect(readOfBody({ mistakes: [], moves: [move], done: false })?.moves).toHaveLength(1);
    expect(readOfBody({ moves: [] })).toBeNull();
    expect(readOfBody({ mistakes: [], moves: Array(13).fill(move) })).toBeNull();
  });
  it("knows the suggested questions", () => { expect(isAsk("tell")).toBe(true); expect(isAsk("toString")).toBe(false); });
});

describe("a long chat", () => {
  const chat = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "tutor" as const : "player" as const, text: `${i}` }));
  it("is sent whole while short", () => expect(recentTurns(chat(5))).toHaveLength(5));
  it("sends its latest turns, from one of the player's, ending with the question", () => {
    const sent = recentTurns(chat(41));
    expect(sent.length).toBeLessThanOrEqual(SENT_TURNS);
    expect(sent[0].role).toBe("player");
    expect(sent.at(-1)!.text).toBe("40");
    expect(turnsOfBody(sent)).not.toBeNull();
  });
});

describe("the chat in the play's log and in the browser", () => {
  const entry = tutorLog("look", "Where should I look?", read({ moves: [move], mistakes: [{ text: "x", cells: [1], ruledOut: false }] } as Partial<BoardRead>), { text: "Look at the top row.", move: 1, mistake: false, by: "model" });
  it("notes the words, the move pointed at and what the solver saw", () => expect(entry).toMatchObject({ ask: "look", q: "Where should I look?", reply: "Look at the top row.", target: ["line(3)=true"], cost: 1, wrong: 1, guesses: 1, by: "model" }));
  it("is taken by the play log", () => {
    const body = { play: { id: "abcdefgh", gameId: "g1", playerId: "abcdefgh", startedAt: 1 }, seq: 0, events: [[10, "t", entry]] };
    expect(checkBatch(body, 500).ok).toBe(true);
  });
  it("reads a kept chat back, and nothing from anything else", () => {
    expect(chatOfStored(JSON.stringify([{ role: "player", text: "hi" }, { role: "tutor", text: "hello", area: [1, 2] }, { role: "x", text: "no" }]))).toEqual([{ role: "player", text: "hi" }, { role: "tutor", text: "hello", area: [1, 2] }]);
    expect(chatOfStored("{")).toEqual([]);
    expect(chatOfStored(null)).toEqual([]);
  });
});
