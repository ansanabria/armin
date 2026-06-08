import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

type DbHandle = {
  client: Client;
  db: LibSQLDatabase<typeof schema>;
};

const handles = new Map<string, DbHandle>();
let testDbRoot: string | null = null;

function defaultDbRoot() {
  if (process.env.ARMIN_DATA_DIR) {
    return process.env.ARMIN_DATA_DIR;
  }

  if (!process.versions.electron) {
    throw new Error(
      "ARMIN_DATA_DIR must be set when the database is initialized outside Electron.",
    );
  }

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

/** Open a profile's SQLite database via libSQL (WAL + FK enforcement). */
export async function initDb(profileId: string) {
  const existing = handles.get(profileId);
  if (existing) return existing.db;

  const dir = profileDbDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  const client = createClient({
    url: `file:${path.join(dir, "armin.db")}`,
  });
  await client.execute("PRAGMA journal_mode = WAL;");
  await client.execute("PRAGMA foreign_keys = ON;");

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

export { schema };
