import { eq } from "drizzle-orm";
import { Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../db";
import { getOnlyReviewUnit, makeContext, useTestDb } from "../test/db";
import * as notes from "./flashcards";
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
  return notes.createFlashcard({
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
    const card = await getOnlyReviewUnit(ctx, note.id);

    await review.rateReviewUnit(ctx, card.id, Rating.Good);
    await ctx.db
      .update(schema.reviewUnits)
      .set({ due: new Date("2099-01-01T00:00:00.000Z") })
      .where(eq(schema.reviewUnits.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.reviewUnitId)).not.toContain(card.id);
  });

  it("includes learning cards that are due now", async () => {
    const ctx = await makeContext("learning-due");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Learning" });
    const note = await basic(ctx, deck.id, "Learn", "Answer");
    const card = await getOnlyReviewUnit(ctx, note.id);

    await review.rateReviewUnit(ctx, card.id, Rating.Again);
    await ctx.db
      .update(schema.reviewUnits)
      .set({ due: FIXED_NOW, state: State.Learning })
      .where(eq(schema.reviewUnits.id, card.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.some((item) => item.reviewUnitId === card.id)).toBe(true);
  });

  it("shares the daily new-card cap across decks in the global queue", async () => {
    const ctx = await makeContext("global-cap");
    await settings.updateSettings(ctx, { newReviewUnitsPerDay: 1 });

    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });

    await basic(ctx, deckA.id, "A1", "A");
    await basic(ctx, deckB.id, "B1", "B");

    const queue = await review.getGlobalQueue(ctx);
    expect(queue).toHaveLength(1);
  });

  it("previewReviewUnit offers four graded outcomes without committing", async () => {
    const ctx = await makeContext("preview");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Preview" });
    const note = await basic(ctx, deck.id, "Peek", "Answer");
    const card = await getOnlyReviewUnit(ctx, note.id);

    const options = await review.previewReviewUnit(ctx, card.id);

    expect(options.map((option) => option.rating)).toEqual([
      Rating.Again,
      Rating.Hard,
      Rating.Good,
      Rating.Easy,
    ]);
    for (const option of options) {
      expect(option.due.getTime()).toBeGreaterThanOrEqual(FIXED_NOW.getTime());
      expect(option.label).toMatch(/^\d+(\.\d+)?(m|h|d|mo|y)$/);
    }
    // Easy never schedules sooner than Again.
    expect(options[3].due.getTime()).toBeGreaterThanOrEqual(
      options[0].due.getTime(),
    );

    // Preview must not mutate the card or write a review log.
    const untouched = await getOnlyReviewUnit(ctx, note.id);
    expect(untouched.reps).toBe(0);
    expect(untouched.state).toBe(State.New);
  });

  it("scopes the daily new-card count per deck for deck queues", async () => {
    const ctx = await makeContext("per-deck-cap");
    await settings.updateSettings(ctx, { newReviewUnitsPerDay: 1 });

    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });
    const noteA = await basic(ctx, deckA.id, "A1", "A");
    await basic(ctx, deckB.id, "B1", "B");

    const cardA = await getOnlyReviewUnit(ctx, noteA.id);
    await review.rateReviewUnit(ctx, cardA.id, Rating.Good);

    expect(await review.countNewReviewUnitsIntroducedToday(ctx, deckA.id)).toBe(1);
    expect(await review.countNewReviewUnitsIntroducedToday(ctx, deckB.id)).toBe(0);
    expect(await review.countNewReviewUnitsIntroducedToday(ctx)).toBe(1);

    // Deck B's own allowance is untouched by deck A's introduction.
    const queueB = await review.getQueue(ctx, deckB.id);
    expect(queueB.filter((item) => item.deckId === deckB.id)).toHaveLength(1);
  });

  it("labels global queue items with their deck name", async () => {
    const ctx = await makeContext("global-deck-name");
    const deck = await decks.createDeck(ctx, { name: "Named deck" });
    await basic(ctx, deck.id, "Q", "A");

    const queue = await review.getGlobalQueue(ctx);
    expect(queue).toHaveLength(1);
    expect(queue[0].deckName).toBe("Named deck");
  });

  it("unlocks dependents through real rateReviewUnit progression", async () => {
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

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);

    const prereqCard = await getOnlyReviewUnit(ctx, prereq.id);
    await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
    let prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    while (prereqState.state !== State.Review || prereqState.stability < 0.5) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await ctx.db
        .update(schema.reviewUnits)
        .set({ due: new Date() })
        .where(eq(schema.reviewUnits.id, prereqCard.id))
        .run();
      await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
      prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    }

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
    const dependentCard = await getOnlyReviewUnit(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard)).toBe(false);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.flashcardId)).toContain(dependent.id);
  });

  it("undoReview restores FSRS state and removes the last log", async () => {
    const ctx = await makeContext("undo-review");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Undo" });
    const note = await basic(ctx, deck.id, "Q", "A");
    const card = await getOnlyReviewUnit(ctx, note.id);

    await review.rateReviewUnit(ctx, card.id, Rating.Good);
    const afterRate = await getOnlyReviewUnit(ctx, note.id);
    expect(afterRate.reps).toBe(1);

    const logsBefore = await ctx.db.select().from(schema.reviewLogs).all();
    expect(logsBefore).toHaveLength(1);

    const undone = await review.undoReview(ctx, card.id);
    expect(undone?.reviewUnitId).toBe(card.id);

    const restored = await getOnlyReviewUnit(ctx, note.id);
    expect(restored.reps).toBe(0);
    expect(restored.state).toBe(State.New);

    const logsAfter = await ctx.db.select().from(schema.reviewLogs).all();
    expect(logsAfter).toHaveLength(0);
  });

  it("undoReview re-locks dependents when a prereq is no longer secured", async () => {
    const ctx = await makeContext("undo-relock");
    await settings.updateSettings(ctx, {
      enableFuzz: false,
      prereqStabilityFloor: 0.5,
      learningSteps: "1m",
      enableShortTerm: false,
    });

    const deck = await decks.createDeck(ctx, { name: "UndoRelock" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base");
    const dependent = await basic(ctx, deck.id, "Advanced", "Top");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const prereqCard = await getOnlyReviewUnit(ctx, prereq.id);
    await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
    let prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    while (prereqState.state !== State.Review || prereqState.stability < 0.5) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await ctx.db
        .update(schema.reviewUnits)
        .set({ due: new Date() })
        .where(eq(schema.reviewUnits.id, prereqCard.id))
        .run();
      await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
      prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    }

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);

    await review.undoReview(ctx, prereqCard.id);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);
  });

  it("excludes archived cards from the review queue", async () => {
    const ctx = await makeContext("archive-queue");
    const deck = await decks.createDeck(ctx, { name: "Archive" });
    const note = await basic(ctx, deck.id, "Q", "A");

    let queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.flashcardId)).toContain(note.id);

    await notes.setArchived(ctx, note.id, true);

    queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.flashcardId)).not.toContain(note.id);

    const hydrated = await notes.getFlashcard(ctx, note.id);
    expect(hydrated?.archived).toBe(true);
  });

  it("keeps archived notes visible in browse", async () => {
    const ctx = await makeContext("archive-browse");
    const deck = await decks.createDeck(ctx, { name: "BrowseArchive" });
    const note = await basic(ctx, deck.id, "Q", "A");
    await notes.setArchived(ctx, note.id, true);

    const page = await import("./browse").then((m) =>
      m.listBrowsePage(ctx, { offset: 0, limit: 50, sort: "created-new" }),
    );
    expect(page.flashcards.some((c) => c.id === note.id && c.archived)).toBe(true);
  });
});
