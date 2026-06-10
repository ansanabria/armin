import { eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db";
import type { Card, Note } from "../db/schema";
import {
  generateReviewItems,
  noteDisplay,
  parseStoredContent,
  serializeContent,
  validateContent,
  type CardContent,
  type CardType,
} from "./card-types";
import { newCardFields, pendingCardFields, State } from "./scheduler";
import type { ServiceContext } from "./context";
import {
  getDependentIds,
  persistLockedForNoteIds,
  syncNoteScheduling,
} from "./graph";

const { cards, notes, noteTags, tags } = schema;

/**
 * A note plus the derived data the UI needs: tags, lock state, a representative
 * front/back for tiles, and the aggregate scheduling (soonest due, least-learned
 * state) across its generated review items.
 */
export type NoteWithMeta = {
  id: string;
  deckId: string;
  type: CardType;
  content: CardContent;
  tags: string[];
  locked: boolean;
  posX: number | null;
  posY: number | null;
  createdAt: Date;
  updatedAt: Date;
  // Derived display + aggregate scheduling.
  front: string;
  back: string;
  state: number;
  due: Date;
};

export type BrowseNote = NoteWithMeta & {
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

export async function getTagsForNotes(
  db: ServiceContext["db"],
  noteIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(noteIds)];
  const tagsByNoteId = new Map(uniqueIds.map((id) => [id, [] as string[]]));
  if (uniqueIds.length === 0) return tagsByNoteId;

  const rows = await db
    .select({ noteId: noteTags.noteId, name: tags.name })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(inArray(noteTags.noteId, uniqueIds))
    .all();

  for (const row of rows) {
    const list = tagsByNoteId.get(row.noteId) ?? [];
    list.push(row.name);
    tagsByNoteId.set(row.noteId, list);
  }

  for (const [noteId, names] of tagsByNoteId) {
    tagsByNoteId.set(
      noteId,
      names.sort((a, b) => a.localeCompare(b)),
    );
  }

  return tagsByNoteId;
}

type TagWriteDb = Pick<ServiceContext["db"], "delete" | "insert" | "select">;

async function replaceNoteTags(
  db: TagWriteDb,
  noteId: string,
  inputTags: string[],
) {
  const nextTags = normalizeTags(inputTags);

  await db.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();

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
      .insert(noteTags)
      .values({ noteId, tagId: tag.id })
      .onConflictDoNothing()
      .run();
  }
}

/** Aggregate the scheduling of a note's generated cards into one tile value. */
function aggregateSchedule(cardRows: Pick<Card, "state" | "due">[]): {
  state: number;
  due: Date;
} {
  if (cardRows.length === 0) {
    return { state: State.New, due: new Date() };
  }
  let state = cardRows[0].state;
  let due = cardRows[0].due;
  for (const card of cardRows) {
    if (card.state < state) state = card.state;
    if (card.due < due) due = card.due;
  }
  return { state, due };
}

export async function hydrateNotes(
  ctx: ServiceContext,
  noteRows: Note[],
): Promise<NoteWithMeta[]> {
  if (noteRows.length === 0) return [];

  const noteIds = noteRows.map((note) => note.id);
  const [tagsByNoteId, cardRows] = await Promise.all([
    getTagsForNotes(ctx.db, noteIds),
    ctx.db
      .select({ noteId: cards.noteId, state: cards.state, due: cards.due })
      .from(cards)
      .where(inArray(cards.noteId, noteIds))
      .all(),
  ]);

  const cardsByNoteId = new Map<string, { state: number; due: Date }[]>();
  for (const row of cardRows) {
    const list = cardsByNoteId.get(row.noteId) ?? [];
    list.push({ state: row.state, due: row.due });
    cardsByNoteId.set(row.noteId, list);
  }

  return noteRows.map((note) => {
    const { content, type } = parseStoredContent(note.type, note.content);
    const display = noteDisplay(type, content);
    const { state, due } = aggregateSchedule(cardsByNoteId.get(note.id) ?? []);
    return {
      id: note.id,
      deckId: note.deckId,
      type,
      content,
      tags: tagsByNoteId.get(note.id) ?? [],
      locked: note.locked,
      posX: note.posX,
      posY: note.posY,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      front: display.front,
      back: display.back,
      state,
      due,
    };
  });
}

export async function withNoteMeta(
  ctx: ServiceContext,
  note: Note,
): Promise<NoteWithMeta> {
  const [hydrated] = await hydrateNotes(ctx, [note]);
  return hydrated;
}

type ReconcileDb = Pick<
  ServiceContext["db"],
  "select" | "insert" | "update" | "delete"
>;

/**
 * Bring a note's generated review items in sync with its content: keep cards
 * whose `subKey` still exists (preserving FSRS state), insert new ones, and
 * delete the ones the new content no longer produces.
 */
