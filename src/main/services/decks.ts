import { eq } from "drizzle-orm";
import { schema } from "../db";
import type { Deck } from "../db/schema";
import type { ServiceContext } from "./context";
import { createCard } from "./cards";
import { buildSessionQueue } from "./review";
import { State } from "./scheduler";

const { decks, cards } = schema;

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
  const deckCards = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deck.id))
    .all();
  const due = (await buildSessionQueue(ctx, deckCards, deck.id)).length;
  const learning = deckCards.filter(
    (card) => card.state === State.Learning || card.state === State.Relearning,
  ).length;
  const learned = deckCards.filter((card) => card.state === State.Review).length;

  return {
    ...deck,
    total: deckCards.length,
    due,
    newCount: deckCards.filter((card) => card.state === State.New).length,
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

export async function createDeck(ctx: ServiceContext, input: {
  name: string;
  description?: string | null;
}): Promise<Deck> {
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

export async function deleteDeck(ctx: ServiceContext, id: string): Promise<void> {
  await ctx.db.delete(decks).where(eq(decks.id, id)).run();
}

/**
 * Create a deck and populate it with cards in one call — used by the import
 * flows (e.g. Markdown) where the parsed cards already exist.
 */
export async function createDeckWithCards(
  ctx: ServiceContext,
  input: {
    name: string;
    description?: string | null;
    cards: { front: string; back: string; tags?: string[] }[];
  },
): Promise<{ deckId: string; cardCount: number }> {
  const deck = await createDeck(ctx, {
    name: input.name,
    description: input.description ?? null,
  });

  for (const card of input.cards) {
    await createCard({
      ctx,
      deckId: deck.id,
      front: card.front,
      back: card.back,
      tags: card.tags,
    });
  }

  return { deckId: deck.id, cardCount: input.cards.length };
}
