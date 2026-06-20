import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema } from "../db";
import {
  flashcardDisplay,
  parseStoredContent,
  type FlashcardType,
} from "./flashcard-types";
import type { ServiceContext } from "./context";
import {
  isPendingSchedule,
  isPrereqSecured,
  newReviewUnitFields,
  pendingReviewUnitFields,
} from "./scheduler";
import { getSettings } from "./settings";

const { reviewUnits, flashcardPrereqs, flashcards } = schema;

export async function getPrereqIds(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: flashcardPrereqs.prereqId })
    .from(flashcardPrereqs)
    .where(eq(flashcardPrereqs.dependentId, flashcardId))
    .all();
  return rows.map((r) => r.id);
}

export async function getDependentIds(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .where(eq(flashcardPrereqs.prereqId, flashcardId))
    .all();
  return rows.map((r) => r.id);
}

async function getPrereqStabilityFloor(ctx: ServiceContext): Promise<number> {
  return (await getSettings(ctx)).prereqStabilityFloor;
}

/**
 * A flashcard is "secured" only when every review unit it generated is secured
 * in FSRS (Review state with stability at or above the user floor).
 */
async function getFlashcardsSecured(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(flashcardIds)];
  const secured = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return secured;

  const floor = await getPrereqStabilityFloor(ctx);
  const rows = await ctx.db
    .select({
      flashcardId: reviewUnits.flashcardId,
      state: reviewUnits.state,
      stability: reviewUnits.stability,
    })
    .from(reviewUnits)
    .where(inArray(reviewUnits.flashcardId, uniqueIds))
    .all();

  const byFlashcard = new Map<string, { state: number; stability: number }[]>();
  for (const row of rows) {
    const list = byFlashcard.get(row.flashcardId) ?? [];
    list.push(row);
    byFlashcard.set(row.flashcardId, list);
  }

  for (const id of uniqueIds) {
    const reviewUnitRows = byFlashcard.get(id) ?? [];
    secured.set(
      id,
      reviewUnitRows.length > 0 &&
        reviewUnitRows.every((row) => isPrereqSecured(row, floor)),
    );
  }

  return secured;
}

/**
 * A flashcard is unlocked when none of its prerequisite flashcards are still
 * locked.
 */
export async function isUnlocked(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<boolean> {
  const locked = await getLockedByFlashcardIds(ctx, [flashcardId]);
  return !(locked.get(flashcardId) ?? false);
}

/** Batch locked lookup from the denormalized flashcards.locked column. */
export async function getLockedByFlashcardIds(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(flashcardIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const rows = await ctx.db
    .select({ id: flashcards.id, locked: flashcards.locked })
    .from(flashcards)
    .where(inArray(flashcards.id, uniqueIds))
    .all();

  for (const row of rows) {
    locked.set(row.id, row.locked);
  }

  return locked;
}

/** Recompute lock state from the prerequisite graph + prereq securedness. */
async function computeLockedByFlashcardIds(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(flashcardIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const edges = await ctx.db
    .select({
      dependentId: flashcardPrereqs.dependentId,
      prereqId: flashcardPrereqs.prereqId,
    })
    .from(flashcardPrereqs)
    .innerJoin(flashcards, eq(flashcardPrereqs.prereqId, flashcards.id))
    .where(
      and(
        inArray(flashcardPrereqs.dependentId, uniqueIds),
        eq(flashcards.archived, false),
      ),
    )
    .all();

  if (edges.length === 0) return locked;

  const prereqIds = [...new Set(edges.map((edge) => edge.prereqId))];
  const securedByFlashcard = await getFlashcardsSecured(ctx, prereqIds);

  const prereqsByDependent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = prereqsByDependent.get(edge.dependentId) ?? [];
    list.push(edge.prereqId);
    prereqsByDependent.set(edge.dependentId, list);
  }

  for (const id of uniqueIds) {
    const prereqList = prereqsByDependent.get(id) ?? [];
    if (prereqList.length === 0) continue;
    const unlocked = prereqList.every((prereqId) =>
      securedByFlashcard.get(prereqId),
    );
    locked.set(id, !unlocked);
  }

  return locked;
}

/** Persist flashcard lock state and mirror it onto every generated review unit. */
export async function persistLockedForFlashcardIds(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(flashcardIds)];
  if (uniqueIds.length === 0) return;

  const computed = await computeLockedByFlashcardIds(ctx, uniqueIds);
  const now = new Date();

  await ctx.db.transaction((tx) => {
    for (const id of uniqueIds) {
      const locked = computed.get(id) ?? false;
      tx.update(flashcards)
        .set({ locked, updatedAt: now })
        .where(eq(flashcards.id, id))
        .run();
      tx.update(reviewUnits)
        .set({ locked, updatedAt: now })
        .where(eq(reviewUnits.flashcardId, id))
        .run();
    }
  });
}

async function collectTransitiveDependents(
  ctx: ServiceContext,
  rootId: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const stack = [rootId];

  while (stack.length) {
    const node = stack.pop()!;
    const dependents = await getDependentIds(ctx, node);
    for (const dependentId of dependents) {
      if (seen.has(dependentId)) continue;
      seen.add(dependentId);
      stack.push(dependentId);
    }
  }

  return [...seen];
}

export async function refreshLockedAfterPrereqChange(
  ctx: ServiceContext,
  dependentId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, dependentId);
  affected.push(dependentId);
  await persistLockedForFlashcardIds(ctx, affected);
}

