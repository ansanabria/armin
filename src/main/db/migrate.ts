import path from "node:path";
import { app } from "electron";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "./index";

/**
 * Apply pending migrations. The `drizzle` folder lives at the app root and is
 * bundled into the asar at package time (app.getAppPath() resolves to the
 * project root in dev and the asar root in production).
 */
export async function runMigrations() {
  await migrate(getDb(), {
    migrationsFolder: path.join(app.getAppPath(), "drizzle"),
  });
}
