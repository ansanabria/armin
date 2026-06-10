import { eq } from "drizzle-orm";
import { Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../db";
import { getOnlyCard, makeContext, useTestDb } from "../test/db";
import * as notes from "./notes";
import * as decks from "./decks";
import * as graph from "./graph";
import * as review from "./review";
import * as settings from "./settings";
import { isPendingSchedule, State } from "./scheduler";

useTestDb();

const FIXED_NOW = new Date("2026-06-08T12:00:00.000Z");

function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
) {
  return notes.createNote({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("review workflow", () => {
  it("excludes future-due review cards from the queue", async () => {
    const ctx = await makeContext("future-due");
    const deck = await decks.createDeck(ctx, { name: "Future" });
    const note = await basic(ctx, deck.id, "Later", "Answer");
    const card = await getOnlyCard(ctx, note.id);

    await review.rateCard(ctx, card.id, Rating.Good);
    await ctx.db
      .update(schema.cards)
      .set({ due: new Date("2099-01-01T00:00:00.000Z") })
      .where(eq(schema.cards.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.cardId)).not.toContain(card.id);
  });

  it("includes learning cards that are due now", async () => {
    const ctx = await makeContext("learning-due");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Learning" });
    const note = await basic(ctx, deck.id, "Learn", "Answer");
    const card = await getOnlyCard(ctx, note.id);

    await review.rateCard(ctx, card.id, Rating.Again);
    await ctx.db
      .update(schema.cards)
      .set({ due: FIXED_NOW, state: State.Learning })
      .where(eq(schema.cards.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.some((item) => item.cardId === card.id)).toBe(true);
  });

  it("shares the daily new-card cap across decks in the global queue", async () => {
    const ctx = await makeContext("global-cap");
    await settings.updateSettings(ctx, { newCardsPerDay: 1 });

    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });

    await basic(ctx, deckA.id, "A1", "A");
    await basic(ctx, deckB.id, "B1", "B");

    const queue = await review.getGlobalQueue(ctx);
    expect(queue).toHaveLength(1);
  });

  it("unlocks dependents through real rateCard progression", async () => {
    const ctx = await makeContext("rate-unlock");
    await settings.updateSettings(ctx, {
      enableFuzz: false,
      prereqStabilityFloor: 0.5,
      learningSteps: "1m",
      enableShortTerm: false,
    });

    const deck = await decks.createDeck(ctx, { name: "Unlock" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base");
    const dependent = await basic(ctx, deck.id, "Advanced", "Top");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await notes.getNote(ctx, dependent.id))?.locked).toBe(true);

    const prereqCard = await getOnlyCard(ctx, prereq.id);
    await review.rateCard(ctx, prereqCard.id, Rating.Good);
    let prereqState = await getOnlyCard(ctx, prereq.id);
    while (prereqState.state !== State.Review || prereqState.stability < 0.5) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await ctx.db
        .update(schema.cards)
        .set({ due: new Date() })
        .where(eq(schema.cards.id, prereqCard.id))
        .run();
      await review.rateCard(ctx, prereqCard.id, Rating.Good);
      prereqState = await getOnlyCard(ctx, prereq.id);
    }

    expect((await notes.getNote(ctx, dependent.id))?.locked).toBe(false);
    const dependentCard = await getOnlyCard(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard)).toBe(false);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.noteId)).toContain(dependent.id);
  });
});
