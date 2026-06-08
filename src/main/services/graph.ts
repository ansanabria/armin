import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { State } from "./scheduler";

const { cardPrereqs, cards } = schema;

export async function getPrereqIds(cardId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: cardPrereqs.prereqId })
    .from(cardPrereqs)
    .where(eq(cardPrereqs.dependentId, cardId))
    .all();
  return rows.map((r) => r.id);
}

export async function getDependentIds(cardId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: cardPrereqs.dependentId })
    .from(cardPrereqs)
    .where(eq(cardPrereqs.prereqId, cardId))
    .all();
  return rows.map((r) => r.id);
}

/**
 * A card is unlocked when it has no prerequisites, or every prerequisite has
 * graduated into the FSRS `Review` state.
 */
export async function isUnlocked(cardId: string): Promise<boolean> {
  const prereqIds = await getPrereqIds(cardId);
  if (prereqIds.length === 0) return true;
  const states = await getDb()
    .select({ state: cards.state })
    .from(cards)
    .where(inArray(cards.id, prereqIds))
    .all();
  return states.every((s) => s.state === State.Review);
}

/** Would adding edge prereq → dependent introduce a cycle? */
async function reaches(from: string, target: string): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(await getDependentIds(node)));
  }
  return false;
}

export async function addPrereq(
  prereqId: string,
  dependentId: string,
): Promise<void> {
  if (prereqId === dependentId) {
    throw new Error("A card cannot be its own prerequisite.");
  }
  if (await reaches(dependentId, prereqId)) {
    throw new Error(
      "That edge would create a cycle in the prerequisite graph.",
    );
  }
  const edgeCards = await getDb()
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
  await getDb()
    .insert(cardPrereqs)
    .values({ prereqId, dependentId })
    .onConflictDoNothing()
    .run();
}

export async function removePrereq(
  prereqId: string,
  dependentId: string,
): Promise<void> {
  await getDb()
    .delete(cardPrereqs)
    .where(
      and(
        eq(cardPrereqs.prereqId, prereqId),
        eq(cardPrereqs.dependentId, dependentId),
      ),
    )
    .run();
}

export type DeckGraph = {
  nodes: { id: string; front: string; state: number; locked: boolean }[];
  edges: { prereqId: string; dependentId: string }[];
};

export async function getDeckGraph(deckId: string): Promise<DeckGraph> {
  const db = getDb();
  const deckCards = await db
    .select({ id: cards.id, front: cards.front, state: cards.state })
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
      locked: !(await isUnlocked(c.id)),
    })),
  );
  return { nodes, edges };
}
