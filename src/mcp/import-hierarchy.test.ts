import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../main/db";
import * as notes from "../main/services/notes";
import * as decks from "../main/services/decks";
import { makeContext, useTestDb } from "../main/test/db";
import { importCardHierarchy, readDeckGraph } from "./import-hierarchy";

useTestDb();

describe("importCardHierarchy", () => {
  it("creates a deck and hierarchy from deckName", async () => {
    const ctx = await makeContext("import-new-deck");
    const result = await importCardHierarchy(ctx, {
      deckName: "TypeScript basics",
      deckDescription: "Foundations to advanced",
      cards: [
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
    expect(result.cards).toHaveLength(2);
    expect(result.edges).toEqual([
      { prereqClientId: "js", dependentClientId: "ts" },
    ]);

    const dependent = result.cards.find((c) => c.clientId === "ts")!;
    const persistedDependent = await notes.getNote(ctx, dependent.id);
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

    const result = await importCardHierarchy(ctx, {
      deckId: deck.id,
      cards: [
        { clientId: "a", front: "A", back: "A" },
        { clientId: "b", front: "B", back: "B", prerequisites: ["a"] },
      ],
    });

    expect(result.deck.id).toBe(deck.id);
    expect(result.cards.every((c) => c.deckId === deck.id)).toBe(true);
  });

  it("rejects duplicate clientIds", async () => {
    const ctx = await makeContext("import-dup");
    await expect(
      importCardHierarchy(ctx, {
        deckName: "Dup",
        cards: [
          { clientId: "x", front: "One", back: "A" },
          { clientId: "x", front: "Two", back: "B" },
        ],
      }),
    ).rejects.toThrow(/Duplicate card clientId/);
  });

  it("rejects missing prerequisite references", async () => {
    const ctx = await makeContext("import-missing");
    await expect(
      importCardHierarchy(ctx, {
        deckName: "Missing",
        cards: [
          {
            clientId: "child",
            front: "Child",
            back: "B",
            prerequisites: ["ghost"],
          },
        ],
      }),
    ).rejects.toThrow(/missing prerequisite/);
  });

  it("rejects cyclic hierarchies", async () => {
    const ctx = await makeContext("import-cycle");
    await expect(
      importCardHierarchy(ctx, {
        deckName: "Cycle",
        cards: [
          { clientId: "a", front: "A", back: "A", prerequisites: ["b"] },
          { clientId: "b", front: "B", back: "B", prerequisites: ["a"] },
        ],
      }),
    ).rejects.toThrow(/cycle/);
  });

  it("imports typed content cards alongside basic shorthand", async () => {
    const ctx = await makeContext("import-typed");
    const result = await importCardHierarchy(ctx, {
      deckName: "Typed",
      cards: [
        { clientId: "plain", front: "F", back: "B" },
        {
          clientId: "gap",
          type: "cloze",
          content: { text: "{{1::a}} and {{2::b}}" },
          prerequisites: ["plain"],
        },
      ],
    });

    const cloze = result.cards.find((card) => card.clientId === "gap")!;
    const clozeCards = await ctx.db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.noteId, cloze.id))
      .all();
    expect(clozeCards.map((card) => card.subKey).sort()).toEqual(["c1", "c2"]);
  });

  it("rejects unknown card types before writing anything", async () => {
    const ctx = await makeContext("import-bad-type");
    await expect(
      importCardHierarchy(ctx, {
        deckName: "Bad",
        cards: [
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

  it("requires a deck identifier", async () => {
    const ctx = await makeContext("import-no-deck");
    await expect(
      importCardHierarchy(ctx, {
        cards: [{ clientId: "a", front: "A", back: "A" }],
      }),
    ).rejects.toThrow(/deckId or deckName/);
  });

  it("rolls back when deckId does not exist", async () => {
    const ctx = await makeContext("import-rollback");
    await expect(
      importCardHierarchy(ctx, {
        deckId: "00000000-0000-0000-0000-000000000000",
        cards: [{ clientId: "a", front: "A", back: "A" }],
      }),
    ).rejects.toThrow(/Deck not found/);

    const deckCount = await ctx.db
      .select({ value: count() })
      .from(schema.decks)
      .get();
    const cardCount = await ctx.db
      .select({ value: count() })
      .from(schema.cards)
      .get();
    expect(deckCount?.value).toBe(0);
    expect(cardCount?.value).toBe(0);
  });
});
