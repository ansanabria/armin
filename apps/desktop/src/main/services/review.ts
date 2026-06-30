import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import { schema } from "../db";
import type { ReviewUnit } from "../db/schema";
import {
  parseStoredContent,
  type FlashcardContent,
  type FlashcardType,
} from "./flashcard-types";
import type { ServiceContext } from "./context";
import { refreshAfterPrerequisiteReview } from "./prerequisite-state";
import {
  buildScheduler,
  fromFsrsCard,
  isPendingSchedule,
  State,
  toFsrsCard,
} from "./scheduler";
import {
  getEffectiveSettingsForDeck,
  getSettings,
  type SchedulingSettings,
} from "./settings";
import { shuffle } from "./shuffle";

const { reviewUnits, decks, flashcards, reviewLogs } = schema;

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/**
 * A queued review unit. It carries the FSRS-scheduled `reviewUnitId` plus the
 * owning flashcard's type and content, so the renderer can branch its
 * presentation while `previewReviewUnit`/`rateReviewUnit` keep operating on the
 * review unit.
 */
export type ReviewQueueItem = {
  reviewUnitId: string;
  flashcardId: string;
  deckId: string;
  deckName?: string;
  type: FlashcardType;
  subKey: string;
  content: FlashcardContent;
  front: string;
  back: string;
};

