import { describe, expect, it } from "vitest";
import { getOnlyCard, makeContext, useTestDb } from "../test/db";
import * as browse from "./browse";
import * as decks from "./decks";
import * as graph from "./graph";
import * as notes from "./notes";
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
  return notes.createNote({
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

    const studiedCard = await getOnlyCard(ctx, studied.id);
    await review.rateCard(ctx, studiedCard.id, 3);
    const ratedState = (await getOnlyCard(ctx, studied.id)).state;
    expect(ratedState).not.toBe(State.New);

    const newOnly = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      state: State.New,
    });
    expect(newOnly.cards.map((card) => card.id)).toEqual([fresh.id]);

    const ratedOnly = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      state: ratedState,
    });
    expect(ratedOnly.cards.map((card) => card.id)).toEqual([studied.id]);
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
    expect(lockedFirst.cards[0].id).toBe(dependent.id);
    expect(lockedFirst.cards[0].locked).toBe(true);

    const lockedLast = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "locked-last",
    });
    expect(lockedLast.cards[0].id).toBe(prereq.id);
  });
});
