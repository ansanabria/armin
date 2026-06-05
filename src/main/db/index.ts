import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

/** Open the SQLite database via libSQL (WAL + FK enforcement). Idempotent. */
export async function initDb() {
  if (_db) return _db;
  const dir = app.getPath("userData");
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
