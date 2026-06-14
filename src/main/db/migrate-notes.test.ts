import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Directly exercises the 0005 backfill against a database that already holds
 * pre-split data — the path real upgrades take but fresh installs (which run the
 * migration over empty tables) never reach.
 */

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

function createPreSplitSchema() {
  client.pragma("foreign_keys = ON");
  client.exec(`CREATE TABLE decks (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, description text,
    created_at integer NOT NULL, updated_at integer NOT NULL
  );`);
  client.exec(`CREATE TABLE cards (
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
  client.exec(`CREATE TABLE tags (
    id text PRIMARY KEY NOT NULL, name text NOT NULL UNIQUE, created_at integer NOT NULL
  );`);
  client.exec(`CREATE TABLE card_tags (
    card_id text NOT NULL, tag_id text NOT NULL,
    PRIMARY KEY (card_id, tag_id),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE cascade,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE cascade
  );`);
  client.exec(`CREATE TABLE card_prereqs (
    prereq_id text NOT NULL, dependent_id text NOT NULL,
    PRIMARY KEY (prereq_id, dependent_id),
    FOREIGN KEY (prereq_id) REFERENCES cards(id) ON DELETE cascade,
    FOREIGN KEY (dependent_id) REFERENCES cards(id) ON DELETE cascade
  );`);
}

function applyNotesMigration() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "drizzle", "0005_notes_split.sql"),
    "utf8",
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) client.exec(statement);
}

describe("0005 notes backfill", () => {
  it("splits existing cards into notes while preserving relationships", () => {
    createPreSplitSchema();
    const now = Date.now();
    const deckId = randomUUID();
    const prereqId = randomUUID();
    const dependentId = randomUUID();
    const tagId = randomUUID();

    client
      .prepare(
        `INSERT INTO decks (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(deckId, "Deck", null, now, now);
    for (const [id, front, back] of [
      [prereqId, "Foundation", "Base"],
      [dependentId, "Advanced", "Top"],
    ] as const) {
      client
        .prepare(
          `INSERT INTO cards (id, deck_id, front, back, type, due, locked, pos_x, pos_y, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'basic', ?, 1, 12, 34, ?, ?)`,
        )
        .run(id, deckId, front, back, now, now, now);
    }
    client
      .prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`)
      .run(tagId, "fundamentals", now);
    client
      .prepare(`INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)`)
      .run(prereqId, tagId);
    client
      .prepare(
        `INSERT INTO card_prereqs (prereq_id, dependent_id) VALUES (?, ?)`,
      )
      .run(prereqId, dependentId);

    applyNotesMigration();

    // One note per original card, content carrying front/back.
    const notes = client
      .prepare(
        "SELECT id, type, content, pos_x, pos_y, locked FROM notes ORDER BY id",
      )
      .all() as Record<string, unknown>[];
    expect(notes).toHaveLength(2);
    const prereqNote = notes.find((r) => r.id === prereqId)!;
    expect(prereqNote.type).toBe("basic");
    expect(JSON.parse(prereqNote.content as string)).toEqual({
      front: "Foundation",
      back: "Base",
    });
    expect(prereqNote.pos_x).toBe(12);
    expect(prereqNote.locked).toBe(1);

    // Cards keep their ids, now point at the matching note via note_id.
    const cards = client
      .prepare("SELECT id, note_id, sub_key FROM cards ORDER BY id")
      .all() as Record<string, unknown>[];
    expect(cards.every((r) => r.note_id === r.id)).toBe(true);
    expect(cards.every((r) => r.sub_key === "")).toBe(true);

    // Tags and prereq edges migrated onto the note tables.
    const noteTags = client
      .prepare("SELECT note_id FROM note_tags")
      .all() as Record<string, unknown>[];
    expect(noteTags.map((r) => r.note_id)).toEqual([prereqId]);
    const notePrereqs = client
      .prepare("SELECT prereq_id, dependent_id FROM note_prereqs")
      .all() as Record<string, unknown>[];
    expect(notePrereqs[0]).toMatchObject({
      prereq_id: prereqId,
      dependent_id: dependentId,
    });

    // Old join tables and the moved column are gone.
    const tables = client
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Record<string, unknown>[];
    const tableNames = tables.map((r) => r.name);
    expect(tableNames).not.toContain("card_tags");
    expect(tableNames).not.toContain("card_prereqs");
    const cardCols = client.prepare("PRAGMA table_info(cards)").all() as Record<
      string,
      unknown
    >[];
    expect(cardCols.map((r) => r.name)).not.toContain("type");
  });
});
