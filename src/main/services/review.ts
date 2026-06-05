import { and, asc, eq, lte } from "drizzle-orm";
import { Rating, type Grade } from "ts-fsrs";
import { getDb, schema } from "../db";
import type { Card } from "../db/schema";
import { isUnlocked } from "./graph";
import { buildScheduler, fromFsrsCard, toFsrsCard } from "./scheduler";

const { cards, reviewLogs } = schema;

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

/** Due, unlocked cards for a deck, ordered by due date. */
export async function getQueue(deckId: string): Promise<Card[]> {
  const db = getDb();
  const now = new Date();
  const dueCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, deckId), lte(cards.due, now)))
    .orderBy(asc(cards.due))
    .all();
  const unlocked = await Promise.all(dueCards.map((c) => isUnlocked(c.id)));
  return dueCards.filter((_, i) => unlocked[i]);
}

export type PreviewOption = { rating: Grade; due: Date; label: string };

/** Preview the four possible outcomes for a card without committing. */
export async function previewCard(cardId: string): Promise<PreviewOption[]> {
  const db = getDb();
  const card = await db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) throw new Error(`Card ${cardId} not found`);
  const now = new Date();
  const scheduler = await buildScheduler();
  const preview = scheduler.repeat(toFsrsCard(card), now);
  return GRADES.map((rating) => {
    const due = preview[rating].card.due;
    return { rating, due, label: formatInterval(now, due) };
  });
}

/** Apply a rating: persist the new FSRS state and append a review log. */
export async function rateCard(cardId: string, rating: Grade): Promise<Card> {
  const db = getDb();
  const now = new Date();
  const scheduler = await buildScheduler();
  return db.transaction(async (tx) => {
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
}
