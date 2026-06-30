import { describe, expect, it } from "vitest";
import {
  getOnlyReviewUnit,
  makeContext,
  securePrereq,
  useTestDb,
} from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as prerequisiteState from "./prerequisite-state";
import * as flashcards from "./flashcards";
import * as settings from "./settings";
import { isPendingSchedule } from "./scheduler";

useTestDb();

function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
) {
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
  });
}

describe("prerequisite edges", () => {
  it("rejects prerequisite edges across deck boundaries", async () => {
    const ctx = await makeContext("edge-cross-deck");
    const prereqDeck = await decks.createDeck(ctx, { name: "Prereqs" });
    const dependentDeck = await decks.createDeck(ctx, { name: "Dependents" });
    const prereq = await basic(ctx, prereqDeck.id, "P", "P");
    const dependent = await basic(ctx, dependentDeck.id, "D", "D");

    await expect(
      graph.addPrereq(ctx, prereq.id, dependent.id),
    ).rejects.toThrow(
      "Prerequisites can only connect flashcards in the same deck.",
    );

    expect(await prerequisiteState.getPrereqIds(ctx, dependent.id)).toEqual([]);
  });

  it("still prevents cycles within a deck", async () => {
    const ctx = await makeContext("edge-cycle");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const first = await basic(ctx, deck.id, "A", "A");
    const second = await basic(ctx, deck.id, "B", "B");

    await graph.addPrereq(ctx, first.id, second.id);

    await expect(graph.addPrereq(ctx, second.id, first.id)).rejects.toThrow(
      "That edge would create a cycle in the prerequisite graph.",
    );
  });

  it("removePrereq unlocks the dependent and restores scheduling", async () => {
    const ctx = await makeContext("edge-remove");
    const deck = await decks.createDeck(ctx, { name: "Remove" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");

    await graph.addPrereq(ctx, prereq.id, dependent.id);
    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );
    expect(isPendingSchedule(await getOnlyReviewUnit(ctx, dependent.id))).toBe(
      true,
    );

    await graph.removePrereq(ctx, prereq.id, dependent.id);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
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

    expect(await prerequisiteState.isUnlocked(ctx, b.id)).toBe(false);
    expect(await prerequisiteState.isUnlocked(ctx, c.id)).toBe(false);

    await securePrereq(ctx, a.id);
    await prerequisiteState.refreshAfterPrerequisiteStateChange(ctx, a.id);

    expect(await prerequisiteState.isUnlocked(ctx, b.id)).toBe(true);
    // C still waits on B, which is unlocked but not secured.
    expect(await prerequisiteState.isUnlocked(ctx, c.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await prerequisiteState.refreshAfterPrerequisiteStateChange(ctx, b.id);

    expect(await prerequisiteState.isUnlocked(ctx, c.id)).toBe(true);
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
    await prerequisiteState.refreshAfterPrerequisiteStateChange(ctx, a.id);
    expect(await prerequisiteState.isUnlocked(ctx, dependent.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await prerequisiteState.refreshAfterPrerequisiteStateChange(ctx, b.id);
    expect(await prerequisiteState.isUnlocked(ctx, dependent.id)).toBe(true);
  });

  it("uses the deck's prerequisite stability floor and refreshes on change", async () => {
    const ctx = await makeContext("edge-deck-floor");
    await settings.updateSettings(ctx, { prereqStabilityFloor: 2 });
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");

    await graph.addPrereq(ctx, prereq.id, dependent.id);
    await securePrereq(ctx, prereq.id);
    await prerequisiteState.refreshAfterPrerequisiteStateChange(ctx, prereq.id);

    expect(await prerequisiteState.isUnlocked(ctx, dependent.id)).toBe(true);

    await settings.updateDeckSettings(ctx, deck.id, {
      prereqStabilityFloor: 3,
    });

    expect(await prerequisiteState.isUnlocked(ctx, dependent.id)).toBe(false);

    await settings.updateDeckSettings(ctx, deck.id, {
      prereqStabilityFloor: null,
    });

    expect(await prerequisiteState.isUnlocked(ctx, dependent.id)).toBe(true);
  });

  it("archive and unarchive of an unsecured prerequisite toggles dependent locking", async () => {
    const ctx = await makeContext("edge-archive-unsecured");
    const deck = await decks.createDeck(ctx, { name: "Archive" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );
    expect(isPendingSchedule(await getOnlyReviewUnit(ctx, dependent.id))).toBe(
      true,
    );

    await flashcards.setArchived(ctx, prereq.id, true);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
    let dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(dependentCard.locked).toBe(false);
    expect(isPendingSchedule(dependentCard)).toBe(false);

    await flashcards.setArchived(ctx, prereq.id, false);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );
    dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(dependentCard.locked).toBe(true);
    expect(isPendingSchedule(dependentCard)).toBe(true);
  });

});

describe("canvas layout", () => {
  it("getDeckGraph exposes positions, lock state, and display text", async () => {
    const ctx = await makeContext("deck-graph");
    const deck = await decks.createDeck(ctx, { name: "Graph" });
    const prereq = await basic(ctx, deck.id, "Front P", "Back P");
    const dependent = await basic(ctx, deck.id, "Front D", "Back D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);
    await graph.saveLayout(ctx, deck.id, [
      { flashcardId: prereq.id, x: 1, y: 2 },
    ]);

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
