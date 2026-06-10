import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Directly exercises the 0005 backfill against a database that already holds
 * pre-split data — the path real upgrades take but fresh installs (which run the
 * migration over empty tables) never reach.
 */

let dir: string;
let client: Client;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-migrate-"));
  client = createClient({ url: `file:${path.join(dir, "old.db")}` });
});

afterEach(() => {
  client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createPreSplitSchema() {
  await client.execute("PRAGMA foreign_keys = ON;");
  await client.execute(`CREATE TABLE decks (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, description text,
    created_at integer NOT NULL, updated_at integer NOT NULL
  );`);
  await client.execute(`CREATE TABLE cards (
    id text PRIMARY KEY NOT NULL, deck_id text NOT NULL,
    front text NOT NULL, back text NOT NULL, type text DEFAULT 'basic' NOT NULL,
    due integer NOT NULL, stability real DEFAULT 0 NOT NULL,
    difficulty real DEFAULT 0 NOT NULL, elapsed_days real DEFAULT 0 NOT NULL,
    scheduled_days real DEFAULT 0 NOT NULL, learning_steps integer DEFAULT 0 NOT NULL,
    reps integer DEFAULT 0 NOT NULL, lapses integer DEFAULT 0 NOT NULL,
    state integer DEFAULT 0 NOT NULL, last_review integer,
    locked integer DEFAULT 0 NOT NULL, pos_x real, pos_y real,
    created_at integer NOT NULL, updated_at integer NOT NULL,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE cascade
  );`);
  await client.execute(`CREATE TABLE tags (
    id text PRIMARY KEY NOT NULL, name text NOT NULL UNIQUE, created_at integer NOT NULL
  );`);
  await client.execute(`CREATE TABLE card_tags (
    card_id text NOT NULL, tag_id text NOT NULL,
    PRIMARY KEY (card_id, tag_id),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE cascade,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE cascade
  );`);
  await client.execute(`CREATE TABLE card_prereqs (
    prereq_id text NOT NULL, dependent_id text NOT NULL,
    PRIMARY KEY (prereq_id, dependent_id),
    FOREIGN KEY (prereq_id) REFERENCES cards(id) ON DELETE cascade,
    FOREIGN KEY (dependent_id) REFERENCES cards(id) ON DELETE cascade
  );`);
}

async function applyNotesMigration() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "drizzle", "0005_notes_split.sql"),
    "utf8",
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  await client.batch(statements);
}

describe("0005 notes backfill", () => {
  it("splits existing cards into notes while preserving relationships", async () => {
    await createPreSplitSchema();
    const now = Date.now();
    const deckId = randomUUID();
    const prereqId = randomUUID();
    const dependentId = randomUUID();
    const tagId = randomUUID();

    await client.execute({
      sql: `INSERT INTO decks (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [deckId, "Deck", null, now, now],
    });
    for (const [id, front, back] of [
      [prereqId, "Foundation", "Base"],
      [dependentId, "Advanced", "Top"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO cards (id, deck_id, front, back, type, due, locked, pos_x, pos_y, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'basic', ?, 1, 12, 34, ?, ?)`,
        args: [id, deckId, front, back, now, now, now],
      });
    }
    await client.execute({
      sql: `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
      args: [tagId, "fundamentals", now],
    });
    await client.execute({
      sql: `INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)`,
      args: [prereqId, tagId],
    });
    await client.execute({
      sql: `INSERT INTO card_prereqs (prereq_id, dependent_id) VALUES (?, ?)`,
      args: [prereqId, dependentId],
    });

    await applyNotesMigration();

    // One note per original card, content carrying front/back.
    const notes = await client.execute(
      "SELECT id, type, content, pos_x, pos_y, locked FROM notes ORDER BY id",
    );
    expect(notes.rows).toHaveLength(2);
    const prereqNote = notes.rows.find((r) => r.id === prereqId)!;
    expect(prereqNote.type).toBe("basic");
    expect(JSON.parse(prereqNote.content as string)).toEqual({
      front: "Foundation",
      back: "Base",
    });
    expect(prereqNote.pos_x).toBe(12);
    expect(prereqNote.locked).toBe(1);

    // Cards keep their ids, now point at the matching note via note_id.
    const cards = await client.execute(
      "SELECT id, note_id, sub_key FROM cards ORDER BY id",
    );
    expect(cards.rows.every((r) => r.note_id === r.id)).toBe(true);
    expect(cards.rows.every((r) => r.sub_key === "")).toBe(true);

    // Tags and prereq edges migrated onto the note tables.
    const noteTags = await client.execute("SELECT note_id FROM note_tags");
    expect(noteTags.rows.map((r) => r.note_id)).toEqual([prereqId]);
    const notePrereqs = await client.execute(
      "SELECT prereq_id, dependent_id FROM note_prereqs",
    );
    expect(notePrereqs.rows[0]).toMatchObject({
      prereq_id: prereqId,
      dependent_id: dependentId,
    });

    // Old join tables and the moved column are gone.
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tableNames = tables.rows.map((r) => r.name);
    expect(tableNames).not.toContain("card_tags");
    expect(tableNames).not.toContain("card_prereqs");
    const cardCols = await client.execute("PRAGMA table_info(cards)");
    expect(cardCols.rows.map((r) => r.name)).not.toContain("type");
  });
});
