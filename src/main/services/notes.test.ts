import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { Rating } from "ts-fsrs";
import { schema } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as graph from "./graph";
import * as notes from "./flashcards";
import * as review from "./review";
import { State } from "./scheduler";

useTestDb();

function cardsForNote(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  flashcardId: string,
) {
  return ctx.db
    .select()
    .from(schema.reviewUnits)
    .where(eq(schema.reviewUnits.flashcardId, flashcardId))
    .orderBy(asc(schema.reviewUnits.subKey))
    .all();
}

async function secureCard(
  ctx: Awaited<ReturnType<typeof makeContext>>,
  reviewUnitId: string,
) {
  await ctx.db
    .update(schema.reviewUnits)
    .set({
      state: State.Review,
      stability: 2.5,
      reps: 2,
      lastReview: new Date(),
      due: new Date(),
    })
    .where(eq(schema.reviewUnits.id, reviewUnitId))
    .run();
}

describe("note → card generation", () => {
  it("generates forward and reverse cards for basic_reversed", async () => {
    const ctx = await makeContext("gen-reversed");
    const deck = await decks.createDeck(ctx, { name: "R" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic_reversed",
      content: { front: "F", back: "B" },
    });

    const cards = await cardsForNote(ctx, note.id);
    expect(cards.map((c) => c.subKey)).toEqual(["", "rev"]);
    expect(cards.find((c) => c.subKey === "")?.front).toBe("F");
    expect(cards.find((c) => c.subKey === "rev")?.front).toBe("B");
  });

  it("generates one card per cloze cluster", async () => {
    const ctx = await makeContext("gen-cloze");
    const deck = await decks.createDeck(ctx, { name: "C" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "cloze",
      content: { text: "{{1::a}} and {{2::b}}" },
    });

    const cards = await cardsForNote(ctx, note.id);
    expect(cards.map((c) => c.subKey)).toEqual(["c1", "c2"]);
  });
});

describe("updateFlashcard reconciliation", () => {
  it("preserves FSRS state for unchanged sub-keys and adds new ones", async () => {
    const ctx = await makeContext("reconcile");
    const deck = await decks.createDeck(ctx, { name: "Edit" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "cloze",
      content: { text: "{{1::a}} and {{2::b}}" },
    });

    const c1 = (await cardsForNote(ctx, note.id)).find(
      (c) => c.subKey === "c1",
    )!;
    await secureCard(ctx, c1.id);

    // Add a third cluster; c1 and c2 keep their identities.
    await notes.updateFlashcard(ctx, note.id, {
      content: { text: "{{1::a}} and {{2::b}} and {{3::c}}" },
    });

    const after = await cardsForNote(ctx, note.id);
    expect(after.map((c) => c.subKey)).toEqual(["c1", "c2", "c3"]);

    const c1After = after.find((c) => c.subKey === "c1")!;
    expect(c1After.id).toBe(c1.id);
    expect(c1After.reps).toBe(2);
    expect(c1After.state).toBe(State.Review);

    const c3 = after.find((c) => c.subKey === "c3")!;
    expect(c3.reps).toBe(0);
    expect(c3.state).toBe(State.New);
  });

  it("deletes cards whose sub-keys disappear", async () => {
    const ctx = await makeContext("reconcile-delete");
    const deck = await decks.createDeck(ctx, { name: "Shrink" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "cloze",
      content: { text: "{{1::a}} and {{2::b}}" },
    });
    expect(await cardsForNote(ctx, note.id)).toHaveLength(2);

    await notes.updateFlashcard(ctx, note.id, {
      content: { text: "{{1::a}} only" },
    });

    const after = await cardsForNote(ctx, note.id);
    expect(after.map((c) => c.subKey)).toEqual(["c1"]);
  });

  it("preserves image occlusion mask history across mask add and remove", async () => {
    const ctx = await makeContext("reconcile-image-occlusion");
    const deck = await decks.createDeck(ctx, { name: "Images" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "image_occlusion",
      content: {
        baseImage: "data:image/png;base64,AAAA",
        revealMode: "hide_one",
        masks: [
          { id: "m1", geometry: { x: 0, y: 0, w: 0.4, h: 0.4 }, label: "One" },
          { id: "m2", geometry: { x: 0.5, y: 0, w: 0.4, h: 0.4 }, label: "Two" },
        ],
      },
    });

    const m1 = (await cardsForNote(ctx, note.id)).find(
      (c) => c.subKey === "m1",
    )!;
    await secureCard(ctx, m1.id);

    await notes.updateFlashcard(ctx, note.id, {
      content: {
        baseImage: "data:image/png;base64,BBBB",
        revealMode: "hide_all",
        masks: [
          { id: "m1", geometry: { x: 0.1, y: 0, w: 0.4, h: 0.4 }, label: "One" },
          { id: "m3", geometry: { x: 0.5, y: 0, w: 0.4, h: 0.4 }, label: "Three" },
        ],
      },
    });

    const after = await cardsForNote(ctx, note.id);
    expect(after.map((c) => c.subKey)).toEqual(["m1", "m3"]);
    const m1After = after.find((c) => c.subKey === "m1")!;
    const m3After = after.find((c) => c.subKey === "m3")!;
    expect(m1After.id).toBe(m1.id);
    expect(m1After.reps).toBe(2);
    expect(m1After.state).toBe(State.Review);
    expect(m3After.reps).toBe(0);
    expect(m3After.state).toBe(State.New);
  });

  it("preserves forward history when converting basic to basic_reversed and back", async () => {
    const ctx = await makeContext("reconcile-basic-reversed");
    const deck = await decks.createDeck(ctx, { name: "Convert" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "F", back: "B" },
    });

    const [forward] = await cardsForNote(ctx, note.id);
    await review.rateReviewUnit(ctx, forward.id, Rating.Good);
    const reviewedForward = (await cardsForNote(ctx, note.id))[0];
    const logsBefore = await ctx.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.reviewUnitId, forward.id))
      .all();

    await notes.updateFlashcard(ctx, note.id, {
      type: "basic_reversed",
      content: { front: "F", back: "B" },
    });

    const reversed = await cardsForNote(ctx, note.id);
    expect(reversed.map((c) => c.subKey)).toEqual(["", "rev"]);
    const forwardAfterAdd = reversed.find((c) => c.subKey === "")!;
    const reverseAfterAdd = reversed.find((c) => c.subKey === "rev")!;
    expect(forwardAfterAdd.id).toBe(forward.id);
    expect(forwardAfterAdd.reps).toBe(reviewedForward.reps);
    expect(forwardAfterAdd.state).toBe(reviewedForward.state);
    expect(reverseAfterAdd.reps).toBe(0);
    expect(reverseAfterAdd.state).toBe(State.New);

    const logsAfterAdd = await ctx.db
      .select()
      .from(schema.reviewLogs)
      .where(eq(schema.reviewLogs.reviewUnitId, forward.id))
      .all();
    expect(logsAfterAdd).toHaveLength(logsBefore.length);

    await notes.updateFlashcard(ctx, note.id, {
      type: "basic",
      content: { front: "F", back: "B" },
    });

    const basicAgain = await cardsForNote(ctx, note.id);
    expect(basicAgain.map((c) => c.subKey)).toEqual([""]);
    expect(basicAgain[0].id).toBe(forward.id);
    expect(basicAgain[0].reps).toBe(reviewedForward.reps);
    expect(basicAgain[0].state).toBe(reviewedForward.state);
    expect(basicAgain.some((c) => c.id === reverseAfterAdd.id)).toBe(false);
  });
});

