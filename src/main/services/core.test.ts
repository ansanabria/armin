import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { closeDb, getDb, initDb, schema, setDbRootForTests } from "../db";
import { runMigrations } from "../db/migrate";
import type { ServiceContext } from "./context";
import * as browse from "./browse";
import * as cards from "./cards";
import * as decks from "./decks";
import * as graph from "./graph";
import * as review from "./review";
import * as settings from "./settings";
import {
  isPendingSchedule,
  PENDING_DUE,
  State,
} from "./scheduler";

let root: string;

async function makeContext(profileId: string): Promise<ServiceContext> {
  await initDb(profileId);
  await runMigrations(profileId);
  return { profileId, db: getDb(profileId) };
}

async function securePrereq(ctx: ServiceContext, cardId: string) {
  await ctx.db
    .update(schema.cards)
    .set({
      state: State.Review,
      stability: 2.5,
      difficulty: 5,
      scheduledDays: 3,
      due: new Date(),
      lastReview: new Date(),
      reps: 2,
    })
    .where(eq(schema.cards.id, cardId))
    .run();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-test-"));
  setDbRootForTests(root);
});

afterEach(() => {
  closeDb();
  setDbRootForTests(null);
  fs.rmSync(root, { recursive: true, force: true });
});

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

    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "What is unknown?",
      back: "A safer top type.",
      tags: [" types ", "Types", "", "narrowing"],
    });

    expect(card.tags).toEqual(["narrowing", "types"]);

    const updated = await cards.updateCard(ctx, card.id, {
      tags: ["safety", "Safety"],
    });

    expect(updated?.tags).toEqual(["safety"]);
    expect((await cards.listCards(ctx, deck.id))[0].tags).toEqual(["safety"]);
  });

  it("excludes locked dependents from the review queue", async () => {
    const ctx = await makeContext("queue");
    const deck = await decks.createDeck(ctx, { name: "Graph" });
    const prereq = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Foundation",
      back: "Base answer",
    });
    const dependent = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Advanced",
      back: "Depends on foundation",
    });

    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const dependentCard = await cards.getCard(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard!)).toBe(true);
    expect(dependentCard?.due).toEqual(PENDING_DUE);

    const queue = await review.getQueue(ctx, deck.id);
    const [stats] = await decks.listDecks(ctx);

    expect(queue.map((card) => card.id)).toEqual([prereq.id]);
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
    const prereq = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Foundation",
      back: "Base",
    });
    const dependent = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Advanced",
      back: "Top",
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    await ctx.db
      .update(schema.cards)
      .set({ state: State.Review, stability: 1.2 })
      .where(eq(schema.cards.id, prereq.id))
      .run();

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await securePrereq(ctx, prereq.id);
    await graph.activateUnlockedDependents(ctx, prereq.id);

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
    const dependentCard = await cards.getCard(ctx, dependent.id);
    expect(isPendingSchedule(dependentCard!)).toBe(false);
  });

  it("orders due reviews before new cards in the session queue", async () => {
    const ctx = await makeContext("queue-order");
    const deck = await decks.createDeck(ctx, { name: "Order" });
    const reviewCard = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Review me",
      back: "Answer",
    });
    const newCard = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "New card",
      back: "Answer",
    });

    await review.rateCard(ctx, reviewCard.id, 3);
    await ctx.db
      .update(schema.cards)
      .set({ due: new Date() })
      .where(eq(schema.cards.id, reviewCard.id))
      .run();

    const queue = await review.getQueue(ctx, deck.id);
    const reviewIndex = queue.findIndex((card) => card.id === reviewCard.id);
    const newIndex = queue.findIndex((card) => card.id === newCard.id);

    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(newIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeLessThan(newIndex);
  });

  it("caps frontier new cards per day", async () => {
    const ctx = await makeContext("new-cap");
    const deck = await decks.createDeck(ctx, { name: "Cap" });
    await settings.updateSettings(ctx, { newCardsPerDay: 1 });

    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "New 1",
      back: "A",
    });
    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "New 2",
      back: "B",
    });
    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "New 3",
      back: "C",
    });

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].state).toBe(State.New);
  });

  it("prevents graph self-links, duplicates, and cycles", async () => {
    const ctx = await makeContext("graph");
    const deck = await decks.createDeck(ctx, { name: "Cycles" });
    const a = await cards.createCard({ ctx, deckId: deck.id, front: "A", back: "A" });
    const b = await cards.createCard({ ctx, deckId: deck.id, front: "B", back: "B" });
    const c = await cards.createCard({ ctx, deckId: deck.id, front: "C", back: "C" });

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
    const card = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Prompt",
      back: "Answer",
    });

    const rated = await review.rateCard(ctx, card.id, 3);
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
    const prereq = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Foundation",
      back: "Base",
    });
    const dependent = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Advanced",
      back: "Top",
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    await securePrereq(ctx, prereq.id);
    await graph.activateUnlockedDependents(ctx, prereq.id);

    const queue = await review.getQueue(ctx, deck.id);
    expect(queue.map((card) => card.id).sort()).toEqual(
      [prereq.id, dependent.id].sort(),
    );
  });

  it("pages browse results with filters, sort, and batched metadata", async () => {
    const ctx = await makeContext("browse-page");
    const alpha = await decks.createDeck(ctx, { name: "Alpha" });
    const beta = await decks.createDeck(ctx, { name: "Beta" });

    const older = await cards.createCard({
      ctx,
      deckId: alpha.id,
      front: "Alpha older",
      back: "A",
      tags: ["shared"],
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await cards.createCard({
      ctx,
      deckId: beta.id,
      front: "Beta newer",
      back: "B",
      tags: ["beta-only"],
    });

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
      tag: "shared",
    });
    expect(tagFiltered.filteredTotal).toBe(1);
    expect(tagFiltered.cards[0].id).toBe(older.id);
  });

  it("lists deck tag names without loading all cards", async () => {
    const ctx = await makeContext("deck-tags");
    const deck = await decks.createDeck(ctx, { name: "Tagged" });
    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "One",
      back: "A",
      tags: ["alpha", "shared"],
    });
    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Two",
      back: "B",
      tags: ["beta", "shared"],
    });

    expect(await browse.listDeckTagNames(ctx, deck.id)).toEqual([
      "alpha",
      "beta",
      "shared",
    ]);
  });

  it("pages deck-scoped browse results with sort and tag filter", async () => {
    const ctx = await makeContext("deck-browse");
    const deck = await decks.createDeck(ctx, { name: "Paged" });
    const tagged = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Tagged card",
      back: "A",
      tags: ["focus"],
    });
    await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Other card",
      back: "B",
    });

    const firstPage = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 1,
      sort: "front-asc",
      deckId: deck.id,
    });
    expect(firstPage.filteredTotal).toBe(2);
    expect(firstPage.cards).toHaveLength(1);
    expect(firstPage.cards[0].deckName).toBe("Paged");

    const tagFiltered = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 10,
      sort: "front-asc",
      deckId: deck.id,
      tag: "focus",
    });
    expect(tagFiltered.filteredTotal).toBe(1);
    expect(tagFiltered.cards[0].id).toBe(tagged.id);
    expect(tagFiltered.cards[0].tags).toEqual(["focus"]);
  });

  it("buildSessionQueue uses batched unlock lookup", async () => {
    const ctx = await makeContext("batch-unlock");
    const deck = await decks.createDeck(ctx, { name: "Batch" });
    const cardsInDeck = [];
    for (let i = 0; i < 5; i++) {
      cardsInDeck.push(
        await cards.createCard({
          ctx,
          deckId: deck.id,
          front: `Card ${i + 1}`,
          back: "Answer",
        }),
      );
    }
    const prereq = cardsInDeck[0];
    const dependent = cardsInDeck[4];
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const deckRows = await ctx.db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.deckId, deck.id))
      .all();
    const queue = await review.buildSessionQueue(ctx, deckRows, deck.id);
    expect(queue.map((card) => card.id)).not.toContain(dependent.id);
    expect(queue.length).toBeGreaterThan(0);
  });

  it("persists locked state when prerequisites are added", async () => {
    const ctx = await makeContext("persist-locked");
    const deck = await decks.createDeck(ctx, { name: "Locked" });
    const prereq = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Foundation",
      back: "Base",
    });
    const dependent = await cards.createCard({
      ctx,
      deckId: deck.id,
      front: "Advanced",
      back: "Top",
    });

    expect((await cards.getCard(ctx, dependent.id))?.locked).toBe(false);

    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect((await cards.getCard(ctx, dependent.id))?.locked).toBe(true);

    await securePrereq(ctx, prereq.id);
    await graph.refreshLockedAfterPrereqSecured(ctx, prereq.id);

    expect((await cards.getCard(ctx, dependent.id))?.locked).toBe(false);
  });

  it("pages due-soon browse results without loading the full deck", async () => {
    const ctx = await makeContext("due-soon-page");
    const deck = await decks.createDeck(ctx, { name: "Due sort" });

    for (let i = 0; i < 120; i++) {
      await cards.createCard({
        ctx,
        deckId: deck.id,
        front: `Card ${String(i).padStart(3, "0")}`,
        back: "Answer",
      });
    }

    const page = await browse.listBrowsePage(ctx, {
      offset: 0,
      limit: 30,
      sort: "due-soon",
      deckId: deck.id,
    });

    expect(page.filteredTotal).toBe(120);
    expect(page.cards).toHaveLength(30);
    expect(page.cards.every((card) => card.deckId === deck.id)).toBe(true);
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
