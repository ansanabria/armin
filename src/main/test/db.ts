import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb, initDb, schema, setDbRootForTests } from "../db";
import { runMigrations } from "../db/migrate";
import type { ServiceContext } from "../services/context";
import { State } from "../services/scheduler";

let root: string;

export async function makeContext(profileId: string): Promise<ServiceContext> {
  await initDb(profileId);
  await runMigrations(profileId);
  return { profileId, db: getDb(profileId) };
}

/**
 * Mark a note's prerequisite as secured: every generated card moves into FSRS
 * Review state above the stability floor.
 */
export async function securePrereq(ctx: ServiceContext, noteId: string) {
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
    .where(eq(schema.cards.noteId, noteId))
    .run();
}

/** The single generated card for a basic note (test convenience). */
export async function getOnlyCard(ctx: ServiceContext, noteId: string) {
  const rows = await ctx.db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.noteId, noteId))
    .all();
  return rows[0];
}

/** Register beforeEach/afterEach hooks for an isolated temp SQLite root. */
export function useTestDb() {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-test-"));
    setDbRootForTests(root);
  });

  afterEach(() => {
    closeDb();
    setDbRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

export function getTestDbRoot() {
  return root;
}
