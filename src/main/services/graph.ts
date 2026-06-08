import { and, eq, inArray } from "drizzle-orm";
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
  const prereqIds = await getPrereqIds(ctx, cardId);
  if (prereqIds.length === 0) return true;
  const floor = await getPrereqStabilityFloor(ctx);
  const prereqs = await ctx.db
    .select({ state: cards.state, stability: cards.stability })
    .from(cards)
    .where(inArray(cards.id, prereqIds))
    .all();
  return prereqs.every((prereq) => isPrereqSecured(prereq, floor));
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
  await syncCardScheduling(ctx, dependentId);
}

export type DeckGraph = {
  nodes: {
    id: string;
    front: string;
    back: string;
    state: number;
    locked: boolean;
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
  const nodes = await Promise.all(
    deckCards.map(async (c) => ({
      ...c,
      locked: !(await isUnlocked(ctx, c.id)),
    })),
  );
  return { nodes, edges };
}
