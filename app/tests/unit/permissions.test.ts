// Who may change and delete a game (app/lib/permissions.server.ts): a published puzzle can't be
// changed, only deleted (docs/creation-flow.md, decision 8), by its author or an admin.
import { describe, expect, it } from "vitest";
import { canChange, canDelete, canEdit, canView } from "~/lib/permissions.server";
import type { GameState } from "~/db/schema";

const author = { id: "a", isAdmin: false }, other = { id: "o", isAdmin: false }, admin = { id: "x", isAdmin: true };
const game = (state: GameState) => ({ authorId: "a", state });

describe("canChange: only a draft", () => {
  it("lets the author (a member) and the collection's owners change a draft", () => {
    expect(canChange(game("draft"), author, "contributor")).toBe(true);
    expect(canChange(game("draft"), other, "owner")).toBe(true);
    expect(canChange(game("draft"), other, "contributor")).toBe(false);
    expect(canChange(game("draft"), author, null)).toBe(false);
  });
  it("locks a published puzzle, one taken down and one deleted, for everyone", () => {
    for (const state of ["published", "hidden", "deleted"] as const) {
      expect(canChange(game(state), author, "owner")).toBe(false);
      expect(canChange(game(state), admin, "owner")).toBe(false);
    }
  });
  it("still counts the author of a published puzzle as its editor (for its page), but not a deleted one", () => {
    expect(canEdit(game("published"), author, "owner")).toBe(true);
    expect(canEdit(game("deleted"), author, "owner")).toBe(false);
  });
});

describe("canDelete: its author or an admin", () => {
  it("lets its author (a member) delete it, published or not", () => {
    expect(canDelete(game("published"), author, "owner")).toBe(true);
    expect(canDelete(game("draft"), author, "contributor")).toBe(true);
    expect(canDelete(game("hidden"), author, "owner")).toBe(true);
  });
  it("lets an admin delete it", () => expect(canDelete(game("published"), admin, null)).toBe(true));
  it("doesn't let anyone else, an author who left, or anyone once it's deleted", () => {
    expect(canDelete(game("published"), other, "owner")).toBe(false);
    expect(canDelete(game("published"), null, null)).toBe(false);
    expect(canDelete(game("published"), author, null)).toBe(false);
    expect(canDelete(game("deleted"), admin, "owner")).toBe(false);
  });
});

describe("canView: a deleted game is gone", () => {
  const collection = { deletedAt: null } as Parameters<typeof canView>[1];
  it("hides it from everyone, its author and admins included", () => {
    const g = { ...game("deleted") } as Parameters<typeof canView>[0];
    expect(canView(g, collection, null, null)).toBe(false);
    expect(canView(g, collection, author as Parameters<typeof canView>[2], "owner")).toBe(false);
    expect(canView(g, collection, admin as Parameters<typeof canView>[2], null)).toBe(false);
    expect(canView({ ...game("published") } as Parameters<typeof canView>[0], collection, null, null)).toBe(true);
  });
});
