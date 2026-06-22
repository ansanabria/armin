import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { countReviewLogs, makeContext, useTestDb } from "../test/db";
import { schema } from "../db";
import * as cram from "./cram";
import * as decks from "./decks";
import * as flashcards from "./flashcards";
import * as graph from "./graph";
import { State } from "./scheduler";

useTestDb();

type Ctx = Awaited<ReturnType<typeof makeContext>>;

function basic(
  ctx: Ctx,
  deckId: string,
  front: string,
  back: string,
  tags?: string[],
) {
  return flashcards.createFlashcard({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
    tags,
  });
}

function poolFlashcardIds(pool: Awaited<ReturnType<typeof cram.getCramPool>>) {
  return new Set(pool.flashcards.map((group) => group.flashcardId));
}

describe("cram scope resolution", () => {
  it("collects cards by tag across decks", async () => {
    const ctx = await makeContext("cram-tag");
    const algebra = await decks.createDeck(ctx, { name: "Algebra" });
    const calculus = await decks.createDeck(ctx, { name: "Calculus" });
    const a = await basic(ctx, algebra.id, "A", "a", ["exam"]);
    const b = await basic(ctx, calculus.id, "B", "b", ["exam"]);
    await basic(ctx, calculus.id, "C", "c", ["other"]);

    const ids = await cram.resolveCramScope(ctx, { tags: ["exam"] });
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
  });

  it("collects cards across multiple decks", async () => {
    const ctx = await makeContext("cram-multi-deck");
    const d1 = await decks.createDeck(ctx, { name: "One" });
    const d2 = await decks.createDeck(ctx, { name: "Two" });
    const d3 = await decks.createDeck(ctx, { name: "Three" });
    const a = await basic(ctx, d1.id, "A", "a");
    const b = await basic(ctx, d2.id, "B", "b");
    await basic(ctx, d3.id, "C", "c");

    const ids = await cram.resolveCramScope(ctx, { deckIds: [d1.id, d2.id] });
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
  });

  it("intersection requires both deck and tag; union accepts either", async () => {
    const ctx = await makeContext("cram-combine");
    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });
    const inAWithTag = await basic(ctx, deckA.id, "A-tag", "x", ["exam"]);
    const inANoTag = await basic(ctx, deckA.id, "A-plain", "x");
    const inBWithTag = await basic(ctx, deckB.id, "B-tag", "x", ["exam"]);

    const intersection = await cram.resolveCramScope(ctx, {
      deckIds: [deckA.id],
      tags: ["exam"],
      combine: "intersection",
    });
    expect(new Set(intersection)).toEqual(new Set([inAWithTag.id]));

    const union = await cram.resolveCramScope(ctx, {
      deckIds: [deckA.id],
      tags: ["exam"],
      combine: "union",
    });
    expect(new Set(union)).toEqual(
      new Set([inAWithTag.id, inANoTag.id, inBWithTag.id]),
    );
  });

  it("excludes archived cards regardless of operator", async () => {
    const ctx = await makeContext("cram-archived");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const live = await basic(ctx, deck.id, "Live", "x", ["exam"]);
    const archived = await basic(ctx, deck.id, "Archived", "x", ["exam"]);
    await flashcards.setArchived(ctx, archived.id, true);

    const byDeck = await cram.resolveCramScope(ctx, { deckIds: [deck.id] });
    expect(new Set(byDeck)).toEqual(new Set([live.id]));

    const byTag = await cram.resolveCramScope(ctx, { tags: ["exam"] });
    expect(new Set(byTag)).toEqual(new Set([live.id]));
  });
});

describe("cram pool", () => {
  it("includes locked and brand-new cards", async () => {
    const ctx = await makeContext("cram-locked-new");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const prereq = await basic(ctx, deck.id, "Prereq", "p");
    const dependent = await basic(ctx, deck.id, "Dependent", "d");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    // The dependent is Locked (prereq not secured), both are brand-new.
    const dependentUnit = ctx.db
      .select()
      .from(schema.flashcards)
      .where(eq(schema.flashcards.id, dependent.id))
      .get();
    expect(dependentUnit?.locked).toBe(true);

    const pool = await cram.getCramPool(ctx, { deckIds: [deck.id] });
    expect(poolFlashcardIds(pool)).toEqual(new Set([prereq.id, dependent.id]));
    // Brand-new state is fine — cram ignores FSRS scheduling state.
    const states = ctx.db
      .select({ state: schema.reviewUnits.state })
      .from(schema.reviewUnits)
      .all();
    expect(states.every((row) => row.state === State.New)).toBe(true);
  });

  it("returns only prerequisite edges internal to the scope", async () => {
    const ctx = await makeContext("cram-edges");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const outside = await basic(ctx, deck.id, "Outside", "o", ["foundation"]);
    const inScopePrereq = await basic(ctx, deck.id, "InPrereq", "i", ["topic"]);
    const dependent = await basic(ctx, deck.id, "Dependent", "d", ["topic"]);
    // dependent depends on both an in-scope and an out-of-scope prereq.
    await graph.addPrereq(ctx, inScopePrereq.id, dependent.id);
    await graph.addPrereq(ctx, outside.id, dependent.id);

    const pool = await cram.getCramPool(ctx, { tags: ["topic"] });
    expect(poolFlashcardIds(pool)).toEqual(
      new Set([inScopePrereq.id, dependent.id]),
    );
    // The edge from the out-of-scope prereq is dropped; only the in-scope one remains.
    expect(pool.edges).toEqual([
      { prereqId: inScopePrereq.id, dependentId: dependent.id },
    ]);
  });

  it("groups every review unit a flashcard generates", async () => {
    const ctx = await makeContext("cram-groups");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    const reversed = await flashcards.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic_reversed",
      content: { front: "F", back: "B" },
    });

    const pool = await cram.getCramPool(ctx, { deckIds: [deck.id] });
    const group = pool.flashcards.find((g) => g.flashcardId === reversed.id);
    expect(group?.reviewUnitIds.length).toBe(2);
    expect(pool.units.length).toBe(2);
  });

  it("is read-only: building a pool does not mutate scheduling state", async () => {
    const ctx = await makeContext("cram-readonly");
    const deck = await decks.createDeck(ctx, { name: "Deck" });
    await basic(ctx, deck.id, "A", "a");
    await basic(ctx, deck.id, "B", "b");

    const before = ctx.db.select().from(schema.reviewUnits).all();
    await cram.getCramPool(ctx, { deckIds: [deck.id] });
    const after = ctx.db.select().from(schema.reviewUnits).all();

    expect(after).toEqual(before);
    expect(await countReviewLogs(ctx)).toBe(0);
  });
});
