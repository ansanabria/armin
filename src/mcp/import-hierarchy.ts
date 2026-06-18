import { eq } from "drizzle-orm";
import type { Deck, Flashcard } from "../main/db/schema";
import { schema } from "../main/db";
import {
  isFlashcardType,
  type FlashcardType,
} from "../main/services/flashcard-types";
import { getDeck } from "../main/services/decks";
import { getDeckGraph, refreshLockedForDeck } from "../main/services/graph";
import type { ServiceContext } from "../main/services/context";
import { createFlashcardRecord } from "../main/services/flashcards";

export type HierarchyFlashcardInput = {
  clientId: string;
  /** Shorthand for basic flashcards; ignored when `content` is provided. */
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
  flashcards: HierarchyFlashcardInput[];
};

export type ImportedHierarchy = {
  deck: Deck;
  flashcards: Array<Flashcard & { clientId: string }>;
  edges: { prereqClientId: string; dependentClientId: string }[];
};

function assertUniqueClientIds(flashcards: HierarchyFlashcardInput[]) {
  const seen = new Set<string>();
  for (const flashcard of flashcards) {
    if (seen.has(flashcard.clientId)) {
      throw new Error(`Duplicate flashcard clientId: ${flashcard.clientId}`);
    }
    seen.add(flashcard.clientId);
  }
}

function assertPrerequisitesExist(flashcards: HierarchyFlashcardInput[]) {
  const ids = new Set(flashcards.map((flashcard) => flashcard.clientId));
  for (const flashcard of flashcards) {
    for (const prereqId of flashcard.prerequisites ?? []) {
      if (!ids.has(prereqId)) {
        throw new Error(
          `Flashcard "${flashcard.clientId}" references missing prerequisite "${prereqId}".`,
        );
      }
    }
  }
}

function assertAcyclicHierarchy(flashcards: HierarchyFlashcardInput[]) {
  const dependentsByPrereq = new Map<string, string[]>();
  for (const flashcard of flashcards) {
    for (const prereqId of flashcard.prerequisites ?? []) {
      const dependents = dependentsByPrereq.get(prereqId) ?? [];
      dependents.push(flashcard.clientId);
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

  for (const flashcard of flashcards) {
    visit(flashcard.clientId);
  }
}

function resolveTypedContent(flashcard: HierarchyFlashcardInput) {
  const rawType = flashcard.type ?? "basic";
  if (!isFlashcardType(rawType)) {
    throw new Error(
      `Flashcard "${flashcard.clientId}" has unknown type "${rawType}".`,
    );
  }
  const type: FlashcardType = rawType;
  const content = flashcard.content ?? {
    front: flashcard.front,
    back: flashcard.back,
  };
  return { type, content };
}

export async function importFlashcardHierarchy(
  ctx: ServiceContext,
  input: ImportHierarchyInput,
): Promise<ImportedHierarchy> {
  assertUniqueClientIds(input.flashcards);
  assertPrerequisitesExist(input.flashcards);
  assertAcyclicHierarchy(input.flashcards);

  if (!input.deckId && !input.deckName?.trim()) {
    throw new Error("Either deckId or deckName is required.");
  }

  // Validate every flashcard up front so a bad payload fails before any writes.
  const resolved = input.flashcards.map((flashcard) => ({
    flashcard,
    ...resolveTypedContent(flashcard),
  }));

  const result = ctx.db.transaction((tx) => {
    let deck: Deck | undefined;
    if (input.deckId) {
      deck = tx
        .select()
        .from(schema.decks)
        .where(eq(schema.decks.id, input.deckId))
        .get();
      if (!deck) {
        throw new Error(`Deck not found: ${input.deckId}`);
      }
    } else {
      deck = tx
        .insert(schema.decks)
        .values({
          name: input.deckName!.trim(),
          description: input.deckDescription ?? null,
        })
        .returning()
        .get();
    }

    const flashcardsByClientId = new Map<string, Flashcard>();
    const createdFlashcards: Array<Flashcard & { clientId: string }> = [];

    for (const { flashcard, type, content } of resolved) {
      const created = createFlashcardRecord(tx, {
        deckId: deck.id,
        type,
        content,
      });

      flashcardsByClientId.set(flashcard.clientId, created);
      createdFlashcards.push({ ...created, clientId: flashcard.clientId });
    }

    const edges: ImportedHierarchy["edges"] = [];
    for (const flashcard of input.flashcards) {
      const dependent = flashcardsByClientId.get(flashcard.clientId)!;
      for (const prereqClientId of flashcard.prerequisites ?? []) {
        const prereq = flashcardsByClientId.get(prereqClientId)!;
        tx.insert(schema.flashcardPrereqs)
          .values({ prereqId: prereq.id, dependentId: dependent.id })
          .onConflictDoNothing()
          .run();
        edges.push({
          prereqClientId,
          dependentClientId: flashcard.clientId,
        });
      }
    }

    return { deck, flashcards: createdFlashcards, edges };
  });

  await refreshLockedForDeck(ctx, result.deck.id);
  return result;
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
