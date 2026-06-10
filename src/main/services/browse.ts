import { and, count, eq, sql, type SQL } from "drizzle-orm";
import { schema } from "../db";
import { BROWSE_PAGE_SIZE, type BrowseSortKey } from "../../shared/browse";
import type { ServiceContext } from "./context";
import { hydrateNotes, type BrowseNote } from "./notes";
import { dueSortPriority } from "./due-sort";

const { cards, notes, noteTags, tags, decks } = schema;

export type BrowseQuery = {
  offset: number;
  limit: number;
  sort: BrowseSortKey;
  state?: number;
  deckId?: string;
  tags?: string[];
};

export type BrowsePage = {
  cards: BrowseNote[];
  filteredTotal: number;
  libraryTotal: number;
};

function browseFilters(query: BrowseQuery): SQL | undefined {
  const parts: SQL[] = [];

  if (query.deckId) {
    parts.push(eq(notes.deckId, query.deckId));
  }
  if (query.state !== undefined) {
    parts.push(
      sql`exists (
        select 1 from ${cards} c
        where c.note_id = ${notes.id} and c.state = ${query.state}
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
        select 1 from ${noteTags} nt
        inner join ${tags} t on t.id = nt.tag_id
        where nt.note_id = ${notes.id} and t.name in (${tagList})
      )`,
    );
  }

  return parts.length > 0 ? and(...parts) : undefined;
}

async function countNotes(
  ctx: ServiceContext,
  filters: SQL | undefined,
): Promise<number> {
  const base = ctx.db.select({ value: count() }).from(notes);
  const row = filters ? await base.where(filters).get() : await base.get();
  return row?.value ?? 0;
}

function sortBrowseNotes(
  items: BrowseNote[],
  sort: BrowseSortKey,
  now = new Date(),
): BrowseNote[] {
  const byFront = (a: BrowseNote, b: BrowseNote) =>
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
    countNotes(ctx, filters),
    countNotes(ctx, undefined),
  ]);

  if (filteredTotal === 0) {
    return { cards: [], filteredTotal, libraryTotal };
  }

  // Front/back/state/due are derived from generated cards, so we hydrate the
  // filtered set and sort in memory. The sort is deterministic per call, which
  // keeps offset-based pagination stable across page fetches.
  const rows = await (filters
    ? ctx.db
        .select({ note: notes, deckName: decks.name })
        .from(notes)
        .innerJoin(decks, eq(notes.deckId, decks.id))
        .where(filters)
        .all()
    : ctx.db
        .select({ note: notes, deckName: decks.name })
        .from(notes)
        .innerJoin(decks, eq(notes.deckId, decks.id))
        .all());

  const hydrated = await hydrateNotes(
    ctx,
    rows.map((row) => row.note),
  );
  const deckNameById = new Map(rows.map((row) => [row.note.id, row.deckName]));
  const browseNotes: BrowseNote[] = hydrated.map((note) => ({
    ...note,
    deckName: deckNameById.get(note.id) ?? "",
  }));

  const sorted = sortBrowseNotes(browseNotes, query.sort);
  const page = sorted.slice(offset, offset + limit);

  return { cards: page, filteredTotal, libraryTotal };
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
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .innerJoin(notes, eq(noteTags.noteId, notes.id))
    .where(eq(notes.deckId, deckId))
    .orderBy(tags.name)
    .all();
  return rows.map((row) => row.name);
}
