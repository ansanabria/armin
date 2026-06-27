import fs from "node:fs";
import path from "node:path";
import { defaultMigrationsFolder } from "./migrate";

type Journal = { entries?: unknown[] };

/**
 * A monotonic integer identifying the database schema this build can produce —
 * the number of drizzle migrations bundled with the app. A backup records the
 * value it was made with so restore can refuse a backup from a newer build
 * (whose schema this build's migrations can't reach).
 */
export function getLocalSchemaVersion(): number {
  const journalPath = path.join(
    defaultMigrationsFolder(),
    "meta",
    "_journal.json",
  );
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
  return Array.isArray(journal.entries) ? journal.entries.length : 0;
}