function formatInterval(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(ms / 3600000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(ms / 86400000);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** First-time ratings logged today across the Profile-wide Frontier. */
export async function countNewReviewUnitsIntroducedToday(
  ctx: ServiceContext,
): Promise<number> {
  const since = startOfToday();
  const rows = ctx.db
    .select({ reviewUnitId: reviewLogs.reviewUnitId })
    .from(reviewLogs)
    .where(and(gte(reviewLogs.review, since), eq(reviewLogs.state, State.New)))
    .all();
  return new Set(rows.map((row) => row.reviewUnitId)).size;
}

/**
 * Build a session queue: due reviews first (shuffled), then frontier new review
 * units (shuffled, capped by the daily new-review-unit limit). Operates on
 * review-unit rows; locked units are filtered via the denormalized `locked` flag.
 */
export async function buildSessionQueue(
  ctx: ServiceContext,
  deckReviewUnits: ReviewUnit[],
): Promise<ReviewUnit[]> {
  const now = new Date();
  const unlocked = deckReviewUnits.filter(
    (reviewUnit) => !reviewUnit.locked && !reviewUnit.archived,
  );

  const reviews = unlocked.filter(
    (reviewUnit) =>
      !isPendingSchedule(reviewUnit) &&
      reviewUnit.state !== State.New &&
      reviewUnit.due <= now,
  );

  const frontier = unlocked.filter(
    (reviewUnit) =>
      !isPendingSchedule(reviewUnit) &&
      reviewUnit.state === State.New &&
      reviewUnit.lastReview == null &&
      reviewUnit.due <= now,
  );

  const cappedFrontier = await selectFrontier(ctx, frontier);

  return [...shuffle([...reviews]), ...cappedFrontier];
}

async function selectFrontier(
  ctx: ServiceContext,
  frontier: ReviewUnit[],
): Promise<ReviewUnit[]> {
  const settings = await getSettings(ctx);
  const introducedToday = await countNewReviewUnitsIntroducedToday(ctx);
  const remaining = Math.max(
    0,
    settings.newReviewUnitsPerDay - introducedToday,
  );

  return settings.keepSiblingReviewUnitsTogether
    ? selectFrontierByFlashcard(frontier, remaining)
    : shuffle([...frontier]).slice(0, remaining);
}

function selectFrontierByFlashcard(
  frontier: ReviewUnit[],
  remaining: number,
): ReviewUnit[] {
  if (remaining <= 0) return [];

  const byFlashcardId = new Map<string, ReviewUnit[]>();
  for (const reviewUnit of frontier) {
    const siblings = byFlashcardId.get(reviewUnit.flashcardId) ?? [];
    siblings.push(reviewUnit);
    byFlashcardId.set(reviewUnit.flashcardId, siblings);
  }

  const selected: ReviewUnit[] = [];
  const seenFlashcards = new Set<string>();
  for (const reviewUnit of shuffle([...frontier])) {
    if (selected.length >= remaining) break;
    if (seenFlashcards.has(reviewUnit.flashcardId)) continue;

    seenFlashcards.add(reviewUnit.flashcardId);
    selected.push(...(byFlashcardId.get(reviewUnit.flashcardId) ?? []));
  }
  return selected;
}

/** Attach the owning flashcard's type/content to a set of review-unit rows. */
export async function toReviewQueueItems(
  ctx: ServiceContext,
  reviewUnitRows: ReviewUnit[],
  deckNameByReviewUnitId?: Map<string, string>,
): Promise<ReviewQueueItem[]> {
  if (reviewUnitRows.length === 0) return [];
  const flashcardIds = [
    ...new Set(reviewUnitRows.map((reviewUnit) => reviewUnit.flashcardId)),
  ];
  const flashcardRows = ctx.db
    .select({
      id: flashcards.id,
      type: flashcards.type,
      content: flashcards.content,
    })
    .from(flashcards)
    .where(inArray(flashcards.id, flashcardIds))
    .all();
  const flashcardById = new Map(
    flashcardRows.map((flashcard) => [
      flashcard.id,
      parseStoredContent(flashcard.type, flashcard.content),
    ]),
  );

  return reviewUnitRows.map((reviewUnit) => {
    const parsed = flashcardById.get(reviewUnit.flashcardId);
    if (!parsed) {
      throw new Error(
        `Flashcard ${reviewUnit.flashcardId} not found for review unit ${reviewUnit.id}`,
      );
    }
    return {
      reviewUnitId: reviewUnit.id,
      flashcardId: reviewUnit.flashcardId,
      deckId: reviewUnit.deckId,
      deckName: deckNameByReviewUnitId?.get(reviewUnit.id),
      type: parsed.type,
      subKey: reviewUnit.subKey,
      content: parsed.content,
      front: reviewUnit.front,
      back: reviewUnit.back,
    };
  });
}

/** Due, unlocked review units for a deck in session order. */
export async function getQueue(
  ctx: ServiceContext,
  deckId: string,
): Promise<ReviewQueueItem[]> {
  const deckReviewUnits = ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.deckId, deckId))
    .all();
  const ordered = await buildSessionQueue(ctx, deckReviewUnits);
  return toReviewQueueItems(ctx, ordered);
}

export async function getGlobalQueue(
  ctx: ServiceContext,
): Promise<ReviewQueueItem[]> {
  const rows = ctx.db
    .select({ reviewUnit: reviewUnits, deckName: decks.name })
    .from(reviewUnits)
    .innerJoin(decks, eq(reviewUnits.deckId, decks.id))
    .orderBy(asc(reviewUnits.due))
    .all();

  const ordered = await buildSessionQueue(
    ctx,
    rows.map(({ reviewUnit }) => reviewUnit),
  );
  const deckNameByReviewUnitId = new Map(
    rows.map(({ reviewUnit, deckName }) => [reviewUnit.id, deckName]),
  );

  return toReviewQueueItems(ctx, ordered, deckNameByReviewUnitId);
}

export type PreviewOption = { rating: Grade; due: Date; label: string };

/** Preview the four possible outcomes for a review unit without committing. */
export async function previewReviewUnit(
  ctx: ServiceContext,
  reviewUnitId: string,
): Promise<PreviewOption[]> {
  const reviewUnit = ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.id, reviewUnitId))
    .get();
  if (!reviewUnit) throw new Error(`Review unit ${reviewUnitId} not found`);
  const now = new Date();
  const scheduler = await buildSchedulerForReviewUnit(ctx, reviewUnit);
  const preview = scheduler.repeat(toFsrsCard(reviewUnit), now);
  return GRADES.map((rating) => {
    const due = preview[rating].card.due;
    return { rating, due, label: formatInterval(now, due) };
  });
}

