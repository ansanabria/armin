import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

type ElectronModule = {
  app?: {
    getPath(name: "userData"): string;
  };
};

async function defaultDataDir() {
  if (process.env.ARMIN_DATA_DIR) {
    return process.env.ARMIN_DATA_DIR;
  }

  if (!process.versions.electron) {
    throw new Error(
      "ARMIN_DATA_DIR must be set when the database is initialized outside Electron.",
    );
  }

  const electron = (await import("electron")) as ElectronModule;
  if (!electron.app) {
    throw new Error(
      "ARMIN_DATA_DIR must be set when the database is initialized outside Electron.",
    );
  }

  return electron.app.getPath("userData");
}

/** Open the SQLite database via libSQL (WAL + FK enforcement). Idempotent. */
export async function initDb(options: { dataDir?: string } = {}) {
  if (_db) return _db;
  const dir = options.dataDir ?? (await defaultDataDir());
  fs.mkdirSync(dir, { recursive: true });
  const client = createClient({
    url: `file:${path.join(dir, "armin.db")}`,
  });
  await client.execute("PRAGMA journal_mode = WAL;");
  await client.execute("PRAGMA foreign_keys = ON;");
  _client = client;
  _db = drizzle(client, { schema });
  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized — call initDb() first.");
  return _db;
}

export function closeDb() {
  _client?.close();
  _client = null;
  _db = null;
}

export { schema };
