import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { count, eq } from "drizzle-orm";
import { closeDb, schema, setDbRootForTests } from "../db";
import { ensureProfileReady, resetProfileRuntime } from "../profiles/runtime";
import type { ServiceContext } from "../services/context";
import { State } from "../services/scheduler";

let root: string;

export async function makeContext(profileId: string): Promise<ServiceContext> {
  return ensureProfileReady(profileId);
}

/**
 * Mark a flashcard's prerequisite as secured: every generated review unit moves
 * into FSRS Review state above the stability floor.
 */
export async function securePrereq(ctx: ServiceContext, flashcardId: string) {
  ctx.db
    .update(schema.reviewUnits)
    .set({
      state: State.Review,
      stability: 2.5,
      difficulty: 5,
      scheduledDays: 3,
      due: new Date(),
      lastReview: new Date(),
      reps: 2,
    })
    .where(eq(schema.reviewUnits.flashcardId, flashcardId))
    .run();
}

/** Mark one Review unit as secured for tests that need stable history state. */
export async function secureReviewUnit(
  ctx: ServiceContext,
  reviewUnitId: string,
) {
  ctx.db
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

/**
 * Mark a prerequisite flashcard as reviewed but still below the stability floor
 * a dependent flashcard requires.
 */
export async function markPrereqBelowStabilityFloor(
  ctx: ServiceContext,
  flashcardId: string,
  stability: number,
) {
  ctx.db
    .update(schema.reviewUnits)
    .set({ state: State.Review, stability })
    .where(eq(schema.reviewUnits.flashcardId, flashcardId))
    .run();
}

/** Force a review unit to be due at a known time. */
export async function makeReviewUnitDue(
  ctx: ServiceContext,
  reviewUnitId: string,
  due = new Date(),
) {
  ctx.db
    .update(schema.reviewUnits)
    .set({ due })
    .where(eq(schema.reviewUnits.id, reviewUnitId))
    .run();
}

/** Force a review unit into Learning state and make it due at a known time. */
export async function makeReviewUnitLearningDue(
  ctx: ServiceContext,
  reviewUnitId: string,
  due = new Date(),
) {
  ctx.db
    .update(schema.reviewUnits)
    .set({ due, state: State.Learning })
    .where(eq(schema.reviewUnits.id, reviewUnitId))
    .run();
}

/**
 * Write the removed per-Deck Frontier override to simulate older persisted data.
 * Current service operations intentionally no longer expose this setting.
 */
export async function writeLegacyDeckFrontierOverride(
  ctx: ServiceContext,
  deckId: string,
  newReviewUnitsPerDay: number,
) {
  ctx.db
    .insert(schema.deckSettings)
    .values({ deckId, newReviewUnitsPerDay })
    .run();
}

/** The single generated review unit for a basic flashcard (test convenience). */
export async function getOnlyReviewUnit(
  ctx: ServiceContext,
  flashcardId: string,
) {
  const rows = ctx.db
    .select()
    .from(schema.reviewUnits)
    .where(eq(schema.reviewUnits.flashcardId, flashcardId))
    .all();
  return rows[0];
}

export async function reviewLogsFor(ctx: ServiceContext, reviewUnitId: string) {
  return ctx.db
    .select()
    .from(schema.reviewLogs)
    .where(eq(schema.reviewLogs.reviewUnitId, reviewUnitId))
    .all();
}

export async function countReviewLogs(ctx: ServiceContext) {
  const row = ctx.db
    .select({ value: count() })
    .from(schema.reviewLogs)
    .get();
  return row?.value ?? 0;
}

/** Register beforeEach/afterEach hooks for an isolated temp SQLite root. */
export function useTestDb() {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-test-"));
    setDbRootForTests(root);
  });

  afterEach(() => {
    closeDb();
    resetProfileRuntime();
    setDbRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

export function getTestDbRoot() {
  return root;
}