/** Apply a rating: persist the new FSRS state and append a review log. */
export async function rateReviewUnit(
  ctx: ServiceContext,
  reviewUnitId: string,
  rating: Grade,
): Promise<ReviewQueueItem> {
  const now = new Date();
  const reviewUnit = ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.id, reviewUnitId))
    .get();
  if (!reviewUnit) throw new Error(`Review unit ${reviewUnitId} not found`);
  const scheduler = await buildSchedulerForReviewUnit(ctx, reviewUnit);
  const updated = ctx.db.transaction((tx) => {
    const { card: next, log } = scheduler.next(
      toFsrsCard(reviewUnit),
      now,
      rating,
    );

    const updated = tx
      .update(reviewUnits)
      .set({ ...fromFsrsCard(next), updatedAt: now })
      .where(eq(reviewUnits.id, reviewUnitId))
      .returning()
      .get();

    tx.insert(reviewLogs)
      .values({
        reviewUnitId,
        rating: log.rating,
        state: log.state,
        due: log.due,
        stability: log.stability,
        difficulty: log.difficulty,
        elapsedDays: log.elapsed_days,
        lastElapsedDays: log.last_elapsed_days,
        scheduledDays: log.scheduled_days,
        learningSteps: log.learning_steps,
        review: log.review,
      })
      .run();

    return updated!;
  });

  await refreshAfterPrerequisiteReview(ctx, updated.flashcardId);
  const [item] = await toReviewQueueItems(ctx, [updated]);
  return item;
}

/** Revert the most recent review for a review unit using FSRS rollback. */
export async function undoReview(
  ctx: ServiceContext,
  reviewUnitId: string,
): Promise<ReviewQueueItem | null> {
  const reviewUnit = ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.id, reviewUnitId))
    .get();
  if (!reviewUnit) throw new Error(`Review unit ${reviewUnitId} not found`);

  const logRow = ctx.db
    .select()
    .from(reviewLogs)
    .where(eq(reviewLogs.reviewUnitId, reviewUnitId))
    .orderBy(desc(reviewLogs.review))
    .get();
  if (!logRow) return null;

  const scheduler = await buildSchedulerForReviewUnit(ctx, reviewUnit);
  const log = {
    rating: logRow.rating,
    state: logRow.state,
    due: logRow.due,
    stability: logRow.stability,
    difficulty: logRow.difficulty,
    elapsed_days: logRow.elapsedDays,
    last_elapsed_days: logRow.lastElapsedDays,
    scheduled_days: logRow.scheduledDays,
    learning_steps: logRow.learningSteps,
    review: logRow.review,
  };

  const now = new Date();
  const prev = scheduler.rollback(toFsrsCard(reviewUnit), log);

  const updated = ctx.db.transaction((tx) => {
    const rolled = tx
      .update(reviewUnits)
      .set({ ...fromFsrsCard(prev), updatedAt: now })
      .where(eq(reviewUnits.id, reviewUnitId))
      .returning()
      .get();

    tx.delete(reviewLogs).where(eq(reviewLogs.id, logRow.id)).run();
    return rolled!;
  });

  await refreshAfterPrerequisiteReview(ctx, updated.flashcardId);
  const [item] = await toReviewQueueItems(ctx, [updated]);
  return item;
}

async function buildSchedulerForReviewUnit(
  ctx: ServiceContext,
  reviewUnit: Pick<ReviewUnit, "deckId">,
) {
  const settings: SchedulingSettings = await getEffectiveSettingsForDeck(
    ctx,
    reviewUnit.deckId,
  );
  return buildScheduler(ctx, settings);
}
