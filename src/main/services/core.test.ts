import { describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { schema } from "../db";
import { getOnlyCard, makeContext, securePrereq, useTestDb } from "../test/db";
import * as browse from "./browse";
import * as notes from "./notes";
import * as decks from "./decks";
import * as graph from "./graph";
import * as review from "./review";
import * as settings from "./settings";
import { isPendingSchedule, PENDING_DUE, State } from "./scheduler";

useTestDb();

/** Create a basic note (one card) from front/back shorthand. */
function basic(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  deckId: string,
  front: string,
  back: string,
  tags?: string[],
) {
  return notes.createNote({
    ctx,
    deckId,
    type: "basic",
    content: { front, back },
    tags,
  });
}

describe("core services", () => {
  it("isolates deck data by profile database", async () => {
    const a = await makeContext("profile-a");
    const b = await makeContext("profile-b");

    await decks.createDeck(a, { name: "JavaScript", description: null });

    expect(await decks.listDecks(a)).toHaveLength(1);
    expect(await decks.listDecks(b)).toHaveLength(0);
  });

  it("creates, dedupes, updates, and removes card tags", async () => {
    const ctx = await makeContext("tags");
    const deck = await decks.createDeck(ctx, { name: "TypeScript" });

    const card = await notes.createNote({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "What is unknown?", back: "A safer top type." },
      tags: [" types ", "Types", "", "narrowing"],
    });

    expect(card.tags).toEqual(["narrowing", "types"]);

    const updated = await notes.updateNote(ctx, card.id, {
      tags: ["safety", "Safety"],
    });

    expect(updated?.tags).toEqual(["safety"]);
    expect((await notes.listNotes(ctx, deck.id))[0].tags).toEqual(["safety"]);
  });

  it("excludes locked dependents from the review queue", async () => {
    const ctx = await makeContext("queue");
    const deck = await decks.createDeck(ctx, { name: "Graph" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base answer");
    const dependent = await basic(
      ctx,
      deck.id,
      "Advanced",
      "Depends on foundation",
    );

    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const dependentCard = await getOnlyCard(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard)).toBe(true);
    expect(dependentCard.due).toEqual(PENDING_DUE);

    const queue = await review.getQueue(ctx, deck.id);
    const [stats] = await decks.listDecks(ctx);

    expect(queue.map((item) => item.noteId)).toEqual([prereq.id]);
    expect(stats).toMatchObject({
      total: 2,
      due: 1,
      newCount: 2,
      learning: 0,
      learned: 0,
    });
  });

  it("requires prereq stability floor before unlocking dependents", async () => {
    const ctx = await makeContext("stability-floor");
    const deck = await decks.createDeck(ctx, { name: "Floor" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base");
    const dependent = await basic(ctx, deck.id, "Advanced", "Top");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    await ctx.db
      .update(schema.cards)
      .set({ state: State.Review, stability: 1.2 })
      .where(eq(schema.cards.noteId, prereq.id))
      .run();

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await securePrereq(ctx, prereq.id);
    await graph.activateUnlockedDependents(ctx, prereq.id);

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
    const dependentCard = await getOnlyCard(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard)).toBe(false);
  });

  it("orders due reviews before new cards in the session queue", async () => {
    const ctx = await makeContext("queue-order");
    const deck = await decks.createDeck(ctx, { name: "Order" });
    const reviewNote = await basic(ctx, deck.id, "Review me", "Answer");
    const newNote = await basic(ctx, deck.id, "New card", "Answer");

    const reviewCard = await getOnlyCard(ctx, reviewNote.id);
    await review.rateCard(ctx, reviewCard.id, 3);
    await ctx.db
      .update(schema.cards)
      .set({ due: new Date() })
      .where(eq(schema.cards.id, reviewCard.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    const reviewIndex = queue.findIndex(
      (item) => item.noteId === reviewNote.id,
    );
    const newIndex = queue.findIndex((item) => item.noteId === newNote.id);

    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(newIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeLessThan(newIndex);
  });

  it("caps frontier new cards per day", async () => {
    const ctx = await makeContext("new-cap");
    const deck = await decks.createDeck(ctx, { name: "Cap" });
    await settings.updateSettings(ctx, { newCardsPerDay: 1 });

    await basic(ctx, deck.id, "New 1", "A");
    await basic(ctx, deck.id, "New 2", "B");
    await basic(ctx, deck.id, "New 3", "C");

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue).toHaveLength(1);
  });

  it("prevents graph self-links, duplicates, and cycles", async () => {
    const ctx = await makeContext("graph");
    const deck = await decks.createDeck(ctx, { name: "Cycles" });
    const a = await basic(ctx, deck.id, "A", "A");
    const b = await basic(ctx, deck.id, "B", "B");
    const c = await basic(ctx, deck.id, "C", "C");

    await expect(graph.addPrereq(ctx, a.id, a.id)).rejects.toThrow(
      /own prerequisite/,
    );

    await graph.addPrereq(ctx, a.id, b.id);
    await graph.addPrereq(ctx, a.id, b.id);
    await graph.addPrereq(ctx, b.id, c.id);

    await expect(graph.addPrereq(ctx, c.id, a.id)).rejects.toThrow(/cycle/);

    expect((await graph.getDeckGraph(ctx, deck.id)).edges).toHaveLength(2);
  });

  it("rates a card and appends a review log", async () => {
    const ctx = await makeContext("review");
    const deck = await decks.createDeck(ctx, { name: "Review" });
    const note = await basic(ctx, deck.id, "Prompt", "Answer");
    const card = await getOnlyCard(ctx, note.id);

    await review.rateCard(ctx, card.id, 3);
    const rated = await getOnlyCard(ctx, note.id);
    const logCount = await ctx.db
      .select({ value: count() })
      .from(schema.reviewLogs)
      .get();

    expect(rated.reps).toBeGreaterThan(0);
    expect(rated.lastReview).toBeInstanceOf(Date);
    expect(logCount?.value).toBe(1);
  });

  it("activates dependents when a prereq becomes secured", async () => {
    const ctx = await makeContext("activate");
    const deck = await decks.createDeck(ctx, { name: "Activate" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base");
    const dependent = await basic(ctx, deck.id, "Advanced", "Top");
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    await securePrereq(ctx, prereq.id);
    await graph.activateUnlockedDependents(ctx, prereq.id);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((item) => item.noteId).sort()).toEqual(
      [prereq.id, dependent.id].sort(),
    );
  });

  it("pages browse results with filters, sort, and batched metadata", async () => {
    const ctx = await makeContext("browse-page");
    const alpha = await decks.createDeck(ctx, { name: "Alpha" });
    const beta = await decks.createDeck(ctx, { name: "Beta" });

    const older = await basic(ctx, alpha.id, "Alpha older", "A", ["shared"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await basic(ctx, beta.id, "Beta newer", "B", ["beta-only"]);

    expect(await browse.listAllTagNames(ctx)).toEqual(["beta-only", "shared"]);

    const firstPage = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 1,
      sort: "created-new",
    });
    expect(firstPage.libraryTotal).toBe(2);
    expect(firstPage.filteredTotal).toBe(2);
    expect(firstPage.cards).toHaveLength(1);
    expect(firstPage.cards[0].id).toBe(newer.id);
    expect(firstPage.cards[0].tags).toEqual(["beta-only"]);

    const deckFiltered = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "deck-asc",
      deckId: alpha.id,
    });
    expect(deckFiltered.filteredTotal).toBe(1);
    expect(deckFiltered.cards[0].id).toBe(older.id);
    expect(deckFiltered.cards[0].deckName).toBe("Alpha");

    const tagFiltered = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      tags: ["shared"],
    });
    expect(tagFiltered.filteredTotal).toBe(1);
    expect(tagFiltered.cards[0].id).toBe(older.id);

    const multiTagFiltered = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "front-asc",
      tags: ["shared", "beta-only"],
    });
    expect(multiTagFiltered.filteredTotal).toBe(2);
  });

  it("persists locked state when prerequisites are added", async () => {
    const ctx = await makeContext("persist-locked");
    const deck = await decks.createDeck(ctx, { name: "Locked" });
    const prereq = await basic(ctx, deck.id, "Foundation", "Base");
    const dependent = await basic(ctx, deck.id, "Advanced", "Top");

    expect((await notes.getNote(ctx, dependent.id))?.locked).toBe(false);

    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await notes.getNote(ctx, dependent.id))?.locked).toBe(true);

    await securePrereq(ctx, prereq.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, prereq.id);

    expect((await notes.getNote(ctx, dependent.id))?.locked).toBe(false);
  });
  it("seeds and persists scheduling settings", async () => {
    const ctx = await makeContext("settings");

    expect((await settings.getSettings(ctx)).requestRetention).toBe(0.9);
    expect((await settings.getSettings(ctx)).prereqStabilityFloor).toBe(2);
    expect((await settings.getSettings(ctx)).newCardsPerDay).toBe(10);

    await settings.updateSettings(ctx, {
      requestRetention: 0.86,
      maximumInterval: 1000,
      prereqStabilityFloor: 3,
      newCardsPerDay: 15,
    });

    const saved = await settings.getSettings(ctx);
    expect(saved.requestRetention).toBe(0.86);
    expect(saved.maximumInterval).toBe(1000);
    expect(saved.prereqStabilityFloor).toBe(3);
    expect(saved.newCardsPerDay).toBe(15);
  });
});
