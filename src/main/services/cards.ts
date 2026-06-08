import { eq, sql } from "drizzle-orm";
import { schema } from "../db";
import type { Card } from "../db/schema";
import { newCardFields } from "./scheduler";
import type { ServiceContext } from "./context";
import { isUnlocked } from "./graph";

const { cards, cardTags, tags } = schema;

export type CardWithMeta = Card & {
  tags: string[];
  locked: boolean;
};

export type BrowseCard = CardWithMeta & {
  deckName: string;
};

function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, " ");
}

function normalizeTags(input: string[] = []) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of input) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }

  return result;
}

async function getCardTags(
  db: ServiceContext["db"],
  cardId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(cardTags)
    .innerJoin(tags, eq(cardTags.tagId, tags.id))
    .where(eq(cardTags.cardId, cardId))
    .all();

  return rows.map((row) => row.name).sort((a, b) => a.localeCompare(b));
}

export async function withCardMeta(
  ctx: ServiceContext,
  card: Card,
): Promise<CardWithMeta> {
  const [tagNames, unlocked] = await Promise.all([
    getCardTags(ctx.db, card.id),
    isUnlocked(ctx, card.id),
  ]);
  return { ...card, tags: tagNames, locked: !unlocked };
}

type TagWriteDb = Pick<ServiceContext["db"], "delete" | "insert" | "select">;

async function replaceCardTags(
  db: TagWriteDb,
  cardId: string,
  inputTags: string[],
) {
  const nextTags = normalizeTags(inputTags);

  await db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();

  for (const name of nextTags) {
    const lowerName = name.toLocaleLowerCase();
    let tag = await db
      .select()
      .from(tags)
      .where(sql`lower(${tags.name}) = ${lowerName}`)
      .get();

    if (!tag) {
      tag = await db.insert(tags).values({ name }).returning().get();
    }

    await db
      .insert(cardTags)
      .values({ cardId, tagId: tag.id })
      .onConflictDoNothing()
      .run();
  }
}

export async function listCards(
  ctx: ServiceContext,
  deckId: string,
): Promise<CardWithMeta[]> {
  const rows = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .orderBy(cards.createdAt)
    .all();
  return Promise.all(rows.map((card) => withCardMeta(ctx, card)));
}

export async function listAllCards(
  ctx: ServiceContext,
): Promise<BrowseCard[]> {
  const rows = await ctx.db
    .select({
      card: cards,
      deckName: schema.decks.name,
    })
    .from(cards)
    .innerJoin(schema.decks, eq(cards.deckId, schema.decks.id))
    .orderBy(cards.createdAt)
    .all();

  return Promise.all(
    rows.map(async ({ card, deckName }) => ({
      ...(await withCardMeta(ctx, card)),
      deckName,
    })),
  );
}

export async function getCard(
  ctx: ServiceContext,
  id: string,
): Promise<CardWithMeta | undefined> {
  const card = await ctx.db.select().from(cards).where(eq(cards.id, id)).get();
  return card ? withCardMeta(ctx, card) : undefined;
}

export async function createCard(input: {
  ctx: ServiceContext;
  deckId: string;
  front: string;
  back: string;
  type?: string;
  tags?: string[];
}): Promise<CardWithMeta> {
  const { ctx, ...cardInput } = input;
  const row = await ctx.db.transaction(async (tx) => {
    const created = await tx
      .insert(cards)
      .values({
        deckId: cardInput.deckId,
        front: cardInput.front,
        back: cardInput.back,
        type: cardInput.type ?? "basic",
        ...newCardFields(),
      })
      .returning()
      .get();

    await replaceCardTags(tx, created!.id, cardInput.tags ?? []);
    return created!;
  });

  return withCardMeta(ctx, row);
}

export async function updateCard(
  ctx: ServiceContext,
  id: string,
  patch: { front?: string; back?: string; type?: string; tags?: string[] },
): Promise<CardWithMeta | undefined> {
  const { tags: tagPatch, ...cardPatch } = patch;
  const row = await ctx.db.transaction(async (tx) => {
    let updated: Card | undefined;

    if (Object.keys(cardPatch).length > 0) {
      updated = await tx
        .update(cards)
        .set({ ...cardPatch, updatedAt: new Date() })
        .where(eq(cards.id, id))
        .returning()
        .get();
    } else {
      updated = await tx.select().from(cards).where(eq(cards.id, id)).get();
    }

    if (!updated) return undefined;

    if (tagPatch) {
      await replaceCardTags(tx, id, tagPatch);
    }

    return updated;
  });

  return row ? withCardMeta(ctx, row) : undefined;
}

export async function deleteCard(ctx: ServiceContext, id: string): Promise<void> {
  await ctx.db.delete(cards).where(eq(cards.id, id)).run();
}
