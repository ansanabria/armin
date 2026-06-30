import { and, eq, inArray } from "drizzle-orm";
import { schema } from "../db";
import {
  flashcardDisplay,
  parseStoredContent,
  type FlashcardType,
} from "./flashcard-types";
import type { ServiceContext } from "./context";
import {
  getDependentIds,
  refreshDependentSubgraph,
} from "./prerequisite-state";

const { reviewUnits, flashcardPrereqs, flashcards } = schema;

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
