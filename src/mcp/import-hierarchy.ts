import { eq } from "drizzle-orm";
import type { Card, Deck } from "../main/db/schema";
import { schema } from "../main/db";
import { getDeck } from "../main/services/decks";
import { getDeckGraph } from "../main/services/graph";
import type { ServiceContext } from "../main/services/context";
import { newCardFields } from "../main/services/scheduler";

export type HierarchyCardInput = {
  clientId: string;
  front: string;
  back: string;
  type?: string;
  prerequisites?: string[];
};

export type ImportHierarchyInput = {
  deckId?: string;
  deckName?: string;
  deckDescription?: string | null;
  cards: HierarchyCardInput[];
};

export type ImportedHierarchy = {
  deck: Deck;
  cards: Array<Card & { clientId: string }>;
  edges: { prereqClientId: string; dependentClientId: string }[];
};

function assertUniqueClientIds(cards: HierarchyCardInput[]) {
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.clientId)) {
      throw new Error(`Duplicate card clientId: ${card.clientId}`);
    }
    seen.add(card.clientId);
  }
}

function assertPrerequisitesExist(cards: HierarchyCardInput[]) {
  const ids = new Set(cards.map((card) => card.clientId));
  for (const card of cards) {
    for (const prereqId of card.prerequisites ?? []) {
      if (!ids.has(prereqId)) {
        throw new Error(
          `Card "${card.clientId}" references missing prerequisite "${prereqId}".`,
        );
      }
    }
  }
}

function assertAcyclicHierarchy(cards: HierarchyCardInput[]) {
  const dependentsByPrereq = new Map<string, string[]>();
  for (const card of cards) {
    for (const prereqId of card.prerequisites ?? []) {
      const dependents = dependentsByPrereq.get(prereqId) ?? [];
      dependents.push(card.clientId);
      dependentsByPrereq.set(prereqId, dependents);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error("The submitted prerequisite hierarchy contains a cycle.");
    }

    visiting.add(id);
    for (const dependentId of dependentsByPrereq.get(id) ?? []) {
      visit(dependentId);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const card of cards) {
    visit(card.clientId);
  }
}

export async function importCardHierarchy(
  ctx: ServiceContext,
  input: ImportHierarchyInput,
): Promise<ImportedHierarchy> {
  assertUniqueClientIds(input.cards);
  assertPrerequisitesExist(input.cards);
  assertAcyclicHierarchy(input.cards);

  if (!input.deckId && !input.deckName?.trim()) {
    throw new Error("Either deckId or deckName is required.");
  }

  return ctx.db.transaction(async (tx) => {
    let deck: Deck | undefined;
    if (input.deckId) {
      deck = await tx
        .select()
        .from(schema.decks)
        .where(eq(schema.decks.id, input.deckId))
        .get();
      if (!deck) {
        throw new Error(`Deck not found: ${input.deckId}`);
      }
    } else {
      deck = await tx
        .insert(schema.decks)
        .values({
          name: input.deckName!.trim(),
          description: input.deckDescription ?? null,
        })
        .returning()
        .get();
    }

    const cardsByClientId = new Map<string, Card>();
    const createdCards: Array<Card & { clientId: string }> = [];

    for (const card of input.cards) {
      const created = await tx
        .insert(schema.cards)
        .values({
          deckId: deck.id,
          front: card.front,
          back: card.back,
          type: card.type ?? "basic",
          ...newCardFields(),
        })
        .returning()
        .get();
      cardsByClientId.set(card.clientId, created);
      createdCards.push({ ...created, clientId: card.clientId });
    }

    const edges: ImportedHierarchy["edges"] = [];
    for (const card of input.cards) {
      const dependent = cardsByClientId.get(card.clientId)!;
      for (const prereqClientId of card.prerequisites ?? []) {
        const prereq = cardsByClientId.get(prereqClientId)!;
        await tx
          .insert(schema.cardPrereqs)
          .values({ prereqId: prereq.id, dependentId: dependent.id })
          .onConflictDoNothing()
          .run();
        edges.push({
          prereqClientId,
          dependentClientId: card.clientId,
        });
      }
    }

    return { deck, cards: createdCards, edges };
  });
}

export async function readDeckGraph(ctx: ServiceContext, deckId: string) {
  const deck = await getDeck(ctx, deckId);
  if (!deck) {
    throw new Error(`Deck not found: ${deckId}`);
  }

  return {
    deck,
    graph: await getDeckGraph(ctx, deckId),
  };
}
