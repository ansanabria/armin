import { describe, expect, it } from "vitest";
import { getOnlyReviewUnit, makeContext, securePrereq, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as notes from "./flashcards";
import { isPendingSchedule } from "./scheduler";

useTestDb();

function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
) {
  return notes.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
  });
}

describe("prerequisite edges", () => {
  it("removePrereq unlocks the dependent and restores scheduling", async () => {
    const ctx = await makeContext("edge-remove");
    const deck = await decks.createDeck(ctx, { name: "Remove" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");

    await graph.addPrereq(ctx, prereq.id, dependent.id);
    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);
    expect(isPendingSchedule(await getOnlyReviewUnit(ctx, dependent.id))).toBe(true);

    await graph.removePrereq(ctx, prereq.id, dependent.id);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    const card = await getOnlyReviewUnit(ctx, dependent.id);
    expect(isPendingSchedule(card)).toBe(false);
    expect(card.locked).toBe(false);
  });

  it("locks transitively: each level unlocks only when its prereq is secured", async () => {
    const ctx = await makeContext("edge-chain");
    const deck = await decks.createDeck(ctx, { name: "Chain" });
    const a = await basic(ctx, deck.id, "A", "A");
    const b = await basic(ctx, deck.id, "B", "B");
    const c = await basic(ctx, deck.id, "C", "C");
    await graph.addPrereq(ctx, a.id, b.id);
    await graph.addPrereq(ctx, b.id, c.id);

    expect(await graph.isUnlocked(ctx, b.id)).toBe(false);
    expect(await graph.isUnlocked(ctx, c.id)).toBe(false);

    await securePrereq(ctx, a.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, a.id);

    expect(await graph.isUnlocked(ctx, b.id)).toBe(true);
    // C still waits on B, which is unlocked but not secured.
    expect(await graph.isUnlocked(ctx, c.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, b.id);

    expect(await graph.isUnlocked(ctx, c.id)).toBe(true);
  });

  it("a dependent with multiple prereqs needs all of them secured", async () => {
    const ctx = await makeContext("edge-multi");
    const deck = await decks.createDeck(ctx, { name: "Multi" });
    const a = await basic(ctx, deck.id, "A", "A");
    const b = await basic(ctx, deck.id, "B", "B");
    const dependent = await basic(ctx, deck.id, "D", "D");
    await graph.addPrereq(ctx, a.id, dependent.id);
    await graph.addPrereq(ctx, b.id, dependent.id);

    await securePrereq(ctx, a.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, a.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, b.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
  });
});

describe("canvas layout", () => {
  it("saveLayout persists positions and ignores notes outside the deck", async () => {
    const ctx = await makeContext("layout");
    const deck = await decks.createDeck(ctx, { name: "Canvas" });
    const other = await decks.createDeck(ctx, { name: "Other" });
    const inside = await basic(ctx, deck.id, "In", "In");
    const outside = await basic(ctx, other.id, "Out", "Out");

    await graph.saveLayout(ctx, deck.id, [
      { flashcardId: inside.id, x: 10, y: 20 },
      { flashcardId: outside.id, x: 99, y: 99 },
    ]);

    const insideNote = await notes.getFlashcard(ctx, inside.id);
    expect(insideNote?.posX).toBe(10);
    expect(insideNote?.posY).toBe(20);

    const outsideNote = await notes.getFlashcard(ctx, outside.id);
    expect(outsideNote?.posX).toBeNull();
    expect(outsideNote?.posY).toBeNull();
  });

  it("getDeckGraph exposes positions, lock state, and display text", async () => {
    const ctx = await makeContext("deck-graph");
    const deck = await decks.createDeck(ctx, { name: "Graph" });
    const prereq = await basic(ctx, deck.id, "Front P", "Back P");
    const dependent = await basic(ctx, deck.id, "Front D", "Back D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);
    await graph.saveLayout(ctx, deck.id, [{ flashcardId: prereq.id, x: 1, y: 2 }]);

    const result = await graph.getDeckGraph(ctx, deck.id);
    expect(result.edges).toEqual([
      { prereqId: prereq.id, dependentId: dependent.id },
    ]);

    const prereqNode = result.nodes.find((node) => node.id === prereq.id);
    expect(prereqNode).toMatchObject({
      front: "Front P",
      back: "Back P",
      locked: false,
      x: 1,
      y: 2,
    });
    const dependentNode = result.nodes.find((node) => node.id === dependent.id);
    expect(dependentNode?.locked).toBe(true);
  });
});
