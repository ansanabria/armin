import { eq } from "drizzle-orm";
import type { Deck, Note } from "../main/db/schema";
import { schema } from "../main/db";
import {
  generateReviewItems,
  isCardType,
  serializeContent,
  validateContent,
  type CardType,
} from "../main/services/card-types";
import { getDeck } from "../main/services/decks";
import { getDeckGraph, refreshLockedForDeck } from "../main/services/graph";
import type { ServiceContext } from "../main/services/context";
import { newCardFields } from "../main/services/scheduler";

export type HierarchyCardInput = {
  clientId: string;
  /** Shorthand for basic cards; ignored when `content` is provided. */
  front?: string;
  back?: string;
  type?: string;
  /** Type-specific content. Defaults to `{ front, back }` for basic. */
  content?: unknown;
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
  cards: Array<Note & { clientId: string }>;
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

function resolveTypedContent(card: HierarchyCardInput) {
  const rawType = card.type ?? "basic";
  if (!isCardType(rawType)) {
    throw new Error(`Card "${card.clientId}" has unknown type "${rawType}".`);
  }
  const type: CardType = rawType;
  const raw =
    card.content ?? ({ front: card.front, back: card.back } as unknown);
  const content = validateContent(type, raw);
  return { type, content };
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

  // Validate every card up front so a bad payload fails before any writes.
  const resolved = input.cards.map((card) => ({
    card,
    ...resolveTypedContent(card),
  }));

  return ctx.db
    .transaction(async (tx) => {
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

      const notesByClientId = new Map<string, Note>();
      const createdNotes: Array<Note & { clientId: string }> = [];

      for (const { card, type, content } of resolved) {
        const note = await tx
          .insert(schema.notes)
          .values({
            deckId: deck.id,
            type,
            content: serializeContent(content),
            locked: false,
          })
          .returning()
          .get();

        for (const item of generateReviewItems(type, content)) {
          await tx
            .insert(schema.cards)
            .values({
              noteId: note!.id,
              deckId: deck.id,
              subKey: item.subKey,
              front: item.front,
              back: item.back,
              ...newCardFields(),
            })
            .run();
        }

        notesByClientId.set(card.clientId, note!);
        createdNotes.push({ ...note!, clientId: card.clientId });
      }

      const edges: ImportedHierarchy["edges"] = [];
      for (const card of input.cards) {
        const dependent = notesByClientId.get(card.clientId)!;
        for (const prereqClientId of card.prerequisites ?? []) {
          const prereq = notesByClientId.get(prereqClientId)!;
          await tx
            .insert(schema.notePrereqs)
            .values({ prereqId: prereq.id, dependentId: dependent.id })
            .onConflictDoNothing()
            .run();
          edges.push({
            prereqClientId,
            dependentClientId: card.clientId,
          });
        }
      }

      return { deck, cards: createdNotes, edges };
    })
    .then(async (result) => {
      await refreshLockedForDeck(ctx, result.deck.id);
      return result;
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
