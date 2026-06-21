import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { defaultArminDataDir } from "../../shared/mcp-session";
import { openSqliteDatabase } from "./better-sqlite";
import * as schema from "./schema";

type DbHandle = {
  client: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
};

const handles = new Map<string, DbHandle>();
let testDbRoot: string | null = null;

function defaultDbRoot() {
  if (process.env.ARMIN_DATA_DIR) {
    return process.env.ARMIN_DATA_DIR;
  }

  if (!process.versions.electron) return defaultArminDataDir();

  return app.getPath("userData");
}

function profileDbDir(profileId: string) {
  const safeProfileId = profileId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const root = testDbRoot ?? defaultDbRoot();
  return path.join(root, "profiles", safeProfileId);
}

export function setDbRootForTests(root: string | null) {
  testDbRoot = root;
}

/** Open a profile's SQLite database via better-sqlite3 (WAL + FK enforcement). */
export async function initDb(profileId: string) {
  const existing = handles.get(profileId);
  if (existing) return existing.db;

  const dir = profileDbDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  const client = openSqliteDatabase(path.join(dir, "armin.db"));
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");

  const db = drizzle(client, { schema });
  handles.set(profileId, { client, db });
  return db;
}

export function getDb(profileId: string) {
  const handle = handles.get(profileId);
  if (!handle) {
    throw new Error(
      `Database for profile ${profileId} is not initialized — call initDb(profileId) first.`,
    );
  }
  return handle.db;
}

export function closeDb(profileId?: string) {
  if (profileId) {
    handles.get(profileId)?.client.close();
    handles.delete(profileId);
    return;
  }

  for (const handle of handles.values()) {
    handle.client.close();
  }
  handles.clear();
}

/**
 * A consistent single-file image of a profile's live database. Checkpointing
 * folds the WAL back into the main file first, so the serialized bytes include
 * every committed write without needing to close the database.
 */
export function snapshotProfileDb(profileId: string): Uint8Array {
  const handle = handles.get(profileId);
  if (!handle) {
    throw new Error(
      `Database for profile ${profileId} is not initialized — call initDb(profileId) first.`,
    );
  }
  handle.client.pragma("wal_checkpoint(TRUNCATE)");
  return handle.client.serialize();
}

/**
 * Write raw SQLite bytes as a profile's database file (used by restore). The
 * profile must not already have an open handle; callers create a fresh profile
 * id first.
 */
export function writeProfileDbFile(profileId: string, bytes: Uint8Array) {
  const dir = profileDbDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "armin.db"), bytes);
}

export function deleteProfileData(profileId: string) {
  closeDb(profileId);
  const dir = profileDbDir(profileId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export { schema };