describe("deleteFlashcard", () => {
  it("removes the note, its generated cards, and tag links", async () => {
    const ctx = await makeContext("delete-note");
    const deck = await decks.createDeck(ctx, { name: "Delete" });
    const note = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic_reversed",
      content: { front: "F", back: "B" },
      tags: ["doomed"],
    });
    expect(await cardsForNote(ctx, note.id)).toHaveLength(2);

    await notes.deleteFlashcard(ctx, note.id);

    expect(await notes.getFlashcard(ctx, note.id)).toBeUndefined();
    expect(await cardsForNote(ctx, note.id)).toHaveLength(0);
    const tagLinks = await ctx.db
      .select()
      .from(schema.flashcardTags)
      .where(eq(schema.flashcardTags.flashcardId, note.id))
      .all();
    expect(tagLinks).toHaveLength(0);
  });

  it("unlocks dependents when their only prerequisite is deleted", async () => {
    const ctx = await makeContext("delete-prereq");
    const deck = await decks.createDeck(ctx, { name: "Orphan" });
    const prereq = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "P", back: "P" },
    });
    const dependent = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "D", back: "D" },
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);
    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);

    await notes.deleteFlashcard(ctx, prereq.id);

    const after = await notes.getFlashcard(ctx, dependent.id);
    expect(after?.locked).toBe(false);
    const [dependentCard] = await cardsForNote(ctx, dependent.id);
    expect(dependentCard.locked).toBe(false);
    expect(dependentCard.state).toBe(State.New);
    // Re-enters the schedulable frontier instead of staying pending forever.
    expect(dependentCard.due.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("keeps dependents locked while another unsecured prerequisite remains", async () => {
    const ctx = await makeContext("delete-one-prereq");
    const deck = await decks.createDeck(ctx, { name: "Partial" });
    const prereqA = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "A", back: "A" },
    });
    const prereqB = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "B", back: "B" },
    });
    const dependent = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "D", back: "D" },
    });
    await graph.addPrereq(ctx, prereqA.id, dependent.id);
    await graph.addPrereq(ctx, prereqB.id, dependent.id);

    await notes.deleteFlashcard(ctx, prereqA.id);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(true);

    const [bCard] = await cardsForNote(ctx, prereqB.id);
    await secureCard(ctx, bCard.id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, prereqB.id);

    expect((await notes.getFlashcard(ctx, dependent.id))?.locked).toBe(false);
  });
});

describe("note-level securing", () => {
  it("unlocks a dependent only when every prereq card is secured", async () => {
    const ctx = await makeContext("all-secured");
    const deck = await decks.createDeck(ctx, { name: "Secure" });
    // A reversed prereq has two cards; both must be secured.
    const prereq = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic_reversed",
      content: { front: "F", back: "B" },
    });
    const dependent = await notes.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "D", back: "D" },
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    const prereqCards = await cardsForNote(ctx, prereq.id);
    await secureCard(ctx, prereqCards[0].id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, prereq.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(false);

    await secureCard(ctx, prereqCards[1].id);
    await graph.refreshAfterPrerequisiteStateChange(ctx, prereq.id);
    expect(await graph.isUnlocked(ctx, dependent.id)).toBe(true);
  });
});
