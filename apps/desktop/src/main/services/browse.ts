import { and, count, eq, sql, type SQL } from "drizzle-orm";
import { schema } from "../db";
import { BROWSE_PAGE_SIZE, type BrowseSortKey } from "../../shared/browse";
import type { ServiceContext } from "./context";
import { hydrateFlashcards, type BrowseFlashcard } from "./flashcards";
import { dueSortPriority } from "./due-sort";

const { reviewUnits, flashcards, flashcardTags, tags, decks } = schema;

export type BrowseQuery = {
  offset: number;
  limit: number;
  sort: BrowseSortKey;
  state?: number;
  deckId?: string;
  tags?: string[];
};

export type BrowsePage = {
  flashcards: BrowseFlashcard[];
  filteredTotal: number;
  libraryTotal: number;
};

function browseFilters(query: BrowseQuery): SQL | undefined {
  const parts: SQL[] = [];

  if (query.deckId) {
    parts.push(eq(flashcards.deckId, query.deckId));
  }
  if (query.state !== undefined) {
    parts.push(
      sql`exists (
        select 1 from ${reviewUnits} c
        where c.flashcard_id = ${flashcards.id} and c.state = ${query.state}
      )`,
    );
  }
  if (query.tags && query.tags.length > 0) {
    const tagList = sql.join(
      query.tags.map((tag) => sql`${tag}`),
      sql`, `,
    );
    parts.push(
      sql`exists (
        select 1 from ${flashcardTags} nt
        inner join ${tags} t on t.id = nt.tag_id
        where nt.flashcard_id = ${flashcards.id} and t.name in (${tagList})
      )`,
    );
  }

  return parts.length > 0 ? and(...parts) : undefined;
}

async function countFlashcards(
  ctx: ServiceContext,
  filters: SQL | undefined,
): Promise<number> {
  const base = ctx.db.select({ value: count() }).from(flashcards);
  const row = filters ? base.where(filters).get() : base.get();
  return row?.value ?? 0;
}

function sortBrowseFlashcards(
  items: BrowseFlashcard[],
  sort: BrowseSortKey,
  now = new Date(),
): BrowseFlashcard[] {
  const byFront = (a: BrowseFlashcard, b: BrowseFlashcard) =>
    a.front.localeCompare(b.front);
  const next = [...items];

  switch (sort) {
    case "due-soon":
      return next.sort(
        (a, b) =>
          dueSortPriority(a, now) - dueSortPriority(b, now) || byFront(a, b),
      );
    case "due-later":
      return next.sort(
        (a, b) =>
          dueSortPriority(b, now) - dueSortPriority(a, now) || byFront(a, b),
      );
    case "locked-first":
      return next.sort(
        (a, b) => Number(b.locked) - Number(a.locked) || byFront(a, b),
      );
    case "locked-last":
      return next.sort(
        (a, b) => Number(a.locked) - Number(b.locked) || byFront(a, b),
      );
    case "created-new":
      return next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "created-old":
      return next.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case "front-asc":
      return next.sort(byFront);
    case "front-desc":
      return next.sort((a, b) => b.front.localeCompare(a.front));
    case "back-asc":
      return next.sort((a, b) => a.back.localeCompare(b.back));
    case "back-desc":
      return next.sort((a, b) => b.back.localeCompare(a.back));
    case "state-asc":
      return next.sort((a, b) => a.state - b.state || byFront(a, b));
    case "state-desc":
      return next.sort((a, b) => b.state - a.state || byFront(a, b));
    case "deck-asc":
      return next.sort(
        (a, b) => a.deckName.localeCompare(b.deckName) || byFront(a, b),
      );
    case "deck-desc":
      return next.sort(
        (a, b) => b.deckName.localeCompare(a.deckName) || byFront(a, b),
      );
    default:
      return next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export async function listBrowsePage(
  ctx: ServiceContext,
  query: BrowseQuery,
): Promise<BrowsePage> {
  const limit = query.limit > 0 ? query.limit : BROWSE_PAGE_SIZE;
  const offset = Math.max(0, query.offset);
  const filters = browseFilters(query);

  const [filteredTotal, libraryTotal] = await Promise.all([
    countFlashcards(ctx, filters),
    countFlashcards(ctx, undefined),
  ]);

  if (filteredTotal === 0) {
    return { flashcards: [], filteredTotal, libraryTotal };
  }

  // Front/back/state/due are derived from generated review units, so we hydrate
  // the filtered set and sort in memory. The sort is deterministic per call,
  // which keeps offset-based pagination stable across page fetches.
  const rows = (filters
    ? ctx.db
        .select({ flashcard: flashcards, deckName: decks.name })
        .from(flashcards)
        .innerJoin(decks, eq(flashcards.deckId, decks.id))
        .where(filters)
        .all()
    : ctx.db
        .select({ flashcard: flashcards, deckName: decks.name })
        .from(flashcards)
        .innerJoin(decks, eq(flashcards.deckId, decks.id))
        .all());

  const hydrated = await hydrateFlashcards(
    ctx,
    rows.map((row) => row.flashcard),
  );
  const deckNameById = new Map(
    rows.map((row) => [row.flashcard.id, row.deckName]),
  );
  const browseFlashcards: BrowseFlashcard[] = hydrated.map((flashcard) => ({
    ...flashcard,
    deckName: deckNameById.get(flashcard.id) ?? "",
  }));

  const sorted = sortBrowseFlashcards(browseFlashcards, query.sort);
  const page = sorted.slice(offset, offset + limit);

  return { flashcards: page, filteredTotal, libraryTotal };
}

export async function listAllTagNames(ctx: ServiceContext): Promise<string[]> {
  const rows = ctx.db
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
  const rows = ctx.db
    .selectDistinct({ name: tags.name })
    .from(flashcardTags)
    .innerJoin(tags, eq(flashcardTags.tagId, tags.id))
    .innerJoin(flashcards, eq(flashcardTags.flashcardId, flashcards.id))
    .where(eq(flashcards.deckId, deckId))
    .orderBy(tags.name)
    .all();
  return rows.map((row) => row.name);
}
