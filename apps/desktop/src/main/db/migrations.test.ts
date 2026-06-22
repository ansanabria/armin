import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalSchemaVersion } from "./schema-version";

type Journal = {
  entries?: Array<{
    idx: number;
    tag: string;
  }>;
};

const migrationsDir = path.join(process.cwd(), "drizzle");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

function readJournal() {
  return JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
}

describe("drizzle migration bundle", () => {
  it("has one SQL file for every journal entry", () => {
    const journal = readJournal();
    expect(journal.entries).toBeDefined();

    const entries = journal.entries ?? [];
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const expectedFiles = entries.map((entry) => `${entry.tag}.sql`).sort();

    expect(sqlFiles).toEqual(expectedFiles);
  });

  it("keeps journal entries unique and in index order", () => {
    const entries = readJournal().entries ?? [];
    const indexes = entries.map((entry) => entry.idx);
    const tags = entries.map((entry) => entry.tag);

    expect(new Set(indexes).size).toBe(indexes.length);
    expect(new Set(tags).size).toBe(tags.length);
    expect(indexes).toEqual(entries.map((_, index) => index));
  });

  it("uses the journal entry count as the local schema version", () => {
    const entries = readJournal().entries ?? [];

    expect(getLocalSchemaVersion()).toBe(entries.length);
  });
});