export async function refreshLockedAfterPrereqSecured(
  ctx: ServiceContext,
  prereqId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, prereqId);
  if (affected.length === 0) return;
  await persistLockedForFlashcardIds(ctx, affected);
}

export async function refreshAllLockedStates(
  ctx: ServiceContext,
): Promise<void> {
  const dependents = await ctx.db
    .selectDistinct({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length === 0) {
    await ctx.db.update(flashcards).set({ locked: false }).run();
    await ctx.db.update(reviewUnits).set({ locked: false }).run();
    return;
  }

  await persistLockedForFlashcardIds(ctx, dependentIds);
  await ctx.db
    .update(flashcards)
    .set({ locked: false })
    .where(notInArray(flashcards.id, dependentIds))
    .run();
  await ctx.db
    .update(reviewUnits)
    .set({ locked: false })
    .where(notInArray(reviewUnits.flashcardId, dependentIds))
    .run();
}

export async function refreshLockedForDeck(
  ctx: ServiceContext,
  deckId: string,
): Promise<void> {
  const deckFlashcards = await ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(eq(flashcards.deckId, deckId))
    .all();
  const deckFlashcardIds = deckFlashcards.map((row) => row.id);
  if (deckFlashcardIds.length === 0) return;

  const dependents = await ctx.db
    .selectDistinct({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .where(inArray(flashcardPrereqs.dependentId, deckFlashcardIds))
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length > 0) {
    await persistLockedForFlashcardIds(ctx, dependentIds);
  }

  const nonDependentIds = deckFlashcardIds.filter(
    (id) => !dependentIds.includes(id),
  );
  if (nonDependentIds.length === 0) return;

  await ctx.db
    .update(flashcards)
    .set({ locked: false })
    .where(inArray(flashcards.id, nonDependentIds))
    .run();
  await ctx.db
    .update(reviewUnits)
    .set({ locked: false })
    .where(inArray(reviewUnits.flashcardId, nonDependentIds))
    .run();
}

/** Would adding edge prereq → dependent introduce a cycle? */
async function reaches(
  ctx: ServiceContext,
  from: string,
  target: string,
): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(await getDependentIds(ctx, node)));
  }
  return false;
}

/**
 * Align FSRS scheduling with lock state for a flashcard's never-studied review
 * units.
 */
