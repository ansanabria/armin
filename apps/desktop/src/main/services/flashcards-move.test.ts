import { describe, expect, it } from "vitest";
import {
  getOnlyReviewUnit,
  makeContext,
  reviewLogsFor,
  useTestDb,
} from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as flashcards from "./flashcards";
import * as review from "./review";

useTestDb();

function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
) {
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back: front },
  });
}

describe("moveFlashcard", () => {
  it("isolated flashcard moves to another deck and keeps review history", async () => {
    const ctx = await makeContext("move-isolated");
    const source = await decks.createDeck(ctx, { name: "Source" });
    const target = await decks.createDeck(ctx, { name: "Target" });
    const card = await basic(ctx, source.id, "Card");

    const reviewUnit = await getOnlyReviewUnit(ctx, card.id);
    await review.rateReviewUnit(ctx, reviewUnit.id, 3);
    expect(await reviewLogsFor(ctx, reviewUnit.id)).toHaveLength(1);

    const moved = await flashcards.moveFlashcard(ctx, card.id, target.id);
    expect(moved?.deckId).toBe(target.id);

    // The review unit and its logged history survive the move.
    const movedReviewUnit = await getOnlyReviewUnit(ctx, card.id);
    expect(movedReviewUnit.id).toBe(reviewUnit.id);
    expect(movedReviewUnit.deckId).toBe(target.id);
    expect(await reviewLogsFor(ctx, reviewUnit.id)).toHaveLength(1);
  });

  it("connected flashcard move deletes incoming and outgoing prerequisite edges", async () => {
    const ctx = await makeContext("move-connected");
    const source = await decks.createDeck(ctx, { name: "Source" });
    const target = await decks.createDeck(ctx, { name: "Target" });
    const prereq = await basic(ctx, source.id, "Prereq");
    const middle = await basic(ctx, source.id, "Middle");
    const dependent = await basic(ctx, source.id, "Dependent");
    await graph.addPrereq(ctx, prereq.id, middle.id);
    await graph.addPrereq(ctx, middle.id, dependent.id);

    const consequences = await flashcards.getMoveConsequences(ctx, middle.id);
    expect(consequences).toEqual({ prerequisiteCount: 1, dependentCount: 1 });

    await flashcards.moveFlashcard(ctx, middle.id, target.id);

    expect(await graph.getPrereqIds(ctx, middle.id)).toEqual([]);
    expect(await graph.getDependentIds(ctx, middle.id)).toEqual([]);
    // The surrounding cards no longer reference the moved one.
    expect(await graph.getDependentIds(ctx, prereq.id)).toEqual([]);
    expect(await graph.getPrereqIds(ctx, dependent.id)).toEqual([]);
  });

  it("move recomputes lock state for the moved flashcard and prior dependents", async () => {
    const ctx = await makeContext("move-locks");
    const source = await decks.createDeck(ctx, { name: "Source" });
    const target = await decks.createDeck(ctx, { name: "Target" });
    const prereq = await basic(ctx, source.id, "Prereq");
    const dependent = await basic(ctx, source.id, "Dependent");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    // The dependent starts locked behind its unsecured prerequisite.
    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );

    // Moving the prerequisite away severs the edge and unlocks the dependent.
    await flashcards.moveFlashcard(ctx, prereq.id, target.id);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);
    // The moved prerequisite is unlocked in its new deck.
    expect((await flashcards.getFlashcard(ctx, prereq.id))?.locked).toBe(false);
  });

});
