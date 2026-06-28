import { count, eq, inArray, min, max, or, sql } from "drizzle-orm";
import { schema } from "../db";
import type { ReviewUnit, Flashcard } from "../db/schema";
import {
  generateReviewUnits,
  flashcardDisplay,
  parseStoredContent,
  serializeContent,
  validateContent,
  type FlashcardContent,
  type FlashcardType,
} from "./flashcard-types";
import {
  newReviewUnitFields,
  pendingReviewUnitFields,
  State,
} from "./scheduler";
import type { ServiceContext } from "./context";
import {
  getDependentIds,
  getPrereqIds,
  refreshAfterPrerequisiteStateChange,
  refreshDependentSubgraph,
} from "./graph";
import { assertContentUsesMediaRefs } from "./media";

const { reviewUnits, reviewLogs, flashcards, flashcardPrereqs, flashcardTags, tags, decks } =
  schema;

/**
 * A flashcard plus the derived data the UI needs: tags, lock state, a
 * representative front/back for tiles, and the aggregate scheduling (soonest
 * due, least-learned state) across its generated review units.
 */
export type FlashcardWithMeta = {
  id: string;
  deckId: string;
  type: FlashcardType;
  content: FlashcardContent;
  tags: string[];
  locked: boolean;
  archived: boolean;
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

export type BrowseFlashcard = FlashcardWithMeta & {
  deckName: string;
};

export type FlashcardDeleteConsequences = {
  dependentCount: number;
  reviewUnitCount: number;
  reviewLogCount: number;
  firstReviewAt: Date | null;
  lastReviewAt: Date | null;
};

export type FlashcardMoveConsequences = {
  prerequisiteCount: number;
  dependentCount: number;
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

export async function getTagsForFlashcards(
  db: ServiceContext["db"],
  flashcardIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(flashcardIds)];
  const tagsByFlashcardId = new Map(uniqueIds.map((id) => [id, [] as string[]]));
  if (uniqueIds.length === 0) return tagsByFlashcardId;

  const rows = db
    .select({ flashcardId: flashcardTags.flashcardId, name: tags.name })
    .from(flashcardTags)
    .innerJoin(tags, eq(flashcardTags.tagId, tags.id))
    .where(inArray(flashcardTags.flashcardId, uniqueIds))
    .all();

  for (const row of rows) {
    const list = tagsByFlashcardId.get(row.flashcardId) ?? [];
    list.push(row.name);
    tagsByFlashcardId.set(row.flashcardId, list);
  }

  for (const [flashcardId, names] of tagsByFlashcardId) {
    tagsByFlashcardId.set(
      flashcardId,
      names.sort((a, b) => a.localeCompare(b)),
    );
  }

  return tagsByFlashcardId;
}

type TagWriteDb = Pick<ServiceContext["db"], "delete" | "insert" | "select">;

function replaceFlashcardTags(
  db: TagWriteDb,
  flashcardId: string,
  inputTags: string[],
) {
  const nextTags = normalizeTags(inputTags);

  db.delete(flashcardTags)
    .where(eq(flashcardTags.flashcardId, flashcardId))
    .run();

  for (const name of nextTags) {
    const lowerName = name.toLocaleLowerCase();
    let tag = db
      .select()
      .from(tags)
      .where(sql`lower(${tags.name}) = ${lowerName}`)
      .get();

    if (!tag) {
      tag = db.insert(tags).values({ name }).returning().get();
    }

    db.insert(flashcardTags)
      .values({ flashcardId, tagId: tag.id })
      .onConflictDoNothing()
      .run();
  }
}

/**
 * Aggregate the scheduling of a flashcard's generated review units into one
 * tile value.
 */
function aggregateSchedule(
  reviewUnitRows: Pick<ReviewUnit, "state" | "due">[],
): {
  state: number;
  due: Date;
} {
  if (reviewUnitRows.length === 0) {
    return { state: State.New, due: new Date() };
  }
  let state = reviewUnitRows[0].state;
  let due = reviewUnitRows[0].due;
  for (const reviewUnit of reviewUnitRows) {
    if (reviewUnit.state < state) state = reviewUnit.state;
    if (reviewUnit.due < due) due = reviewUnit.due;
  }
  return { state, due };
}

export async function hydrateFlashcards(
  ctx: ServiceContext,
  flashcardRows: Flashcard[],
): Promise<FlashcardWithMeta[]> {
  if (flashcardRows.length === 0) return [];

  const flashcardIds = flashcardRows.map((flashcard) => flashcard.id);
  const [tagsByFlashcardId, reviewUnitRows] = await Promise.all([
    getTagsForFlashcards(ctx.db, flashcardIds),
    ctx.db
      .select({
        flashcardId: reviewUnits.flashcardId,
        state: reviewUnits.state,
        due: reviewUnits.due,
      })
      .from(reviewUnits)
      .where(inArray(reviewUnits.flashcardId, flashcardIds))
      .all(),
  ]);

  const reviewUnitsByFlashcardId = new Map<
    string,
    { state: number; due: Date }[]
  >();
  for (const row of reviewUnitRows) {
    const list = reviewUnitsByFlashcardId.get(row.flashcardId) ?? [];
    list.push({ state: row.state, due: row.due });
    reviewUnitsByFlashcardId.set(row.flashcardId, list);
  }

  return flashcardRows.map((flashcard) => {
    const { content, type } = parseStoredContent(
      flashcard.type,
      flashcard.content,
    );
    const display = flashcardDisplay(type, content);
    const { state, due } = aggregateSchedule(
      reviewUnitsByFlashcardId.get(flashcard.id) ?? [],
    );
    return {
      id: flashcard.id,
      deckId: flashcard.deckId,
      type,
      content,
      tags: tagsByFlashcardId.get(flashcard.id) ?? [],
      locked: flashcard.locked,
      archived: flashcard.archived,
      posX: flashcard.posX,
      posY: flashcard.posY,
      createdAt: flashcard.createdAt,
      updatedAt: flashcard.updatedAt,
      front: display.front,
      back: display.back,
      state,
      due,
    };
  });
}

export async function withFlashcardMeta(
  ctx: ServiceContext,
  flashcard: Flashcard,
): Promise<FlashcardWithMeta> {
  const [hydrated] = await hydrateFlashcards(ctx, [flashcard]);
  return hydrated;
}

type ReconcileDb = Pick<
  ServiceContext["db"],
  "select" | "insert" | "update" | "delete"
>;

type CreateFlashcardDb = ReconcileDb;

/**
 * Bring a flashcard's generated review units in sync with its content: keep the
 * units whose `subKey` still exists (preserving FSRS state), insert new ones,
 * and delete the ones the new content no longer produces.
 */
function reconcileReviewUnits(
  db: ReconcileDb,
  flashcard: Pick<Flashcard, "id" | "deckId" | "locked" | "archived">,
  type: FlashcardType,
  content: FlashcardContent,
): void {
  const specs = generateReviewUnits(type, content);
  const existing = db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.flashcardId, flashcard.id))
    .all();
  const existingBySubKey = new Map(
    existing.map((reviewUnit) => [reviewUnit.subKey, reviewUnit]),
  );
  const nextSubKeys = new Set(specs.map((spec) => spec.subKey));
  const now = new Date();

  const removed = existing.filter(
    (reviewUnit) => !nextSubKeys.has(reviewUnit.subKey),
  );
  if (removed.length > 0) {
    db.delete(reviewUnits)
      .where(
        inArray(
          reviewUnits.id,
          removed.map((reviewUnit) => reviewUnit.id),
        ),
      )
      .run();
  }

  for (const spec of specs) {
    const found = existingBySubKey.get(spec.subKey);
    if (found) {
      db.update(reviewUnits)
        .set({
          front: spec.front,
          back: spec.back,
          locked: flashcard.locked,
          archived: flashcard.archived,
          updatedAt: now,
        })
        .where(eq(reviewUnits.id, found.id))
        .run();
    } else {
      db.insert(reviewUnits)
        .values({
          flashcardId: flashcard.id,
          deckId: flashcard.deckId,
          subKey: spec.subKey,
          front: spec.front,
          back: spec.back,
          locked: flashcard.locked,
          archived: flashcard.archived,
          ...(flashcard.locked
            ? pendingReviewUnitFields()
            : newReviewUnitFields(now)),
        })
        .run();
    }
  }
}

