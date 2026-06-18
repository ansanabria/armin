import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../main/db";
import * as notes from "../main/services/flashcards";
import * as decks from "../main/services/decks";
import { makeContext, useTestDb } from "../main/test/db";
import { importFlashcardHierarchy, readDeckGraph } from "./import-hierarchy";

useTestDb();

describe("importFlashcardHierarchy", () => {
  it("creates a deck and hierarchy from deckName", async () => {
    const ctx = await makeContext("import-new-deck");
    const result = await importFlashcardHierarchy(ctx, {
      deckName: "TypeScript basics",
      deckDescription: "Foundations to advanced",
      flashcards: [
        { clientId: "js", front: "JS values", back: "Primitives and objects" },
        {
          clientId: "ts",
          front: "TS types",
          back: "Static typing",
          prerequisites: ["js"],
        },
      ],
    });

    expect(result.deck.name).toBe("TypeScript basics");
    expect(result.flashcards).toHaveLength(2);
    expect(result.edges).toEqual([
      { prereqClientId: "js", dependentClientId: "ts" },
    ]);

    const dependent = result.flashcards.find((c) => c.clientId === "ts")!;
    const persistedDependent = await notes.getFlashcard(ctx, dependent.id);
    expect(persistedDependent?.locked).toBe(true);

    const graph = await readDeckGraph(ctx, result.deck.id);
    expect(graph.graph.edges).toHaveLength(1);
    expect(graph.graph.nodes).toHaveLength(2);
    const lockedNode = graph.graph.nodes.find((n) => n.id === dependent.id);
    expect(lockedNode?.locked).toBe(true);
  });

  it("imports into an existing deck by deckId", async () => {
    const ctx = await makeContext("import-existing-deck");
    const deck = await decks.createDeck(ctx, {
      name: "Existing",
      description: null,
    });

    const result = await importFlashcardHierarchy(ctx, {
      deckId: deck.id,
      flashcards: [
        { clientId: "a", front: "A", back: "A" },
        { clientId: "b", front: "B", back: "B", prerequisites: ["a"] },
      ],
    });

    expect(result.deck.id).toBe(deck.id);
    expect(result.flashcards.every((c) => c.deckId === deck.id)).toBe(true);
  });

  it("rejects cyclic hierarchies", async () => {
    const ctx = await makeContext("import-cycle");
    await expect(
      importFlashcardHierarchy(ctx, {
        deckName: "Cycle",
        flashcards: [
          { clientId: "a", front: "A", back: "A", prerequisites: ["b"] },
          { clientId: "b", front: "B", back: "B", prerequisites: ["a"] },
        ],
      }),
    ).rejects.toThrow(/cycle/);
  });

  it("imports typed content cards alongside basic shorthand", async () => {
    const ctx = await makeContext("import-typed");
    const result = await importFlashcardHierarchy(ctx, {
      deckName: "Typed",
      flashcards: [
        { clientId: "plain", front: "F", back: "B" },
        {
          clientId: "gap",
          type: "cloze",
          content: { text: "{{1::a}} and {{2::b}}" },
          prerequisites: ["plain"],
        },
      ],
    });

    const cloze = result.flashcards.find((card) => card.clientId === "gap")!;
    const clozeCards = await ctx.db
      .select()
      .from(schema.reviewUnits)
      .where(eq(schema.reviewUnits.flashcardId, cloze.id))
      .all();
    expect(clozeCards.map((card) => card.subKey).sort()).toEqual(["c1", "c2"]);
  });

  it("rejects unknown card types before writing anything", async () => {
    const ctx = await makeContext("import-bad-type");
    await expect(
      importFlashcardHierarchy(ctx, {
        deckName: "Bad",
        flashcards: [
          { clientId: "ok", front: "F", back: "B" },
          { clientId: "bad", type: "mystery", content: {} },
        ],
      }),
    ).rejects.toThrow(/unknown type/);

    const deckCount = await ctx.db
      .select({ value: count() })
      .from(schema.decks)
      .get();
    expect(deckCount?.value).toBe(0);
  });
});