async function reconcileCards(
  db: ReconcileDb,
  note: Pick<Note, "id" | "deckId" | "locked">,
  type: CardType,
  content: CardContent,
): Promise<void> {
  const items = generateReviewItems(type, content);
  const existing = await db
    .select()
    .from(cards)
    .where(eq(cards.noteId, note.id))
    .all();
  const existingBySubKey = new Map(existing.map((card) => [card.subKey, card]));
  const nextSubKeys = new Set(items.map((item) => item.subKey));
  const now = new Date();

  const removed = existing.filter((card) => !nextSubKeys.has(card.subKey));
  if (removed.length > 0) {
    await db
      .delete(cards)
      .where(
        inArray(
          cards.id,
          removed.map((card) => card.id),
        ),
      )
      .run();
  }

  for (const item of items) {
    const found = existingBySubKey.get(item.subKey);
    if (found) {
      await db
        .update(cards)
        .set({
          front: item.front,
          back: item.back,
          locked: note.locked,
          updatedAt: now,
        })
        .where(eq(cards.id, found.id))
        .run();
    } else {
      await db
        .insert(cards)
        .values({
          noteId: note.id,
          deckId: note.deckId,
          subKey: item.subKey,
          front: item.front,
          back: item.back,
          locked: note.locked,
          ...(note.locked ? pendingCardFields() : newCardFields(now)),
        })
        .run();
    }
  }
}

export async function listNotes(
  ctx: ServiceContext,
  deckId: string,
): Promise<NoteWithMeta[]> {
  const rows = await ctx.db
    .select()
    .from(notes)
    .where(eq(notes.deckId, deckId))
    .orderBy(notes.createdAt)
    .all();
  return hydrateNotes(ctx, rows);
}

export async function listAllNotes(ctx: ServiceContext): Promise<BrowseNote[]> {
  const rows = await ctx.db
    .select({ note: notes, deckName: schema.decks.name })
    .from(notes)
    .innerJoin(schema.decks, eq(notes.deckId, schema.decks.id))
    .orderBy(notes.createdAt)
    .all();

  const hydrated = await hydrateNotes(
    ctx,
    rows.map((row) => row.note),
  );
  const byId = new Map(hydrated.map((note) => [note.id, note]));

  return rows.map(({ note, deckName }) => ({
    ...byId.get(note.id)!,
    deckName,
  }));
}

export async function getNote(
  ctx: ServiceContext,
  id: string,
): Promise<NoteWithMeta | undefined> {
  const note = await ctx.db.select().from(notes).where(eq(notes.id, id)).get();
  return note ? withNoteMeta(ctx, note) : undefined;
}

export async function createNote(input: {
  ctx: ServiceContext;
  deckId: string;
  type: CardType;
  content: unknown;
  tags?: string[];
}): Promise<NoteWithMeta> {
  const { ctx } = input;
  const content = validateContent(input.type, input.content);

  const note = await ctx.db.transaction(async (tx) => {
    const created = await tx
      .insert(notes)
      .values({
        deckId: input.deckId,
        type: input.type,
        content: serializeContent(content),
        locked: false,
      })
      .returning()
      .get();

    await reconcileCards(tx, created!, input.type, content);
    await replaceNoteTags(tx, created!.id, input.tags ?? []);
    return created!;
  });

  return withNoteMeta(ctx, note);
}

export async function updateNote(
  ctx: ServiceContext,
  id: string,
  patch: { type?: CardType; content?: unknown; tags?: string[] },
): Promise<NoteWithMeta | undefined> {
  const note = await ctx.db.transaction(async (tx) => {
    const current = await tx.select().from(notes).where(eq(notes.id, id)).get();
    if (!current) return undefined;

    const nextType = patch.type ?? (current.type as CardType);
    const contentChanged =
      patch.content !== undefined || patch.type !== undefined;
    const content = contentChanged
      ? validateContent(
          nextType,
          patch.content ??
            parseStoredContent(current.type, current.content).content,
        )
      : parseStoredContent(current.type, current.content).content;

    let updated = current;
    if (contentChanged) {
      updated = await tx
        .update(notes)
        .set({
          type: nextType,
          content: serializeContent(content),
          updatedAt: new Date(),
        })
        .where(eq(notes.id, id))
        .returning()
        .get();
      await reconcileCards(tx, updated!, nextType, content);
    }

    if (patch.tags) {
      await replaceNoteTags(tx, id, patch.tags);
    }

    return updated!;
  });

  return note ? withNoteMeta(ctx, note) : undefined;
}

export async function deleteNote(
  ctx: ServiceContext,
  id: string,
): Promise<void> {
  // Collect dependents before the delete cascades the prereq edges away.
  const dependentIds = await getDependentIds(ctx, id);

  // cards.note_id has no DB-level FK on migrated databases, so remove the
  // generated review items explicitly (review_logs cascade off cards).
  await ctx.db.transaction(async (tx) => {
    await tx.delete(cards).where(eq(cards.noteId, id)).run();
    await tx.delete(notes).where(eq(notes.id, id)).run();
  });

  // The deleted note may have been the lock holding dependents back.
  if (dependentIds.length > 0) {
    await persistLockedForNoteIds(ctx, dependentIds);
    for (const dependentId of dependentIds) {
      await syncNoteScheduling(ctx, dependentId);
    }
  }
}
