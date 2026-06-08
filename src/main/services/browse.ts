import {
  and,
  asc,
  count,
  desc,
  eq,
  sql,
  type SQL,
} from "drizzle-orm";
import { schema } from "../db";
import { BROWSE_PAGE_SIZE, type BrowseSortKey } from "../../shared/browse";
import type { ServiceContext } from "./context";
import type { BrowseCard } from "./cards";
import { getTagsForCards } from "./cards";
import { sqlDueSortPriority } from "./due-sort";

const { cards, cardTags, tags, decks } = schema;

export type BrowseQuery = {
  offset: number;
  limit: number;
  sort: BrowseSortKey;
  state?: number;
  deckId?: string;
  tag?: string;
};

export type BrowsePage = {
  cards: BrowseCard[];
  filteredTotal: number;
  libraryTotal: number;
};

function browseFilters(query: BrowseQuery): SQL | undefined {
  const parts: SQL[] = [];

  if (query.state !== undefined) {
    parts.push(eq(cards.state, query.state));
  }
  if (query.deckId) {
    parts.push(eq(cards.deckId, query.deckId));
  }
  if (query.tag) {
    parts.push(
      sql`exists (
        select 1 from ${cardTags} ct
        inner join ${tags} t on t.id = ct.tag_id
        where ct.card_id = ${cards.id} and t.name = ${query.tag}
      )`,
    );
  }

  return parts.length > 0 ? and(...parts) : undefined;
}

function browseBaseQuery(ctx: ServiceContext, filters: SQL | undefined) {
  const q = ctx.db
    .select({ card: cards, deckName: decks.name })
    .from(cards)
    .innerJoin(decks, eq(cards.deckId, decks.id));

  return filters ? q.where(filters) : q;
}

function sqlOrderBy(sort: BrowseSortKey, now = new Date()) {
  const duePriority = sqlDueSortPriority(now.getTime());

  switch (sort) {
    case "due-soon":
      return [asc(duePriority), asc(cards.front)];
    case "due-later":
      return [desc(duePriority), asc(cards.front)];
    case "locked-first":
      return [desc(cards.locked), asc(cards.front)];
    case "locked-last":
      return [asc(cards.locked), asc(cards.front)];
    case "created-new":
      return [desc(cards.createdAt)];
    case "created-old":
      return [asc(cards.createdAt)];
    case "front-asc":
      return [asc(cards.front)];
    case "front-desc":
      return [desc(cards.front)];
    case "back-asc":
      return [asc(cards.back)];
    case "back-desc":
      return [desc(cards.back)];
    case "state-asc":
      return [asc(cards.state)];
    case "state-desc":
      return [desc(cards.state)];
    case "deck-asc":
      return [asc(decks.name), asc(cards.front)];
    case "deck-desc":
      return [desc(decks.name), asc(cards.front)];
    default:
      return [desc(cards.createdAt)];
  }
}

async function hydrateBrowseCards(
  ctx: ServiceContext,
  rows: { card: typeof cards.$inferSelect; deckName: string }[],
): Promise<BrowseCard[]> {
  if (rows.length === 0) return [];

  const cardIds = rows.map((row) => row.card.id);
  const tagsByCardId = await getTagsForCards(ctx.db, cardIds);

  return rows.map(({ card, deckName }) => ({
    ...card,
    tags: tagsByCardId.get(card.id) ?? [],
    locked: card.locked,
    deckName,
  }));
}

async function countCards(
  ctx: ServiceContext,
  filters: SQL | undefined,
): Promise<number> {
  const base = ctx.db.select({ value: count() }).from(cards);
  const row = filters ? await base.where(filters).get() : await base.get();
  return row?.value ?? 0;
}

export async function listBrowsePage(
  ctx: ServiceContext,
  query: BrowseQuery,
): Promise<BrowsePage> {
  const limit = query.limit > 0 ? query.limit : BROWSE_PAGE_SIZE;
  const offset = Math.max(0, query.offset);
  const filters = browseFilters(query);

  const [filteredTotal, libraryTotal] = await Promise.all([
    countCards(ctx, filters),
    countCards(ctx, undefined),
  ]);

  if (filteredTotal === 0) {
    return { cards: [], filteredTotal, libraryTotal };
  }

  const orderBy = sqlOrderBy(query.sort);
  const pageRows = await browseBaseQuery(ctx, filters)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)
    .all();

  const pageCards = await hydrateBrowseCards(ctx, pageRows);

  return { cards: pageCards, filteredTotal, libraryTotal };
}

export async function listAllTagNames(ctx: ServiceContext): Promise<string[]> {
  const rows = await ctx.db
    .select({ name: tags.name })
    .from(tags)
    .orderBy(tags.name)
    .all();
  return rows.map((row) => row.name);
}

export async function listDeckTagNames(
  ctx: ServiceContext,
  deckId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .selectDistinct({ name: tags.name })
    .from(cardTags)
    .innerJoin(tags, eq(cardTags.tagId, tags.id))
    .innerJoin(cards, eq(cardTags.cardId, cards.id))
    .where(eq(cards.deckId, deckId))
    .orderBy(tags.name)
    .all();
  return rows.map((row) => row.name);
}
