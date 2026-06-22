import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../db";
import { getOnlyReviewUnit, makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as flashcards from "./flashcards";
import * as review from "./review";

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

async function tableCount(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  table:
    | typeof schema.flashcards
    | typeof schema.reviewUnits
    | typeof schema.flashcardPrereqs
    | typeof schema.reviewLogs,
) {
  const row = await ctx.db.select({ value: count() }).from(table).get();
  return row?.value ?? 0;
}

describe("deck lifecycle", () => {
  it("getDeck returns stats", async () => {
    const ctx = await makeContext("deck-get");
    const deck = await decks.createDeck(ctx, {
      name: "Stats",
      description: "About stats",
    });
    await basic(ctx, deck.id, "Q", "A");

    const found = await decks.getDeck(ctx, deck.id);
    expect(found).toMatchObject({
      id: deck.id,
      name: "Stats",
      description: "About stats",
      total: 1,
      newCount: 1,
    });
  });

  it("updateDeck patches name and description", async () => {
    const ctx = await makeContext("deck-update");
    const deck = await decks.createDeck(ctx, { name: "Before" });

    const renamed = await decks.updateDeck(ctx, deck.id, { name: "After" });
    expect(renamed?.name).toBe("After");

    const described = await decks.updateDeck(ctx, deck.id, {
      description: "Now described",
    });
    expect(described?.name).toBe("After");
    expect(described?.description).toBe("Now described");
  });

  it("deleteDeck cascades Flashcards, Review units, edges, and review logs", async () => {
    const ctx = await makeContext("deck-delete");
    const doomed = await decks.createDeck(ctx, { name: "Doomed" });
    const survivor = await decks.createDeck(ctx, { name: "Survivor" });

    const prereq = await basic(ctx, doomed.id, "P", "P", ["doomed-tag"]);
    const dependent = await basic(ctx, doomed.id, "D", "D");
    await graph.addPrereq(ctx, prereq.id, dependent.id);
    await basic(ctx, survivor.id, "Keep", "Me");

    const prereqCard = await getOnlyReviewUnit(ctx, prereq.id);
    await review.rateReviewUnit(ctx, prereqCard.id, 3);
    expect(await tableCount(ctx, schema.reviewLogs)).toBe(1);

    await decks.deleteDeck(ctx, doomed.id);

    expect(await decks.getDeck(ctx, doomed.id)).toBeUndefined();
    expect(await tableCount(ctx, schema.flashcardPrereqs)).toBe(0);
    expect(await tableCount(ctx, schema.reviewLogs)).toBe(0);
    expect(await tableCount(ctx, schema.flashcards)).toBe(1);
    expect(await tableCount(ctx, schema.reviewUnits)).toBe(1);

    const remainingFlashcards = await ctx.db
      .select()
      .from(schema.flashcards)
      .where(eq(schema.flashcards.deckId, survivor.id))
      .all();
    expect(remainingFlashcards).toHaveLength(1);
  });
  it("deck stats track due, learning, and learned counts", async () => {
    const ctx = await makeContext("deck-stats");
    const deck = await decks.createDeck(ctx, { name: "Counts" });
    const note = await basic(ctx, deck.id, "Q", "A");

    const card = await getOnlyReviewUnit(ctx, note.id);
    await review.rateReviewUnit(ctx, card.id, 3);

    const [stats] = await decks.listDecks(ctx);
    expect(stats.total).toBe(1);
    expect(stats.newCount).toBe(0);
    expect(stats.learning + stats.learned).toBe(1);
  });
});