export async function syncFlashcardScheduling(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<void> {
  const flashcard = await ctx.db
    .select({ locked: flashcards.locked })
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .get();
  if (!flashcard) return;

  const unlocked = !flashcard.locked;
  const siblingReviewUnits = await ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.flashcardId, flashcardId))
    .all();
  const now = new Date();

  for (const reviewUnit of siblingReviewUnits) {
    if (reviewUnit.reps > 0 || reviewUnit.lastReview != null) continue;
    const pending = isPendingSchedule(reviewUnit);

    if (!unlocked && !pending) {
      await ctx.db
        .update(reviewUnits)
        .set({ ...pendingReviewUnitFields(), locked: true, updatedAt: now })
        .where(eq(reviewUnits.id, reviewUnit.id))
        .run();
    } else if (unlocked && pending) {
      await ctx.db
        .update(reviewUnits)
        .set({ ...newReviewUnitFields(now), locked: false, updatedAt: now })
        .where(eq(reviewUnits.id, reviewUnit.id))
        .run();
    }
  }
}

/** Start FSRS for dependents whose prerequisites just became secured. */
export async function activateUnlockedDependents(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<void> {
  await refreshLockedAfterPrereqSecured(ctx, flashcardId);
  const dependentIds = await getDependentIds(ctx, flashcardId);
  await Promise.all(
    dependentIds.map((dependentId) =>
      syncFlashcardScheduling(ctx, dependentId),
    ),
  );
}

export async function addPrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  if (prereqId === dependentId) {
    throw new Error("A flashcard cannot be its own prerequisite.");
  }
  if (await reaches(ctx, dependentId, prereqId)) {
    throw new Error(
      "That edge would create a cycle in the prerequisite graph.",
    );
  }
  const edgeFlashcards = await ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(inArray(flashcards.id, [prereqId, dependentId]))
    .all();
  if (edgeFlashcards.length !== 2) {
    throw new Error(
      "Both flashcards must exist before connecting prerequisites.",
    );
  }
  await ctx.db
    .insert(flashcardPrereqs)
    .values({ prereqId, dependentId })
    .onConflictDoNothing()
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncFlashcardScheduling(ctx, dependentId);
}

export async function removePrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  await ctx.db
    .delete(flashcardPrereqs)
    .where(
      and(
        eq(flashcardPrereqs.prereqId, prereqId),
        eq(flashcardPrereqs.dependentId, dependentId),
      ),
    )
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncFlashcardScheduling(ctx, dependentId);
}

export type DeckGraph = {
  nodes: {
    id: string;
    front: string;
    back: string;
    type: FlashcardType;
    state: number;
    locked: boolean;
    x: number | null;
    y: number | null;
  }[];
  edges: { prereqId: string; dependentId: string }[];
};

export async function getDeckGraph(
  ctx: ServiceContext,
  deckId: string,
): Promise<DeckGraph> {
  const db = ctx.db;
  const deckFlashcards = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.deckId, deckId))
    .all();
  const ids = deckFlashcards.map((n) => n.id);

  const stateRows = ids.length
    ? await db
        .select({
          flashcardId: reviewUnits.flashcardId,
          state: reviewUnits.state,
        })
        .from(reviewUnits)
        .where(inArray(reviewUnits.flashcardId, ids))
        .all()
    : [];
  const minStateByFlashcard = new Map<string, number>();
  for (const row of stateRows) {
    const current = minStateByFlashcard.get(row.flashcardId);
    if (current === undefined || row.state < current) {
      minStateByFlashcard.set(row.flashcardId, row.state);
    }
  }

  const edges = ids.length
    ? (
        await db
          .select({
            prereqId: flashcardPrereqs.prereqId,
            dependentId: flashcardPrereqs.dependentId,
          })
          .from(flashcardPrereqs)
          .where(inArray(flashcardPrereqs.dependentId, ids))
          .all()
      ).filter((e) => ids.includes(e.prereqId))
    : [];

  const nodes = deckFlashcards.map((flashcard) => {
    const { content, type } = parseStoredContent(
      flashcard.type,
      flashcard.content,
    );
    const display = flashcardDisplay(type, content);
    return {
      id: flashcard.id,
      front: display.front,
      back: display.back,
      type,
      state: minStateByFlashcard.get(flashcard.id) ?? 0,
      locked: flashcard.locked,
      x: flashcard.posX,
      y: flashcard.posY,
    };
  });
  return { nodes, edges };
}

