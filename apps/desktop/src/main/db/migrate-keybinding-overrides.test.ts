import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The 0016 migration adds a nullable `keybindings` column to `settings` for
 * per-profile keybinding overrides. It is purely additive: existing rows must
 * survive with a NULL override (meaning "use factory defaults"), and the column
 * must accept a JSON override blob afterwards. See
 * docs/adr/0019-keybindings-stored-as-per-profile-overrides-on-factory-defaults.md.
 */

describe("0016 add keybinding overrides column", () => {
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

  function createOldSettings() {
    // The settings shape just before 0016 — note: no `keybindings` column.
    client.exec(`CREATE TABLE settings (
      id integer PRIMARY KEY DEFAULT 1,
      request_retention real DEFAULT 0.9 NOT NULL,
      maximum_interval integer DEFAULT 36500 NOT NULL,
      enable_fuzz integer DEFAULT 1 NOT NULL,
      enable_short_term integer DEFAULT 1 NOT NULL,
      learning_steps text DEFAULT '10m' NOT NULL,
      relearning_steps text DEFAULT '10m' NOT NULL,
      weights text,
      prereq_stability_floor real DEFAULT 2 NOT NULL,
      new_review_units_per_day integer DEFAULT 10 NOT NULL,
      keep_sibling_review_units_together integer DEFAULT 1 NOT NULL,
      scheduling_preset text DEFAULT 'balanced' NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );`);
  }

  function applyMigration() {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "drizzle", "0016_add_keybinding_overrides.sql"),
      "utf8",
    );
    for (const statement of migration
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      client.exec(statement);
    }
  }

  it("adds a null keybindings column without disturbing the existing row", () => {
    createOldSettings();
    client.exec(`INSERT INTO settings (id, scheduling_preset) VALUES (1, 'aggressive');`);

    applyMigration();

    const row = client
      .prepare(`SELECT scheduling_preset, keybindings FROM settings WHERE id = 1`)
      .get() as { scheduling_preset: string; keybindings: string | null };
    expect(row.scheduling_preset).toBe("aggressive"); // pre-existing data preserved
    expect(row.keybindings).toBeNull(); // no overrides => factory defaults
  });

  it("accepts a JSON override blob after migrating", () => {
    createOldSettings();
    client.exec(`INSERT INTO settings (id) VALUES (1);`);
    applyMigration();

    const overrides = JSON.stringify({ "review.flip": "Enter" });
    client.prepare(`UPDATE settings SET keybindings = ? WHERE id = 1`).run(overrides);

    const row = client
      .prepare(`SELECT keybindings FROM settings WHERE id = 1`)
      .get() as { keybindings: string | null };
    expect(row.keybindings).toBe(overrides);
  });
});
