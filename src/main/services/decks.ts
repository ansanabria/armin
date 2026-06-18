import { and, count, eq } from "drizzle-orm";
import { schema } from "../db";
import type { Deck } from "../db/schema";
import type { ServiceContext } from "./context";
import { createFlashcard } from "./flashcards";
import { buildSessionQueue } from "./review";
import { State } from "./scheduler";

const { decks, reviewUnits, flashcards } = schema;

export type DeckWithStats = Deck & {
  total: number;
  due: number;
  newCount: number;
  learning: number;
  learned: number;
};

async function withStats(
  ctx: ServiceContext,
  deck: Deck,
): Promise<DeckWithStats> {
  const [flashcardCountRow, deckReviewUnits] = await Promise.all([
    ctx.db
      .select({ value: count() })
      .from(flashcards)
      .where(and(eq(flashcards.deckId, deck.id), eq(flashcards.archived, false)))
      .get(),
    ctx.db
      .select()
      .from(reviewUnits)
      .where(
        and(eq(reviewUnits.deckId, deck.id), eq(reviewUnits.archived, false)),
      )
      .all(),
  ]);
  const due = (await buildSessionQueue(ctx, deckReviewUnits, deck.id)).length;
  const learning = deckReviewUnits.filter(
    (reviewUnit) =>
      reviewUnit.state === State.Learning ||
      reviewUnit.state === State.Relearning,
  ).length;
  const learned = deckReviewUnits.filter(
    (reviewUnit) => reviewUnit.state === State.Review,
  ).length;

  return {
    ...deck,
    // "total" counts flashcards; the review-unit rows drive the rest.
    total: flashcardCountRow?.value ?? 0,
    due,
    newCount: deckReviewUnits.filter(
      (reviewUnit) => reviewUnit.state === State.New,
    ).length,
    learning,
    learned,
  };
}

export async function listDecks(ctx: ServiceContext): Promise<DeckWithStats[]> {
  const db = ctx.db;
  const rows = await db.select().from(decks).orderBy(decks.createdAt).all();
  return Promise.all(rows.map((deck) => withStats(ctx, deck)));
}

export async function getDeck(
  ctx: ServiceContext,
  id: string,
): Promise<DeckWithStats | undefined> {
  const deck = await ctx.db.select().from(decks).where(eq(decks.id, id)).get();
  return deck ? withStats(ctx, deck) : undefined;
}

export async function createDeck(
  ctx: ServiceContext,
  input: {
    name: string;
    description?: string | null;
  },
): Promise<Deck> {
  const db = ctx.db;
  const row = await db
    .insert(decks)
    .values({ name: input.name, description: input.description ?? null })
    .returning()
    .get();
  return row!;
}

export async function updateDeck(
  ctx: ServiceContext,
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<Deck | undefined> {
  const db = ctx.db;
  return db
    .update(decks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(decks.id, id))
    .returning()
    .get();
}

export async function deleteDeck(
  ctx: ServiceContext,
  id: string,
): Promise<void> {
  await ctx.db.delete(decks).where(eq(decks.id, id)).run();
}

/**
 * Create a deck and populate it with flashcards in one call — used by the import
 * flows (e.g. Markdown) where the parsed flashcards already exist.
 */
export async function createDeckWithFlashcards(
  ctx: ServiceContext,
  input: {
    name: string;
    description?: string | null;
    flashcards: { front: string; back: string; tags?: string[] }[];
  },
): Promise<{ deckId: string; flashcardCount: number }> {
  const deck = await createDeck(ctx, {
    name: input.name,
    description: input.description ?? null,
  });

  for (const flashcard of input.flashcards) {
    await createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: flashcard.front, back: flashcard.back },
      tags: flashcard.tags,
    });
  }

  return { deckId: deck.id, flashcardCount: input.flashcards.length };
}