export function createFlashcardRecord(
  db: CreateFlashcardDb,
  input: {
    deckId: string;
    type: FlashcardType;
    content: unknown;
    tags?: string[];
  },
): Flashcard {
  const content = validateContent(input.type, input.content);
  assertContentUsesMediaRefs(input.type, content);
  const created = db
    .insert(flashcards)
    .values({
      deckId: input.deckId,
      type: input.type,
      content: serializeContent(content),
      locked: false,
    })
    .returning()
    .get();

  reconcileReviewUnits(db, created!, input.type, content);
  replaceFlashcardTags(db, created!.id, input.tags ?? []);
  return created!;
}

export async function listFlashcards(
  ctx: ServiceContext,
  deckId: string,
): Promise<FlashcardWithMeta[]> {
  const rows = ctx.db
    .select()
    .from(flashcards)
    .where(eq(flashcards.deckId, deckId))
    .orderBy(flashcards.createdAt)
    .all();
  return hydrateFlashcards(ctx, rows);
}

export async function listAllFlashcards(
  ctx: ServiceContext,
): Promise<BrowseFlashcard[]> {
  const rows = ctx.db
    .select({ flashcard: flashcards, deckName: schema.decks.name })
    .from(flashcards)
    .innerJoin(schema.decks, eq(flashcards.deckId, schema.decks.id))
    .orderBy(flashcards.createdAt)
    .all();

  const hydrated = await hydrateFlashcards(
    ctx,
    rows.map((row) => row.flashcard),
  );
  const byId = new Map(hydrated.map((flashcard) => [flashcard.id, flashcard]));

  return rows.map(({ flashcard, deckName }) => ({
    ...byId.get(flashcard.id)!,
    deckName,
  }));
}

