import { and, asc, eq, gte } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import { schema } from "../db";
import type { Card } from "../db/schema";
import type { CardWithMeta, BrowseCard } from "./cards";
import { withCardMeta } from "./cards";
import type { ServiceContext } from "./context";
import { activateUnlockedDependents, isUnlocked } from "./graph";
import { buildScheduler, fromFsrsCard, isPendingSchedule, State, toFsrsCard } from "./scheduler";
import { getSettings } from "./settings";
import { shuffle } from "./shuffle";

const { cards, decks, reviewLogs } = schema;

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

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
 * (shuffled, capped by the daily new-card limit).
 */
export async function buildSessionQueue(
  ctx: ServiceContext,
  deckCards: Card[],
  deckId?: string,
): Promise<Card[]> {
  const now = new Date();
  const { newCardsPerDay } = await getSettings(ctx);
  const unlocked: Card[] = [];
  for (const card of deckCards) {
    if (await isUnlocked(ctx, card.id)) unlocked.push(card);
  }

  const reviews = unlocked.filter(
    (card) =>
      !isPendingSchedule(card) &&
      card.state !== State.New &&
      card.due <= now,
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

/** Due, unlocked cards for a deck in session order. */
export async function getQueue(
  ctx: ServiceContext,
  deckId: string,
): Promise<CardWithMeta[]> {
  const deckCards = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();
  const ordered = await buildSessionQueue(ctx, deckCards, deckId);
  return Promise.all(ordered.map((card) => withCardMeta(ctx, card)));
}

export async function getGlobalQueue(
  ctx: ServiceContext,
): Promise<BrowseCard[]> {
  const rows = await ctx.db
    .select({
      card: cards,
      deckName: decks.name,
    })
    .from(cards)
    .innerJoin(decks, eq(cards.deckId, decks.id))
    .orderBy(asc(cards.due))
    .all();

  const ordered = await buildSessionQueue(
    ctx,
    rows.map(({ card }) => card),
  );
  const byId = new Map(rows.map(({ card, deckName }) => [card.id, deckName]));

  return Promise.all(
    ordered.map(async (card) => ({
      ...(await withCardMeta(ctx, card)),
      deckName: byId.get(card.id) ?? "",
    })),
  );
}

export type PreviewOption = { rating: Grade; due: Date; label: string };

/** Preview the four possible outcomes for a card without committing. */
export async function previewCard(
  ctx: ServiceContext,
  cardId: string,
): Promise<PreviewOption[]> {
  const card = await ctx.db.select().from(cards).where(eq(cards.id, cardId)).get();
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
): Promise<CardWithMeta> {
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

  await activateUnlockedDependents(ctx, cardId);
  return withCardMeta(ctx, updated);
}
