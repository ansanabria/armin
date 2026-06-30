import { eq, inArray, notInArray } from "drizzle-orm";
import { schema } from "../db";
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

export async function isUnlocked(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<boolean> {
  const locked = await getLockedByFlashcardIds(ctx, [flashcardId]);
  return !(locked.get(flashcardId) ?? false);
}

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
  return collectTransitiveDependentsForRoots(ctx, [rootId]);
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

export async function refreshAfterPrerequisiteReview(
  ctx: ServiceContext,
  flashcardId: string,
): Promise<void> {
  await refreshAfterPrerequisiteStateChange(ctx, flashcardId);
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
