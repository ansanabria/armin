import { eq } from "drizzle-orm";
import { Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as cards from "./cards";
import * as decks from "./decks";
import * as graph from "./graph";
import * as review from "./review";
import * as settings from "./settings";
import { isPendingSchedule, State } from "./scheduler";

useTestDb();

const FIXED_NOW = new Date("2026-06-08T12:00:00.000Z");

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
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Later",
      back: "Answer",
    });

    await review.rateCard(ctx, card.id, Rating.Good);
    await ctx.db
      .update(schema.cards)
      .set({ due: new Date("2099-01-01T00:00:00.000Z") })
      .where(eq(schema.cards.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((c) => c.id)).not.toContain(card.id);
  });

  it("includes learning cards that are due now", async () => {
    const ctx = await makeContext("learning-due");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Learning" });
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Learn",
      back: "Answer",
    });

    await review.rateCard(ctx, card.id, Rating.Again);
    await ctx.db
      .update(schema.cards)
      .set({ due: FIXED_NOW, state: State.Learning })
      .where(eq(schema.cards.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.some((c) => c.id === card.id)).toBe(true);
  });

  it("shares the daily new-card cap across decks in the global queue", async () => {
    const ctx = await makeContext("global-cap");
    await settings.updateSettings(ctx, { newCardsPerDay: 1 });

    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });

    await cards.createCard({
      ctx,
      deckId: deckA.id,
      front: "A1",
      back: "A",
    });
    await cards.createCard({
      ctx,
      deckId: deckB.id,
      front: "B1",
      back: "B",
    });

    const queue = await review.getGlobalQueue(ctx);
    expect(queue).toHaveLength(1);
    expect(queue[0].state).toBe(State.New);
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
    const prereq = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Foundation",
      back: "Base",
    });
    const dependent = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Advanced",
      back: "Top",
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await cards.getCard(ctx, dependent.id))?.locked).toBe(true);

    let rated = await review.rateCard(ctx, prereq.id, Rating.Good);
    while (rated.state !== State.Review || rated.stability < 0.5) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await ctx.db
        .update(schema.cards)
        .set({ due: new Date() })
        .where(eq(schema.cards.id, prereq.id))
        .run();
      rated = await review.rateCard(ctx, prereq.id, Rating.Good);
    }

    const dependentCard = await cards.getCard(ctx, dependent.id);
    expect(dependentCard?.locked).toBe(false);
    expect(isPendingSchedule(dependentCard!)).toBe(false);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((c) => c.id)).toContain(dependent.id);
  });
});
