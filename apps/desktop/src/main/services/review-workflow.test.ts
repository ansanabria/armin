import { Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countReviewLogs,
  getOnlyReviewUnit,
  makeContext,
  makeReviewUnitDue,
  makeReviewUnitLearningDue,
  useTestDb,
} from "../test/db";
import * as flashcards from "./flashcards";
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
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
  });
}

function basicReversed(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
) {
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic_reversed",
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
  it("excludes future-due Review units from the queue", async () => {
    const ctx = await makeContext("future-due");
    const deck = await decks.createDeck(ctx, { name: "Future" });
    const note = await basic(ctx, deck.id, "Later", "Answer");
    const card = await getOnlyReviewUnit(ctx, note.id);

    await review.rateReviewUnit(ctx, card.id, Rating.Good);
    await makeReviewUnitDue(ctx, card.id, new Date("2099-01-01T00:00:00.000Z"));

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.reviewUnitId)).not.toContain(card.id);
  });

  it("includes Learning Review units that are due now", async () => {
    const ctx = await makeContext("learning-due");
    await settings.updateSettings(ctx, { enableFuzz: false });
    const deck = await decks.createDeck(ctx, { name: "Learning" });
    const note = await basic(ctx, deck.id, "Learn", "Answer");
    const card = await getOnlyReviewUnit(ctx, note.id);

    await review.rateReviewUnit(ctx, card.id, Rating.Again);
    await makeReviewUnitLearningDue(ctx, card.id, FIXED_NOW);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.some((item) => item.reviewUnitId === card.id)).toBe(true);
  });

  it("applies the daily Frontier cap once across the global queue", async () => {
    const ctx = await makeContext("global-cap");
    await settings.updateSettings(ctx, { newReviewUnitsPerDay: 1 });

    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });

    await basic(ctx, deckA.id, "A1", "A");
    await basic(ctx, deckB.id, "B1", "B");

    const queue = await review.getGlobalQueue(ctx);
    expect(queue).toHaveLength(1);
    expect([deckA.id, deckB.id]).toContain(queue[0].deckId);
  });

  it("introduces all eligible siblings for a reversed flashcard together", async () => {
    const ctx = await makeContext("reversed-siblings");
    await settings.updateSettings(ctx, { newReviewUnitsPerDay: 1 });
    const deck = await decks.createDeck(ctx, { name: "Reversed" });
    const note = await basicReversed(ctx, deck.id, "F", "B");

    const queue = await review.getQueue(ctx, deck.id);

    expect(queue).toHaveLength(2);
    expect(new Set(queue.map((item) => item.flashcardId))).toEqual(
      new Set([note.id]),
    );
  });

  it("slices sibling review units individually when sibling grouping is disabled", async () => {
    const ctx = await makeContext("sibling-toggle-off");
    await settings.updateSettings(ctx, {
      newReviewUnitsPerDay: 1,
      keepSiblingReviewUnitsTogether: false,
    });
    const deck = await decks.createDeck(ctx, { name: "Toggle" });
    const note = await basicReversed(ctx, deck.id, "F", "B");

    const queue = await review.getQueue(ctx, deck.id);

    expect(queue).toHaveLength(1);
    expect(queue[0].flashcardId).toBe(note.id);
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

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );

    const prereqCard = await getOnlyReviewUnit(ctx, prereq.id);
    await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
    let prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    while (prereqState.state !== State.Review || prereqState.stability < 0.5) {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await makeReviewUnitDue(ctx, prereqCard.id);
      await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
      prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    }

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
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

    expect(await countReviewLogs(ctx)).toBe(1);

    const undone = await review.undoReview(ctx, card.id);
    expect(undone?.reviewUnitId).toBe(card.id);

    const restored = await getOnlyReviewUnit(ctx, note.id);
    expect(restored.reps).toBe(0);
    expect(restored.state).toBe(State.New);

    expect(await countReviewLogs(ctx)).toBe(0);
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
      await makeReviewUnitDue(ctx, prereqCard.id);
      await review.rateReviewUnit(ctx, prereqCard.id, Rating.Good);
      prereqState = await getOnlyReviewUnit(ctx, prereq.id);
    }

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );

    await review.undoReview(ctx, prereqCard.id);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      true,
    );
  });

  it("excludes Archived flashcards from the review queue", async () => {
    const ctx = await makeContext("archive-queue");
    const deck = await decks.createDeck(ctx, { name: "Archive" });
    const note = await basic(ctx, deck.id, "Q", "A");

    let queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.flashcardId)).toContain(note.id);

    await flashcards.setArchived(ctx, note.id, true);

    queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.flashcardId)).not.toContain(note.id);

    const hydrated = await flashcards.getFlashcard(ctx, note.id);
    expect(hydrated?.archived).toBe(true);
  });

});
