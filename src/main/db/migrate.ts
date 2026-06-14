import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./index";

function hasMigrations(folder: string) {
  return fs.existsSync(path.join(folder, "meta", "_journal.json"));
}

function defaultMigrationsFolder() {
  const candidates = [
    process.env.ARMIN_MIGRATIONS_DIR,
    process.versions.electron ? path.join(app.getAppPath(), "drizzle") : null,
    path.join(process.cwd(), "drizzle"),
  ].filter((value): value is string => Boolean(value));

  for (const folder of candidates) {
    if (hasMigrations(folder)) return folder;
  }

  throw new Error(
    `Could not find drizzle migrations. Checked: ${candidates.join(", ")}`,
  );
}

/**
 * Apply pending migrations. The `drizzle` folder lives at the app root and is
 * bundled into the asar at package time (app.getAppPath() resolves to the
 * project root in dev and the asar root in production).
 */
export async function runMigrations(
  profileId: string,
  options: { migrationsFolder?: string } = {},
) {
  await migrate(getDb(profileId), {
    migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder(),
  });
}
