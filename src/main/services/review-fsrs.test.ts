import { count, eq } from "drizzle-orm";
import { createEmptyCard, fsrs, Rating, type Card as FsrsCard } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as cards from "./cards";
import * as decks from "./decks";
import * as review from "./review";
import * as settings from "./settings";
import { fromFsrsCard, toFsrsCard } from "./scheduler";

useTestDb();

const FIXED_NOW = new Date("2026-06-08T12:00:00.000Z");

function referenceScheduler() {
  return fsrs({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("review FSRS integration", () => {
  async function ctxWithDeterministicFsrs() {
    const ctx = await makeContext("fsrs");
    await settings.updateSettings(ctx, { enableFuzz: false });
    return ctx;
  }

  it("previewCard matches ts-fsrs repeat for all ratings", async () => {
    const ctx = await ctxWithDeterministicFsrs();
    const deck = await decks.createDeck(ctx, { name: "Preview" });
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Q",
      back: "A",
    });

    const scheduler = referenceScheduler();
    const dbCard = await cards.getCard(ctx, card.id);
    const preview = scheduler.repeat(toFsrsCard(dbCard!), FIXED_NOW);

    const options = await review.previewCard(ctx, card.id);
    expect(options).toHaveLength(4);

    for (const option of options) {
      const expected = preview[option.rating as Rating].card;
      const actual = options.find((o) => o.rating === option.rating);
      expect(actual?.due).toEqual(expected.due);
    }
  });

  it("rateCard persists ts-fsrs next state and review log", async () => {
    const ctx = await ctxWithDeterministicFsrs();
    const deck = await decks.createDeck(ctx, { name: "Rate" });
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Q",
      back: "A",
    });

    const scheduler = referenceScheduler();
    const dbCard = await cards.getCard(ctx, card.id);
    const { card: expected, log } = scheduler.next(
      toFsrsCard(dbCard!),
      FIXED_NOW,
      Rating.Good,
    );

    const rated = await review.rateCard(ctx, card.id, Rating.Good);
    const persisted = fromFsrsCard(toFsrsCard(rated));

    expect(persisted.due).toEqual(expected.due);
    expect(persisted.stability).toBeCloseTo(expected.stability, 5);
    expect(persisted.difficulty).toBeCloseTo(expected.difficulty, 5);
    expect(persisted.state).toBe(expected.state);
    expect(persisted.reps).toBe(expected.reps);
    expect(rated.lastReview).toBeInstanceOf(Date);

    const logRow = await ctx.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.cardId, card.id))
      .get();

    expect(logRow).toBeDefined();
    expect(logRow!.rating).toBe(log.rating);
    expect(logRow!.state).toBe(log.state);
    expect(logRow!.due).toEqual(log.due);
    expect(logRow!.stability).toBeCloseTo(log.stability, 5);
    expect(logRow!.difficulty).toBeCloseTo(log.difficulty, 5);
    expect(logRow!.elapsedDays).toBeCloseTo(log.elapsed_days, 5);
    expect(logRow!.scheduledDays).toBeCloseTo(log.scheduled_days, 5);
    expect(logRow!.learningSteps).toBe(log.learning_steps);
  });

  it("first Good rating transitions a new card out of New state", async () => {
    const ctx = await ctxWithDeterministicFsrs();
    const deck = await decks.createDeck(ctx, { name: "New" });
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Q",
      back: "A",
    });

    const rated = await review.rateCard(ctx, card.id, Rating.Good);
    expect(rated.reps).toBeGreaterThan(0);

    const scheduler = referenceScheduler();
    const empty: FsrsCard = createEmptyCard(FIXED_NOW);
    const { card: expected } = scheduler.next(empty, FIXED_NOW, Rating.Good);
    expect(rated.state).toBe(expected.state);
  });

  it("Again on a mature card records a lapse in review log", async () => {
    const ctx = await ctxWithDeterministicFsrs();
    const deck = await decks.createDeck(ctx, { name: "Lapse" });
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Q",
      back: "A",
    });

    await review.rateCard(ctx, card.id, Rating.Good);
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

    const matured = await cards.getCard(ctx, card.id);
    await ctx.db
      .update(schema.cards)
      .set({ due: new Date("2026-06-15T12:00:00.000Z") })
      .where(eq(schema.cards.id, card.id))
      .run();

    const scheduler = referenceScheduler();
    const { card: expected } = scheduler.next(
      toFsrsCard(matured!),
      new Date("2026-06-15T12:00:00.000Z"),
      Rating.Again,
    );

    const rated = await review.rateCard(ctx, card.id, Rating.Again);
    expect(rated.lapses).toBe(expected.lapses);

    const logCount = await ctx.db
      .select({ value: count() })
      .from(schema.reviewLogs)
      .get();
    expect(logCount?.value).toBe(2);
  });
});
