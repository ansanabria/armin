import { describe, expect, it } from "vitest";
import {
  getOnlyReviewUnit,
  makeContext,
  securePrereq,
  useTestDb,
} from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as notes from "./flashcards";
import * as settings from "./settings";
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
  it("allows a secured prerequisite in one deck to unlock a dependent in another", async () => {
    const ctx = await makeContext("edge-cross-deck");
    const prereqDeck = await decks.createDeck(ctx, { name: "Prereqs" });
    const dependentDeck = await decks.createDeck(ctx, { name: "Dependents" });
    const prereq = await basic(ctx, prereqDeck.id, "P", "P");
    const dependent = await basic(ctx, dependentDeck.id, "D", "D");

    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect(await graph.getPrereqIds(ctx, dependent.id)).toEqual([prereq.id]);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);
    expect(isPendingSchedule(await getOnlyReviewUnit(ctx, dependent.id))).toBe(true);

    await securePrereq(ctx, prereq.id);
    await graph.refreshAfterPrerequisiteReview(ctx, prereq.id);

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
    const dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(dependentCard.locked).toBe(false);
    expect(isPendingSchedule(dependentCard)).toBe(false);
  });

  it("prevents cycles across deck boundaries", async () => {
    const ctx = await makeContext("edge-cross-deck-cycle");
    const firstDeck = await decks.createDeck(ctx, { name: "First" });
    const secondDeck = await decks.createDeck(ctx, { name: "Second" });
    const first = await basic(ctx, firstDeck.id, "A", "A");
    const second = await basic(ctx, secondDeck.id, "B", "B");

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
    await graph.refreshAfterPrerequisiteStateChange(ctx, a.id);

    expect(await graph.isUnlocked(ctx, b.id)).toBe(true);
    // C still waits on B, which is unlocked but not secured.
    expect(await graph.isUnlocked(ctx, c.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, b.id);

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
    await graph.refreshAfterPrerequisiteStateChange(ctx, a.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await securePrereq(ctx, b.id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, b.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
  });

  it("uses the dependent deck's prerequisite stability floor and refreshes on change", async () => {
    const ctx = await makeContext("edge-deck-floor");
    await settings.updateSettings(ctx, { prereqStabilityFloor: 2 });
    const prereqDeck = await decks.createDeck(ctx, { name: "Prereqs" });
    const dependentDeck = await decks.createDeck(ctx, { name: "Dependents" });
    const prereq = await basic(ctx, prereqDeck.id, "P", "P");
    const dependent = await basic(ctx, dependentDeck.id, "D", "D");

    await graph.addPrereq(ctx, prereq.id, dependent.id);
    await securePrereq(ctx, prereq.id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, prereq.id);

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);

    await settings.updateDeckSettings(ctx, dependentDeck.id, {
      prereqStabilityFloor: 3,
    });

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await settings.updateDeckSettings(ctx, dependentDeck.id, {
      prereqStabilityFloor: null,
    });

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
  });

  it("archive and unarchive of an unsecured prerequisite toggles dependent locking", async () => {
    const ctx = await makeContext("edge-archive-unsecured");
    const deck = await decks.createDeck(ctx, { name: "Archive" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);
    expect(isPendingSchedule(await getOnlyReviewUnit(ctx, dependent.id))).toBe(true);

    await notes.setArchived(ctx, prereq.id, true);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    let dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(dependentCard.locked).toBe(false);
    expect(isPendingSchedule(dependentCard)).toBe(false);

    await notes.setArchived(ctx, prereq.id, false);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);
    dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(dependentCard.locked).toBe(true);
    expect(isPendingSchedule(dependentCard)).toBe(true);
  });

  it("archive and unarchive of a secured prerequisite keeps dependents unlocked", async () => {
    const ctx = await makeContext("edge-archive-secured");
    const deck = await decks.createDeck(ctx, { name: "Archive secured" });
    const prereq = await basic(ctx, deck.id, "P", "P");
    const dependent = await basic(ctx, deck.id, "D", "D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    await securePrereq(ctx, prereq.id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, prereq.id);
    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);

    await notes.setArchived(ctx, prereq.id, true);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);

    await notes.setArchived(ctx, prereq.id, false);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);
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

describe("global graph", () => {
  it("returns flashcards and edges across every deck, tagged by deck", async () => {
    const ctx = await makeContext("global-graph");
    const algebra = await decks.createDeck(ctx, { name: "Algebra" });
    const calculus = await decks.createDeck(ctx, { name: "Calculus" });
    const prereq = await basic(ctx, algebra.id, "Vectors", "Magnitude + direction");
    const dependent = await basic(ctx, calculus.id, "Gradient", "Vector of partials");
    // A cross-deck edge: the prereq lives in Algebra, the dependent in Calculus.
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const result = await graph.getGlobalGraph(ctx);

    expect(result.nodes.map((n) => n.id).sort()).toEqual(
      [prereq.id, dependent.id].sort(),
    );
    expect(result.nodes.find((n) => n.id === prereq.id)?.deckId).toBe(algebra.id);
    expect(result.nodes.find((n) => n.id === dependent.id)?.deckId).toBe(
      calculus.id,
    );
    expect(result.edges).toEqual([
      { prereqId: prereq.id, dependentId: dependent.id },
    ]);
  });

  it("saveGlobalLayout persists positions regardless of deck", async () => {
    const ctx = await makeContext("global-layout");
    const first = await decks.createDeck(ctx, { name: "First" });
    const second = await decks.createDeck(ctx, { name: "Second" });
    const a = await basic(ctx, first.id, "A", "A");
    const b = await basic(ctx, second.id, "B", "B");

    await graph.saveGlobalLayout(ctx, [
      { flashcardId: a.id, x: 10, y: 20 },
      { flashcardId: b.id, x: 30, y: 40 },
    ]);

    expect(await notes.getFlashcard(ctx, a.id)).toMatchObject({ posX: 10, posY: 20 });
    expect(await notes.getFlashcard(ctx, b.id)).toMatchObject({ posX: 30, posY: 40 });
  });
});
