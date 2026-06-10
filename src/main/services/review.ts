import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import { schema } from "../db";
import type { Card } from "../db/schema";
import {
  parseStoredContent,
  type CardContent,
  type CardType,
} from "./card-types";
import type { ServiceContext } from "./context";
import { activateUnlockedDependents } from "./graph";
import {
  buildScheduler,
  fromFsrsCard,
  isPendingSchedule,
  State,
  toFsrsCard,
} from "./scheduler";
import { getSettings } from "./settings";
import { shuffle } from "./shuffle";

const { cards, decks, notes, reviewLogs } = schema;

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/**
 * A queued review item. It carries the FSRS-scheduled `cardId` plus the owning
 * note's type and content, so the renderer can branch its presentation while
 * `previewCard`/`rateCard` keep operating on the card.
 */
export type ReviewQueueItem = {
  cardId: string;
  noteId: string;
  deckId: string;
  deckName?: string;
  type: CardType;
  subKey: string;
  content: CardContent;
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

/** First-time ratings logged today, optionally scoped to one deck. */
export async function countNewCardsIntroducedToday(
  ctx: ServiceContext,
  deckId?: string,
): Promise<number> {
  const since = startOfToday();
  const conditions = [
    gte(reviewLogs.review, since),
    eq(reviewLogs.state, State.New),
  ];
  if (deckId) {
    const rows = await ctx.db
      .select({ cardId: reviewLogs.cardId })
      .from(reviewLogs)
      .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
      .where(and(...conditions, eq(cards.deckId, deckId)))
      .all();
    return new Set(rows.map((row) => row.cardId)).size;
  }

  const rows = await ctx.db
    .select({ cardId: reviewLogs.cardId })
    .from(reviewLogs)
    .where(and(...conditions))
    .all();
  return new Set(rows.map((row) => row.cardId)).size;
}

/**
 * Build a session queue: due reviews first (shuffled), then frontier new cards
 * (shuffled, capped by the daily new-card limit). Operates on review items
 * (`cards` rows); locked items are filtered via the denormalized `locked` flag.
 */
export async function buildSessionQueue(
  ctx: ServiceContext,
  deckCards: Card[],
  deckId?: string,
): Promise<Card[]> {
  const now = new Date();
  const { newCardsPerDay } = await getSettings(ctx);
  const unlocked = deckCards.filter((card) => !card.locked);

  const reviews = unlocked.filter(
    (card) =>
      !isPendingSchedule(card) && card.state !== State.New && card.due <= now,
  );

  const frontier = unlocked.filter(
    (card) =>
      !isPendingSchedule(card) &&
      card.state === State.New &&
      card.lastReview == null &&
      card.due <= now,
  );

  const introducedToday = await countNewCardsIntroducedToday(ctx, deckId);
  const remaining = Math.max(0, newCardsPerDay - introducedToday);
  const cappedFrontier = shuffle([...frontier]).slice(0, remaining);

  return [...shuffle([...reviews]), ...cappedFrontier];
}

/** Attach the owning note's type/content to a set of card rows. */
async function toReviewItems(
  ctx: ServiceContext,
  cardRows: Card[],
  deckNameByCardId?: Map<string, string>,
): Promise<ReviewQueueItem[]> {
  if (cardRows.length === 0) return [];
  const noteIds = [...new Set(cardRows.map((card) => card.noteId))];
  const noteRows = await ctx.db
    .select({ id: notes.id, type: notes.type, content: notes.content })
    .from(notes)
    .where(inArray(notes.id, noteIds))
    .all();
  const noteById = new Map(
    noteRows.map((note) => [
      note.id,
      parseStoredContent(note.type, note.content),
    ]),
  );

  return cardRows.map((card) => {
    const parsed = noteById.get(card.noteId);
    if (!parsed) {
      throw new Error(`Note ${card.noteId} not found for card ${card.id}`);
    }
    return {
      cardId: card.id,
      noteId: card.noteId,
      deckId: card.deckId,
      deckName: deckNameByCardId?.get(card.id),
      type: parsed.type,
      subKey: card.subKey,
      content: parsed.content,
      front: card.front,
      back: card.back,
    };
  });
}

/** Due, unlocked review items for a deck in session order. */
export async function getQueue(
  ctx: ServiceContext,
  deckId: string,
): Promise<ReviewQueueItem[]> {
  const deckCards = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();
  const ordered = await buildSessionQueue(ctx, deckCards, deckId);
  return toReviewItems(ctx, ordered);
}

export async function getGlobalQueue(
  ctx: ServiceContext,
): Promise<ReviewQueueItem[]> {
  const rows = await ctx.db
    .select({ card: cards, deckName: decks.name })
    .from(cards)
    .innerJoin(decks, eq(cards.deckId, decks.id))
    .orderBy(asc(cards.due))
    .all();

  const ordered = await buildSessionQueue(
    ctx,
    rows.map(({ card }) => card),
  );
  const deckNameByCardId = new Map(
    rows.map(({ card, deckName }) => [card.id, deckName]),
  );

  return toReviewItems(ctx, ordered, deckNameByCardId);
}

export type PreviewOption = { rating: Grade; due: Date; label: string };

/** Preview the four possible outcomes for a card without committing. */
export async function previewCard(
  ctx: ServiceContext,
  cardId: string,
): Promise<PreviewOption[]> {
  const card = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.id, cardId))
    .get();
  if (!card) throw new Error(`Card ${cardId} not found`);
  const now = new Date();
  const scheduler = await buildScheduler(ctx);
  const preview = scheduler.repeat(toFsrsCard(card), now);
  return GRADES.map((rating) => {
    const due = preview[rating].card.due;
    return { rating, due, label: formatInterval(now, due) };
  });
}

/** Apply a rating: persist the new FSRS state and append a review log. */
export async function rateCard(
  ctx: ServiceContext,
  cardId: string,
  rating: Grade,
): Promise<ReviewQueueItem> {
  const now = new Date();
  const scheduler = await buildScheduler(ctx);
  const updated = await ctx.db.transaction(async (tx) => {
    const card = await tx
      .select()
      .from(cards)
      .where(eq(cards.id, cardId))
      .get();
    if (!card) throw new Error(`Card ${cardId} not found`);
    const { card: next, log } = scheduler.next(toFsrsCard(card), now, rating);

    const updated = await tx
      .update(cards)
      .set({ ...fromFsrsCard(next), updatedAt: now })
      .where(eq(cards.id, cardId))
      .returning()
      .get();

    await tx
      .insert(reviewLogs)
      .values({
        cardId,
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

  await activateUnlockedDependents(ctx, updated.noteId);
  const [item] = await toReviewItems(ctx, [updated]);
  return item;
}
