import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import {
  isPendingSchedule,
  isPrereqSecured,
  newCardFields,
  pendingCardFields,
} from "./scheduler";
import { getSettings } from "./settings";

const { cardPrereqs, cards } = schema;

export async function getPrereqIds(
  ctx: ServiceContext,
  cardId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: cardPrereqs.prereqId })
    .from(cardPrereqs)
    .where(eq(cardPrereqs.dependentId, cardId))
    .all();
  return rows.map((r) => r.id);
}

export async function getDependentIds(
  ctx: ServiceContext,
  cardId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: cardPrereqs.dependentId })
    .from(cardPrereqs)
    .where(eq(cardPrereqs.prereqId, cardId))
    .all();
  return rows.map((r) => r.id);
}

async function getPrereqStabilityFloor(ctx: ServiceContext): Promise<number> {
  return (await getSettings(ctx)).prereqStabilityFloor;
}

/**
 * A card is unlocked when it has no prerequisites, or every prerequisite is
 * secured in FSRS Review state with stability at or above the user floor.
 */
export async function isUnlocked(
  ctx: ServiceContext,
  cardId: string,
): Promise<boolean> {
  const locked = await getLockedByCardIds(ctx, [cardId]);
  return !(locked.get(cardId) ?? false);
}

/** Batch locked lookup from the denormalized cards.locked column. */
export async function getLockedByCardIds(
  ctx: ServiceContext,
  cardIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(cardIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const rows = await ctx.db
    .select({ id: cards.id, locked: cards.locked })
    .from(cards)
    .where(inArray(cards.id, uniqueIds))
    .all();

  for (const row of rows) {
    locked.set(row.id, row.locked);
  }

  return locked;
}

/** Recompute lock state from prerequisite graph + FSRS fields. */
async function computeLockedByCardIds(
  ctx: ServiceContext,
  cardIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(cardIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const floor = await getPrereqStabilityFloor(ctx);
  const edges = await ctx.db
    .select({
      dependentId: cardPrereqs.dependentId,
      prereqId: cardPrereqs.prereqId,
    })
    .from(cardPrereqs)
    .where(inArray(cardPrereqs.dependentId, uniqueIds))
    .all();

  if (edges.length === 0) return locked;

  const prereqIds = [...new Set(edges.map((edge) => edge.prereqId))];
  const prereqRows = await ctx.db
    .select({
      id: cards.id,
      state: cards.state,
      stability: cards.stability,
    })
    .from(cards)
    .where(inArray(cards.id, prereqIds))
    .all();
  const prereqById = new Map(prereqRows.map((row) => [row.id, row]));

  const prereqsByDependent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = prereqsByDependent.get(edge.dependentId) ?? [];
    list.push(edge.prereqId);
    prereqsByDependent.set(edge.dependentId, list);
  }

  for (const id of uniqueIds) {
    const prereqList = prereqsByDependent.get(id) ?? [];
    if (prereqList.length === 0) continue;
    const unlocked = prereqList.every((prereqId) => {
      const prereq = prereqById.get(prereqId);
      return prereq ? isPrereqSecured(prereq, floor) : false;
    });
    locked.set(id, !unlocked);
  }

  return locked;
}

export async function persistLockedForCardIds(
  ctx: ServiceContext,
  cardIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(cardIds)];
  if (uniqueIds.length === 0) return;

  const computed = await computeLockedByCardIds(ctx, uniqueIds);
  const now = new Date();

  await ctx.db.transaction(async (tx) => {
    for (const id of uniqueIds) {
      await tx
        .update(cards)
        .set({ locked: computed.get(id) ?? false, updatedAt: now })
        .where(eq(cards.id, id))
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
  await persistLockedForCardIds(ctx, affected);
}

export async function refreshLockedAfterPrereqSecured(
  ctx: ServiceContext,
  prereqId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, prereqId);
  if (affected.length === 0) return;
  await persistLockedForCardIds(ctx, affected);
}

export async function refreshAllLockedStates(
  ctx: ServiceContext,
): Promise<void> {
  const dependents = await ctx.db
    .selectDistinct({ id: cardPrereqs.dependentId })
    .from(cardPrereqs)
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length === 0) {
    await ctx.db.update(cards).set({ locked: false }).run();
    return;
  }

  await persistLockedForCardIds(ctx, dependentIds);
  await ctx.db
    .update(cards)
    .set({ locked: false })
    .where(notInArray(cards.id, dependentIds))
    .run();
}

export async function refreshLockedForDeck(
  ctx: ServiceContext,
  deckId: string,
): Promise<void> {
  const deckCards = await ctx.db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();
  const deckCardIds = new Set(deckCards.map((row) => row.id));

  const dependents = await ctx.db
    .selectDistinct({ id: cardPrereqs.dependentId })
    .from(cardPrereqs)
    .where(inArray(cardPrereqs.dependentId, [...deckCardIds]))
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length > 0) {
    await persistLockedForCardIds(ctx, dependentIds);
  }

  const nonDependentIds = deckCards
    .map((row) => row.id)
    .filter((id) => !dependentIds.includes(id));
  if (nonDependentIds.length === 0) return;

  await ctx.db
    .update(cards)
    .set({ locked: false })
    .where(inArray(cards.id, nonDependentIds))
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

/** Align FSRS scheduling with lock state for never-studied cards. */
export async function syncCardScheduling(
  ctx: ServiceContext,
  cardId: string,
): Promise<void> {
  const card = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.id, cardId))
    .get();
  if (!card || card.reps > 0 || card.lastReview != null) return;

  const unlocked = await isUnlocked(ctx, cardId);
  const pending = isPendingSchedule(card);
  const now = new Date();

  if (!unlocked && !pending) {
    await ctx.db
      .update(cards)
      .set({ ...pendingCardFields(), updatedAt: now })
      .where(eq(cards.id, cardId))
      .run();
    return;
  }

  if (unlocked && pending) {
    await ctx.db
      .update(cards)
      .set({ ...newCardFields(now), updatedAt: now })
      .where(eq(cards.id, cardId))
      .run();
  }
}

