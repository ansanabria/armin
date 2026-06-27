import { describe, expect, it } from "vitest";
import { getOnlyReviewUnit, makeContext, useTestDb } from "../test/db";
import * as browse from "./browse";
import * as decks from "./decks";
import * as graph from "./graph";
import * as flashcards from "./flashcards";
import * as review from "./review";
import { State } from "./scheduler";

useTestDb();

function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
  tags?: string[],
) {
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
    tags,
  });
}

describe("browse filters", () => {
  it("filters by card state", async () => {
    const ctx = await makeContext("browse-state");
    const deck = await decks.createDeck(ctx, { name: "States" });
    const fresh = await basic(ctx, deck.id, "Fresh", "A");
    const studied = await basic(ctx, deck.id, "Studied", "B");

    const studiedCard = await getOnlyReviewUnit(ctx, studied.id);
    await review.rateReviewUnit(ctx, studiedCard.id, 3);
    const ratedState = (await getOnlyReviewUnit(ctx, studied.id)).state;
    expect(ratedState).not.toBe(State.New);

    const newOnly = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      state: State.New,
    });
    expect(newOnly.flashcards.map((card) => card.id)).toEqual([fresh.id]);

    const ratedOnly = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      state: ratedState,
    });
    expect(ratedOnly.flashcards.map((card) => card.id)).toEqual([studied.id]);
  });

  it("sorts locked cards first and last", async () => {
    const ctx = await makeContext("browse-locked");
    const deck = await decks.createDeck(ctx, { name: "Locks" });
    const prereq = await basic(ctx, deck.id, "A prereq", "P");
    const dependent = await basic(ctx, deck.id, "Z dependent", "D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const lockedFirst = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "locked-first",
    });
    expect(lockedFirst.flashcards[0].id).toBe(dependent.id);
    expect(lockedFirst.flashcards[0].locked).toBe(true);

    const lockedLast = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "locked-last",
    });
    expect(lockedLast.flashcards[0].id).toBe(prereq.id);
  });
});
