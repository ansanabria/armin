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
import { getEffectiveSettingsForDeck } from "./settings";

const { reviewUnits, flashcardPrereqs, flashcards } = schema;

export async function getPrereqIds(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<string[]> {
  const rows = ctx.db
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
  const rows = ctx.db
    .select({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .where(eq(flashcardPrereqs.prereqId, flashcardId))
    .all();
  return rows.map((r) => r.id);
}

async function getReviewUnitsByFlashcardId(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<Map<string, { state: number; stability: number }[]>> {
  const uniqueIds = [...new Set(flashcardIds)];
  const byFlashcard = new Map<string, { state: number; stability: number }[]>();
  if (uniqueIds.length === 0) return byFlashcard;

  const rows = ctx.db
    .select({
      flashcardId: reviewUnits.flashcardId,
      state: reviewUnits.state,
      stability: reviewUnits.stability,
    })
    .from(reviewUnits)
    .where(inArray(reviewUnits.flashcardId, uniqueIds))
    .all();

  for (const row of rows) {
    const list = byFlashcard.get(row.flashcardId) ?? [];
    list.push(row);
    byFlashcard.set(row.flashcardId, list);
  }
  return byFlashcard;
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

  const rows = ctx.db
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

  const edges = ctx.db
    .select({
      dependentId: flashcardPrereqs.dependentId,
      prereqId: flashcardPrereqs.prereqId,
      dependentDeckId: flashcards.deckId,
    })
    .from(flashcardPrereqs)
    .innerJoin(flashcards, eq(flashcardPrereqs.dependentId, flashcards.id))
    .where(inArray(flashcardPrereqs.dependentId, uniqueIds))
    .all();

  if (edges.length === 0) return locked;

  const prereqIds = [...new Set(edges.map((edge) => edge.prereqId))];
  const prereqReviewUnits = await getReviewUnitsByFlashcardId(ctx, prereqIds);
  const prereqRows = ctx.db
    .select({ id: flashcards.id, archived: flashcards.archived })
    .from(flashcards)
    .where(inArray(flashcards.id, prereqIds))
    .all();
  const prereqArchived = new Map(
    prereqRows.map((row) => [row.id, row.archived]),
  );
  const floorByDeckId = new Map<string, number>();
  for (const deckId of new Set(edges.map((edge) => edge.dependentDeckId))) {
    floorByDeckId.set(
      deckId,
      (await getEffectiveSettingsForDeck(ctx, deckId)).prereqStabilityFloor,
    );
  }

  const prereqsByDependent = new Map<
    string,
    { prereqId: string; floor: number }[]
  >();
  for (const edge of edges) {
    const list = prereqsByDependent.get(edge.dependentId) ?? [];
    if (prereqArchived.get(edge.prereqId)) continue;
    list.push({
      prereqId: edge.prereqId,
      floor: floorByDeckId.get(edge.dependentDeckId) ?? 2,
    });
    prereqsByDependent.set(edge.dependentId, list);
  }

  for (const id of uniqueIds) {
    const prereqList = prereqsByDependent.get(id) ?? [];
    if (prereqList.length === 0) continue;
    const unlocked = prereqList.every(({ prereqId, floor }) => {
      const reviewUnitRows = prereqReviewUnits.get(prereqId) ?? [];
      return (
        reviewUnitRows.length > 0 &&
        reviewUnitRows.every((row) => isPrereqSecured(row, floor))
      );
    });
    locked.set(id, !unlocked);
  }

  return locked;
}

/** Persist flashcard lock state and mirror it onto every generated review unit. */
async function persistLockedForFlashcardIds(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(flashcardIds)];
  if (uniqueIds.length === 0) return;

  const computed = await computeLockedByFlashcardIds(ctx, uniqueIds);
  const now = new Date();

  ctx.db.transaction((tx) => {
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

async function collectTransitiveDependentsForRoots(
  ctx: ServiceContext,
  rootIds: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const stack = [...rootIds];

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

async function syncFlashcardsScheduling(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(flashcardIds)];
  await Promise.all(uniqueIds.map((id) => syncFlashcardScheduling(ctx, id)));
}

async function refreshLockStateAndScheduling(
  ctx: ServiceContext,
  flashcardIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(flashcardIds)];
  if (uniqueIds.length === 0) return;

  await persistLockedForFlashcardIds(ctx, uniqueIds);
  await syncFlashcardsScheduling(ctx, uniqueIds);
}

export async function refreshDependentSubgraph(
  ctx: ServiceContext,
  dependentIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(dependentIds)];
  const affected = await collectTransitiveDependentsForRoots(ctx, uniqueIds);
  await refreshLockStateAndScheduling(ctx, [...uniqueIds, ...affected]);
}

export async function refreshAfterPrerequisiteStateChange(
  ctx: ServiceContext,
  prereqId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, prereqId);
  await refreshLockStateAndScheduling(ctx, affected);
}

export async function refreshAllLockedStates(
  ctx: ServiceContext,
): Promise<void> {
  const dependents = ctx.db
    .selectDistinct({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length === 0) {
    ctx.db.update(flashcards).set({ locked: false }).run();
    ctx.db.update(reviewUnits).set({ locked: false }).run();
    return;
  }

  await refreshLockStateAndScheduling(ctx, dependentIds);
  ctx.db
    .update(flashcards)
    .set({ locked: false })
    .where(notInArray(flashcards.id, dependentIds))
    .run();
  ctx.db
    .update(reviewUnits)
    .set({ locked: false })
    .where(notInArray(reviewUnits.flashcardId, dependentIds))
    .run();
  const nonDependents = ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(notInArray(flashcards.id, dependentIds))
    .all();
  await syncFlashcardsScheduling(
    ctx,
    nonDependents.map((row) => row.id),
  );
}

export async function refreshLockedForDeck(
  ctx: ServiceContext,
  deckId: string,
): Promise<void> {
  const deckFlashcards = ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(eq(flashcards.deckId, deckId))
    .all();
  const deckFlashcardIds = deckFlashcards.map((row) => row.id);
  if (deckFlashcardIds.length === 0) return;

  const dependents = ctx.db
    .selectDistinct({ id: flashcardPrereqs.dependentId })
    .from(flashcardPrereqs)
    .where(inArray(flashcardPrereqs.dependentId, deckFlashcardIds))
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length > 0) {
    await refreshLockStateAndScheduling(ctx, dependentIds);
  }

  const nonDependentIds = deckFlashcardIds.filter(
    (id) => !dependentIds.includes(id),
  );
  if (nonDependentIds.length === 0) return;

  ctx.db
    .update(flashcards)
    .set({ locked: false })
    .where(inArray(flashcards.id, nonDependentIds))
    .run();
  ctx.db
    .update(reviewUnits)
    .set({ locked: false })
    .where(inArray(reviewUnits.flashcardId, nonDependentIds))
    .run();
  await syncFlashcardsScheduling(ctx, nonDependentIds);
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
async function syncFlashcardScheduling(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<void> {
  const flashcard = ctx.db
    .select({ locked: flashcards.locked })
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .get();
  if (!flashcard) return;

  const unlocked = !flashcard.locked;
  const siblingReviewUnits = ctx.db
    .select()
    .from(reviewUnits)
    .where(eq(reviewUnits.flashcardId, flashcardId))
    .all();
  const now = new Date();

  for (const reviewUnit of siblingReviewUnits) {
    if (reviewUnit.reps > 0 || reviewUnit.lastReview != null) continue;
    const pending = isPendingSchedule(reviewUnit);

    if (!unlocked && !pending) {
      ctx.db
        .update(reviewUnits)
        .set({ ...pendingReviewUnitFields(), locked: true, updatedAt: now })
        .where(eq(reviewUnits.id, reviewUnit.id))
        .run();
    } else if (unlocked && pending) {
      ctx.db
        .update(reviewUnits)
        .set({ ...newReviewUnitFields(now), locked: false, updatedAt: now })
        .where(eq(reviewUnits.id, reviewUnit.id))
        .run();
    }
  }
}

/** Recompute dependents after a prerequisite flashcard's securedness changes. */
export async function refreshAfterPrerequisiteReview(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<void> {
  await refreshAfterPrerequisiteStateChange(ctx, flashcardId);
}

export async function addPrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  if (prereqId === dependentId) {
    throw new Error("A flashcard cannot be its own prerequisite.");
  }
  // Validate existence and same-deck membership before the cycle traversal, so
  // errors are specific and `reaches` never walks an invalid edge.
  const edgeFlashcards = ctx.db
    .select({ id: flashcards.id, deckId: flashcards.deckId })
    .from(flashcards)
    .where(inArray(flashcards.id, [prereqId, dependentId]))
    .all();
  const prereq = edgeFlashcards.find((f) => f.id === prereqId);
  const dependent = edgeFlashcards.find((f) => f.id === dependentId);
  if (!prereq || !dependent) {
    throw new Error(
      "Both flashcards must exist before connecting prerequisites.",
    );
  }
  if (prereq.deckId !== dependent.deckId) {
    throw new Error(
      "Prerequisites can only connect flashcards in the same deck.",
    );
  }
  if (await reaches(ctx, dependentId, prereqId)) {
    throw new Error(
      "That edge would create a cycle in the prerequisite graph.",
    );
  }
  ctx.db
    .insert(flashcardPrereqs)
    .values({ prereqId, dependentId })
    .onConflictDoNothing()
    .run();
  await refreshDependentSubgraph(ctx, [dependentId]);
}

export async function removePrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  ctx.db
    .delete(flashcardPrereqs)
    .where(
      and(
        eq(flashcardPrereqs.prereqId, prereqId),
        eq(flashcardPrereqs.dependentId, dependentId),
      ),
    )
    .run();
  await refreshDependentSubgraph(ctx, [dependentId]);
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
  const deckFlashcards = db
    .select()
    .from(flashcards)
    .where(eq(flashcards.deckId, deckId))
    .all();
  const ids = deckFlashcards.map((n) => n.id);
  const idSet = new Set(ids);

  const stateRows = ids.length
    ? db
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
    ? db
        .select({
          prereqId: flashcardPrereqs.prereqId,
          dependentId: flashcardPrereqs.dependentId,
        })
        .from(flashcardPrereqs)
        .where(inArray(flashcardPrereqs.dependentId, ids))
        .all()
        .filter((e) => idSet.has(e.prereqId))
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
  const owned = ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(and(eq(flashcards.deckId, deckId), inArray(flashcards.id, ids)))
    .all();
  const ownedIds = new Set(owned.map((n) => n.id));
  const toWrite = placements.filter((p) => ownedIds.has(p.flashcardId));
  if (toWrite.length === 0) return;
  ctx.db.transaction((tx) => {
    for (const p of toWrite) {
      tx.update(flashcards)
        .set({ posX: p.x, posY: p.y })
        .where(eq(flashcards.id, p.flashcardId))
        .run();
    }
  });
}
