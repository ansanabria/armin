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

const dbHandles = new Map<string, DbHandle>();
let testDbRoot: string | null = null;

function defaultDbRoot() {
  if (process.env.ARMIN_DATA_DIR) {
    return process.env.ARMIN_DATA_DIR;
  }

  if (!process.versions.electron) return defaultArminDataDir();

  return app.getPath("userData");
}

function safeProfileId(profileId: string) {
  return profileId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function profileDataDir(profileId: string) {
  const root = testDbRoot ?? defaultDbRoot();
  return path.join(root, "profiles", safeProfileId(profileId));
}

export function profileMediaDir(profileId: string) {
  return path.join(profileDataDir(profileId), "media");
}

export function setDbRootForTests(root: string | null) {
  testDbRoot = root;
}

/** Open a profile's SQLite database via better-sqlite3 (WAL + FK enforcement). */
export async function initDb(profileId: string) {
  const existing = dbHandles.get(profileId);
  if (existing) return existing.db;

  const profileDir = profileDataDir(profileId);
  fs.mkdirSync(profileDir, { recursive: true });
  const client = openSqliteDatabase(path.join(profileDir, "armin.db"));
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");

  const db = drizzle(client, { schema });
  dbHandles.set(profileId, { client, db });
  return db;
}

export function getDb(profileId: string) {
  const handle = dbHandles.get(profileId);
  if (!handle) {
    throw new Error(
      `Database for profile ${profileId} is not initialized — call initDb(profileId) first.`,
    );
  }
  return handle.db;
}

export function closeDb(profileId?: string) {
  if (profileId) {
    dbHandles.get(profileId)?.client.close();
    dbHandles.delete(profileId);
    return;
  }

  for (const handle of dbHandles.values()) {
    handle.client.close();
  }
  dbHandles.clear();
}

/**
 * A consistent single-file image of a profile's live database. Checkpointing
 * folds the WAL back into the main file first, so the serialized bytes include
 * every committed write without needing to close the database.
 */
export function snapshotProfileDb(profileId: string) {
  const handle = dbHandles.get(profileId);
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
  const profileDir = profileDataDir(profileId);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "armin.db"), bytes);
}

export function deleteProfileData(profileId: string) {
  closeDb(profileId);
  const profileDir = profileDataDir(profileId);
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

export { schema };