export async function getFlashcard(
  ctx: ServiceContext,
  id: string,
): Promise<FlashcardWithMeta | undefined> {
  const flashcard = ctx.db
    .select()
    .from(flashcards)
    .where(eq(flashcards.id, id))
    .get();
  return flashcard ? withFlashcardMeta(ctx, flashcard) : undefined;
}

export async function getDeleteConsequences(
  ctx: ServiceContext,
  id: string,
): Promise<FlashcardDeleteConsequences> {
  const [dependentIds, reviewUnitSummary, reviewLogSummary] = await Promise.all([
    getDependentIds(ctx, id),
    ctx.db
      .select({ value: count() })
      .from(reviewUnits)
      .where(eq(reviewUnits.flashcardId, id))
      .get(),
    ctx.db
      .select({
        count: count(),
        firstReviewAt: min(reviewLogs.review),
        lastReviewAt: max(reviewLogs.review),
      })
      .from(reviewLogs)
      .innerJoin(reviewUnits, eq(reviewLogs.reviewUnitId, reviewUnits.id))
      .where(eq(reviewUnits.flashcardId, id))
      .get(),
  ]);

  return {
    dependentCount: dependentIds.length,
    reviewUnitCount: reviewUnitSummary?.value ?? 0,
    reviewLogCount: reviewLogSummary?.count ?? 0,
    firstReviewAt: reviewLogSummary?.firstReviewAt ?? null,
    lastReviewAt: reviewLogSummary?.lastReviewAt ?? null,
  };
}

export async function createFlashcard(input: {
  ctx: ServiceContext;
  deckId: string;
  type: FlashcardType;
  content: unknown;
  tags?: string[];
}): Promise<FlashcardWithMeta> {
  const { ctx } = input;
  const flashcard = ctx.db.transaction((tx) =>
    createFlashcardRecord(tx, input),
  );

  return withFlashcardMeta(ctx, flashcard);
}

export async function updateFlashcard(
  ctx: ServiceContext,
  id: string,
  patch: { type?: FlashcardType; content?: unknown; tags?: string[] },
): Promise<FlashcardWithMeta | undefined> {
  const flashcard = ctx.db.transaction((tx) => {
    const current = tx
      .select()
      .from(flashcards)
      .where(eq(flashcards.id, id))
      .get();
    if (!current) return undefined;

    const nextType = patch.type ?? (current.type as FlashcardType);
    const contentChanged =
      patch.content !== undefined || patch.type !== undefined;
    const content = contentChanged
      ? validateContent(
          nextType,
          patch.content ??
            parseStoredContent(current.type, current.content).content,
        )
      : parseStoredContent(current.type, current.content).content;
    assertContentUsesMediaRefs(nextType, content);

    let updated = current;
    if (contentChanged) {
      updated = tx
        .update(flashcards)
        .set({
          type: nextType,
          content: serializeContent(content),
          updatedAt: new Date(),
        })
        .where(eq(flashcards.id, id))
        .returning()
        .get();
      reconcileReviewUnits(tx, updated!, nextType, content);
    }

    if (patch.tags) {
      replaceFlashcardTags(tx, id, patch.tags);
    }

    return updated!;
  });

  return flashcard ? withFlashcardMeta(ctx, flashcard) : undefined;
}

