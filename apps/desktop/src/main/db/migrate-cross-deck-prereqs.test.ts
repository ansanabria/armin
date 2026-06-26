import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../db";
import { runMigrations } from "./migrate";
import * as decks from "../services/decks";
import * as flashcards from "../services/flashcards";
import * as graph from "../services/graph";
import {
  getOnlyReviewUnit,
  makeContext,
  useTestDb,
} from "../test/db";

/**
 * The 0015 migration is a data migration: it deletes prerequisite edges whose
 * prerequisite and dependent flashcards live in different decks. Lock state is
 * denormalized in service code, so profile DB readiness recomputes it after the
 * migration runs (see `refreshAllLockedStates`).
 */

describe("0015 cross-deck prereq edge deletion", () => {
  let dir: string;
  let client: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-migrate-"));
    client = new Database(path.join(dir, "old.db"));
  });

  afterEach(() => {
    client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function createSchema() {
    client.pragma("foreign_keys = ON");
    client.exec(`CREATE TABLE decks (
      id text PRIMARY KEY NOT NULL, name text NOT NULL, description text,
      created_at integer NOT NULL, updated_at integer NOT NULL
    );`);
    client.exec(`CREATE TABLE flashcards (
      id text PRIMARY KEY NOT NULL, deck_id text NOT NULL, type text NOT NULL,
      content text NOT NULL, pos_x real, pos_y real,
      locked integer DEFAULT 0 NOT NULL, archived integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL, updated_at integer NOT NULL,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE cascade
    );`);
    client.exec(`CREATE TABLE flashcard_prereqs (
      prereq_id text NOT NULL, dependent_id text NOT NULL,
      PRIMARY KEY (prereq_id, dependent_id),
      FOREIGN KEY (prereq_id) REFERENCES flashcards(id) ON DELETE cascade,
      FOREIGN KEY (dependent_id) REFERENCES flashcards(id) ON DELETE cascade
    );`);
  }

  function applyMigration() {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "drizzle", "0015_delete_cross_deck_prereq_edges.sql"),
      "utf8",
    );
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      client.exec(statement);
    }
  }

  it("deletes cross-deck edges and keeps same-deck edges", () => {
    createSchema();
    const now = Date.now();
    const deckA = randomUUID();
    const deckB = randomUUID();
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();

    for (const [id, name] of [
      [deckA, "Deck A"],
      [deckB, "Deck B"],
    ] as const) {
      client
        .prepare(
          `INSERT INTO decks (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        )
        .run(id, name, now, now);
    }
    for (const [id, deckId] of [
      [a1, deckA],
      [a2, deckA],
      [b1, deckB],
    ] as const) {
      client
        .prepare(
          `INSERT INTO flashcards (id, deck_id, type, content, created_at, updated_at) VALUES (?, ?, 'basic', '{}', ?, ?)`,
        )
        .run(id, deckId, now, now);
    }
    // Same-deck edge a1 -> a2 (survives) and cross-deck edge a1 -> b1 (deleted).
    client
      .prepare(
        `INSERT INTO flashcard_prereqs (prereq_id, dependent_id) VALUES (?, ?)`,
      )
      .run(a1, a2);
    client
      .prepare(
        `INSERT INTO flashcard_prereqs (prereq_id, dependent_id) VALUES (?, ?)`,
      )
      .run(a1, b1);

    applyMigration();

    const edges = client
      .prepare("SELECT prereq_id, dependent_id FROM flashcard_prereqs")
      .all() as Record<string, unknown>[];
    expect(edges).toEqual([{ prereq_id: a1, dependent_id: a2 }]);
  });
});

useTestDb();

describe("cross-deck prereq lock repair", () => {
  function basic(
    ctx: Awaited<ReturnType<typeof makeContext>>,
    deckId: string,
    front: string,
  ) {
    return flashcards.createFlashcard({
      ctx,
      deckId,
      type: "basic",
      content: { front, back: front },
    });
  }

  it("recomputes lock state after a cross-deck edge is removed", async () => {
    const ctx = await makeContext("cross-deck-repair");
    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });
    const prereq = await basic(ctx, deckA.id, "P");
    const dependent = await basic(ctx, deckB.id, "D");
    const sameDeckPrereq = await basic(ctx, deckB.id, "SP");
    const sameDeckDependent = await basic(ctx, deckB.id, "SD");

    // A legitimate same-deck edge that must keep locking its dependent.
    await graph.addPrereq(ctx, sameDeckPrereq.id, sameDeckDependent.id);

    // Simulate the pre-migration denormalized state: a cross-deck edge plus the
    // locked flags it left on the dependent flashcard and its review units.
    ctx.db
      .insert(schema.flashcardPrereqs)
      .values({ prereqId: prereq.id, dependentId: dependent.id })
      .run();
    ctx.db
      .update(schema.flashcards)
      .set({ locked: true })
      .where(eq(schema.flashcards.id, dependent.id))
      .run();
    ctx.db
      .update(schema.reviewUnits)
      .set({ locked: true })
      .where(eq(schema.reviewUnits.flashcardId, dependent.id))
      .run();

    // The migration SQL deletes the cross-deck edge…
    ctx.db
      .delete(schema.flashcardPrereqs)
      .where(
        and(
          eq(schema.flashcardPrereqs.prereqId, prereq.id),
          eq(schema.flashcardPrereqs.dependentId, dependent.id),
        ),
      )
      .run();
    // …and readiness repairs the denormalized lock/scheduling state.
    await graph.refreshAllLockedStates(ctx);

    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);

    // The same-deck dependent is still genuinely locked by its unsecured prereq.
    expect(
      (await flashcards.getFlashcard(ctx, sameDeckDependent.id))?.locked,
    ).toBe(true);
  });

  it("repairs lock state whenever runMigrations applies a migration", async () => {
    const ctx = await makeContext("cross-deck-repair-wiring");
    const deckA = await decks.createDeck(ctx, { name: "A" });
    const deckB = await decks.createDeck(ctx, { name: "B" });
    const prereq = await basic(ctx, deckA.id, "P");
    const dependent = await basic(ctx, deckB.id, "D");

    // Simulate a profile that predates the 0015 enforcement: a cross-deck edge
    // and the stale locked flags it left behind.
    ctx.db
      .insert(schema.flashcardPrereqs)
      .values({ prereqId: prereq.id, dependentId: dependent.id })
      .run();
    ctx.db
      .update(schema.flashcards)
      .set({ locked: true })
      .where(eq(schema.flashcards.id, dependent.id))
      .run();
    ctx.db
      .update(schema.reviewUnits)
      .set({ locked: true })
      .where(eq(schema.reviewUnits.flashcardId, dependent.id))
      .run();

    // Drizzle re-applies a journal entry when its `when` timestamp is newer than
    // the newest recorded `created_at`. Lower every recorded timestamp to just
    // below 0015's journal time (1782300000000) so the next runMigrations call
    // re-applies only 0015 (its delete is idempotent) and, because a migration
    // was applied, runs the denormalized-state repair — exactly what any entry
    // point (IPC, MCP, restore) triggers after an upgrade.
    ctx.db.run(sql`UPDATE __drizzle_migrations SET created_at = 1782299999999`);

    await runMigrations(ctx.profileId);

    // The cross-deck edge is gone and the stale lock flags were recomputed.
    expect(
      ctx.db
        .select()
        .from(schema.flashcardPrereqs)
        .where(eq(schema.flashcardPrereqs.prereqId, prereq.id))
        .all(),
    ).toEqual([]);
    expect((await flashcards.getFlashcard(ctx, dependent.id))?.locked).toBe(
      false,
    );
    expect((await getOnlyReviewUnit(ctx, dependent.id)).locked).toBe(false);
  });
});