/** Start FSRS for dependents whose prerequisites just became secured. */
export async function activateUnlockedDependents(
  ctx: ServiceContext,
  cardId: string,
): Promise<void> {
  await refreshLockedAfterPrereqSecured(ctx, cardId);
  const dependentIds = await getDependentIds(ctx, cardId);
  await Promise.all(
    dependentIds.map((dependentId) => syncCardScheduling(ctx, dependentId)),
  );
}

export async function addPrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  if (prereqId === dependentId) {
    throw new Error("A card cannot be its own prerequisite.");
  }
  if (await reaches(ctx, dependentId, prereqId)) {
    throw new Error(
      "That edge would create a cycle in the prerequisite graph.",
    );
  }
  const edgeCards = await ctx.db
    .select({ id: cards.id, deckId: cards.deckId })
    .from(cards)
    .where(inArray(cards.id, [prereqId, dependentId]))
    .all();
  if (edgeCards.length !== 2) {
    throw new Error("Both cards must exist before connecting prerequisites.");
  }
  const prereq = edgeCards.find((card) => card.id === prereqId);
  const dependent = edgeCards.find((card) => card.id === dependentId);
  if (prereq?.deckId !== dependent?.deckId) {
    throw new Error("Prerequisite edges can only connect cards in one deck.");
  }
  await ctx.db
    .insert(cardPrereqs)
    .values({ prereqId, dependentId })
    .onConflictDoNothing()
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncCardScheduling(ctx, dependentId);
}

export async function removePrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  await ctx.db
    .delete(cardPrereqs)
    .where(
      and(
        eq(cardPrereqs.prereqId, prereqId),
        eq(cardPrereqs.dependentId, dependentId),
      ),
    )
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncCardScheduling(ctx, dependentId);
}

export type DeckGraph = {
  nodes: {
    id: string;
    front: string;
    back: string;
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
  const deckCards = await db
    .select({
      id: cards.id,
      front: cards.front,
      back: cards.back,
      state: cards.state,
      locked: cards.locked,
      posX: cards.posX,
      posY: cards.posY,
    })
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all();
  const ids = deckCards.map((c) => c.id);
  const edges = ids.length
    ? (
        await db
          .select({
            prereqId: cardPrereqs.prereqId,
            dependentId: cardPrereqs.dependentId,
          })
          .from(cardPrereqs)
          .where(inArray(cardPrereqs.dependentId, ids))
          .all()
      ).filter((e) => ids.includes(e.prereqId))
    : [];
  const nodes = deckCards.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    state: c.state,
    locked: c.locked,
    x: c.posX,
    y: c.posY,
  }));
  return { nodes, edges };
}

export type NodePlacement = { cardId: string; x: number; y: number };

/**
 * Persist canvas positions for a deck's cards. Only the supplied cards are
 * touched, so callers can save a single dragged node or the whole layout.
 */
export async function saveLayout(
  ctx: ServiceContext,
  deckId: string,
  placements: NodePlacement[],
): Promise<void> {
  if (placements.length === 0) return;
  const ids = placements.map((p) => p.cardId);
  const owned = await ctx.db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.deckId, deckId), inArray(cards.id, ids)))
    .all();
  const ownedIds = new Set(owned.map((c) => c.id));
  const toWrite = placements.filter((p) => ownedIds.has(p.cardId));
  if (toWrite.length === 0) return;
  await ctx.db.transaction(async (tx) => {
    for (const p of toWrite) {
      await tx
        .update(cards)
        .set({ posX: p.x, posY: p.y })
        .where(eq(cards.id, p.cardId))
        .run();
    }
  });
}