export async function deleteFlashcard(
  ctx: ServiceContext,
  id: string,
): Promise<void> {
  // Collect dependents before the delete cascades the prereq edges away.
  const dependentIds = await getDependentIds(ctx, id);

  // review_units.flashcard_id has no DB-level FK on migrated databases, so
  // remove the generated review units explicitly (review_logs cascade off them).
  ctx.db.transaction((tx) => {
    tx.delete(reviewUnits).where(eq(reviewUnits.flashcardId, id)).run();
    tx.delete(flashcards).where(eq(flashcards.id, id)).run();
  });

  // The deleted flashcard may have been the lock holding dependents back.
  if (dependentIds.length > 0) {
    await refreshDependentSubgraph(ctx, dependentIds);
  }
}

/**
 * Archive or unarchive a flashcard; mirrors the flag onto its generated review
 * units.
 */
export async function setArchived(
  ctx: ServiceContext,
  flashcardId: string,
  archived: boolean,
): Promise<FlashcardWithMeta | undefined> {
  const flashcard = ctx.db
    .select()
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .get();
  if (!flashcard) return undefined;

  const now = new Date();
  ctx.db.transaction((tx) => {
    tx.update(flashcards)
      .set({ archived, updatedAt: now })
      .where(eq(flashcards.id, flashcardId))
      .run();
    tx.update(reviewUnits)
      .set({ archived, updatedAt: now })
      .where(eq(reviewUnits.flashcardId, flashcardId))
      .run();
  });

  await refreshAfterPrerequisiteStateChange(ctx, flashcardId);

  return withFlashcardMeta(ctx, { ...flashcard, archived });
}

/**
 * Summarize the prerequisite edges a move would delete. Prerequisites are edges
 * pointing into this flashcard; dependents are edges pointing out of it. Both are
 * severed when the flashcard leaves its deck, because edges can't cross decks.
 */
export async function getMoveConsequences(
  ctx: ServiceContext,
  id: string,
): Promise<FlashcardMoveConsequences> {
  const [prereqIds, dependentIds] = await Promise.all([
    getPrereqIds(ctx, id),
    getDependentIds(ctx, id),
  ]);
  return {
    prerequisiteCount: prereqIds.length,
    dependentCount: dependentIds.length,
  };
}

/**
 * Move a flashcard to another deck. Because prerequisite edges can't cross deck
 * boundaries, every incoming and outgoing edge is deleted, the generated review
 * units follow the flashcard's deck, the saved canvas position is cleared, and
 * lock state is recomputed for the moved flashcard and its former dependents.
 */
export async function moveFlashcard(
  ctx: ServiceContext,
  id: string,
  targetDeckId: string,
): Promise<FlashcardWithMeta | undefined> {
  const current = ctx.db
    .select()
    .from(flashcards)
    .where(eq(flashcards.id, id))
    .get();
  if (!current) return undefined;

  // Same-deck move is a no-op: don't sever the deck's own edges.
  if (current.deckId === targetDeckId) {
    return withFlashcardMeta(ctx, current);
  }

  const targetDeck = ctx.db
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.id, targetDeckId))
    .get();
  if (!targetDeck) {
    throw new Error(`Deck not found: ${targetDeckId}`);
  }

  // Capture former dependents before the edges are deleted, so their lock state
  // can be recomputed once the moved flashcard no longer secures them.
  const dependentIds = await getDependentIds(ctx, id);
  const now = new Date();

  const moved = ctx.db.transaction((tx) => {
    tx.delete(flashcardPrereqs)
      .where(
        or(
          eq(flashcardPrereqs.prereqId, id),
          eq(flashcardPrereqs.dependentId, id),
        ),
      )
      .run();
    const updated = tx
      .update(flashcards)
      .set({ deckId: targetDeckId, posX: null, posY: null, updatedAt: now })
      .where(eq(flashcards.id, id))
      .returning()
      .get();
    tx.update(reviewUnits)
      .set({ deckId: targetDeckId, updatedAt: now })
      .where(eq(reviewUnits.flashcardId, id))
      .run();
    return updated!;
  });

  // The moved flashcard lost its incoming prerequisites; its former dependents
  // lost it as a prerequisite. Recompute both plus their transitive dependents.
  await refreshDependentSubgraph(ctx, [id, ...dependentIds]);

  return withFlashcardMeta(ctx, moved);
}