export type GlobalGraphNode = DeckGraph["nodes"][number] & { deckId: string };

export type GlobalGraph = {
  nodes: GlobalGraphNode[];
  edges: { prereqId: string; dependentId: string }[];
};

/**
 * The whole prerequisite graph across every deck. Decks are carried on each node
 * (as `deckId`) so the view can express them as a color/filter lens, but they no
 * longer bound which flashcards or edges are returned.
 */
export async function getGlobalGraph(ctx: ServiceContext): Promise<GlobalGraph> {
  const db = ctx.db;
  const allFlashcards = await db.select().from(flashcards).all();
  const ids = allFlashcards.map((n) => n.id);

  const stateRows = ids.length
    ? await db
        .select({
          flashcardId: reviewUnits.flashcardId,
          state: reviewUnits.state,
        })
        .from(reviewUnits)
        .where(inArray(reviewUnits.flashcardId, ids))
        .all()
    : [];
  const minStateByFlashcard = new Map<string, number>();
  for (const row of stateRows) {
    const current = minStateByFlashcard.get(row.flashcardId);
    if (current === undefined || row.state < current) {
      minStateByFlashcard.set(row.flashcardId, row.state);
    }
  }

  const edges = ids.length
    ? await db
        .select({
          prereqId: flashcardPrereqs.prereqId,
          dependentId: flashcardPrereqs.dependentId,
        })
        .from(flashcardPrereqs)
        .all()
    : [];

  const nodes = allFlashcards.map((flashcard) => {
    const { content, type } = parseStoredContent(
      flashcard.type,
      flashcard.content,
    );
    const display = flashcardDisplay(type, content);
    return {
      id: flashcard.id,
      deckId: flashcard.deckId,
      front: display.front,
      back: display.back,
      type,
      state: minStateByFlashcard.get(flashcard.id) ?? 0,
      locked: flashcard.locked,
      x: flashcard.posX,
      y: flashcard.posY,
    };
  });
  return { nodes, edges };
}

export type NodePlacement = { flashcardId: string; x: number; y: number };

/**
 * Persist canvas positions for a deck's flashcards. Only the supplied
 * flashcards are touched, so callers can save a single dragged node or the
 * whole layout.
 */
export async function saveLayout(
  ctx: ServiceContext,
  deckId: string,
  placements: NodePlacement[],
): Promise<void> {
  if (placements.length === 0) return;
  const ids = placements.map((p) => p.flashcardId);
  const owned = await ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(and(eq(flashcards.deckId, deckId), inArray(flashcards.id, ids)))
    .all();
  const ownedIds = new Set(owned.map((n) => n.id));
  const toWrite = placements.filter((p) => ownedIds.has(p.flashcardId));
  if (toWrite.length === 0) return;
  await ctx.db.transaction((tx) => {
    for (const p of toWrite) {
      tx.update(flashcards)
        .set({ posX: p.x, posY: p.y })
        .where(eq(flashcards.id, p.flashcardId))
        .run();
    }
  });
}

/**
 * Deck-agnostic layout persistence for the global graph. Positions live on the
 * flashcard, so the only guard is that the flashcards exist — they may belong to
 * any deck.
 */
export async function saveGlobalLayout(
  ctx: ServiceContext,
  placements: NodePlacement[],
): Promise<void> {
  if (placements.length === 0) return;
  const ids = placements.map((p) => p.flashcardId);
  const existing = await ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(inArray(flashcards.id, ids))
    .all();
  const existingIds = new Set(existing.map((n) => n.id));
  const toWrite = placements.filter((p) => existingIds.has(p.flashcardId));
  if (toWrite.length === 0) return;
  await ctx.db.transaction((tx) => {
    for (const p of toWrite) {
      tx.update(flashcards)
        .set({ posX: p.x, posY: p.y })
        .where(eq(flashcards.id, p.flashcardId))
        .run();
    }
  });
}
