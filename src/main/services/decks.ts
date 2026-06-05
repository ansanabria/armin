import { and, count, eq, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Deck } from "../db/schema";

const { decks, cards } = schema;

export type DeckWithStats = Deck & {
  total: number;
  due: number;
  newCount: number;
};

export async function listDecks(): Promise<DeckWithStats[]> {
  const db = getDb();
  const now = new Date();
  const rows = await db.select().from(decks).orderBy(decks.createdAt).all();
  return Promise.all(
    rows.map(async (d) => {
      const total =
        (
          await db
            .select({ c: count() })
            .from(cards)
            .where(eq(cards.deckId, d.id))
            .get()
        )?.c ?? 0;
      const due =
        (
          await db
            .select({ c: count() })
            .from(cards)
            .where(and(eq(cards.deckId, d.id), lte(cards.due, now)))
            .get()
        )?.c ?? 0;
      const newCount =
        (
          await db
            .select({ c: count() })
            .from(cards)
            .where(and(eq(cards.deckId, d.id), eq(cards.state, 0)))
            .get()
        )?.c ?? 0;
      return { ...d, total, due, newCount };
    }),
  );
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  return getDb().select().from(decks).where(eq(decks.id, id)).get();
}

export async function createDeck(input: {
  name: string;
  description?: string | null;
}): Promise<Deck> {
  const db = getDb();
  const row = await db
    .insert(decks)
    .values({ name: input.name, description: input.description ?? null })
    .returning()
    .get();
  return row!;
}

export async function updateDeck(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<Deck | undefined> {
  const db = getDb();
  return db
    .update(decks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(decks.id, id))
    .returning()
    .get();
}

export async function deleteDeck(id: string): Promise<void> {
  await getDb().delete(decks).where(eq(decks.id, id)).run();
}
