import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Card } from "../db/schema";
import { newCardFields } from "./scheduler";

const { cards } = schema;

export async function listCards(deckId: string): Promise<Card[]> {
  return getDb()
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .orderBy(cards.createdAt)
    .all();
}

export async function getCard(id: string): Promise<Card | undefined> {
  return getDb().select().from(cards).where(eq(cards.id, id)).get();
}

export async function createCard(input: {
  deckId: string;
  front: string;
  back: string;
  type?: string;
}): Promise<Card> {
  const db = getDb();
  const row = await db
    .insert(cards)
    .values({
      deckId: input.deckId,
      front: input.front,
      back: input.back,
      type: input.type ?? "basic",
      ...newCardFields(),
    })
    .returning()
    .get();
  return row!;
}

export async function updateCard(
  id: string,
  patch: { front?: string; back?: string; type?: string },
): Promise<Card | undefined> {
  return getDb()
    .update(cards)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cards.id, id))
    .returning()
    .get();
}

export async function deleteCard(id: string): Promise<void> {
  await getDb().delete(cards).where(eq(cards.id, id)).run();
}
