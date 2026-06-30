import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./index";
import { refreshAllLockedStates } from "../services/prerequisite-state";

function hasMigrations(folder: string) {
  return fs.existsSync(path.join(folder, "meta", "_journal.json"));
}

/**
 * How many migrations Drizzle has recorded as applied. Returns 0 before the
 * first run, when the bookkeeping table does not exist yet.
 */
function appliedMigrationCount(db: ReturnType<typeof getDb>) {
  try {
    const row = db.get<{ count: number }>(
      sql`SELECT count(*) AS count FROM __drizzle_migrations`,
    );
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export function defaultMigrationsFolder() {
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
  const db = getDb(profileId);
  const before = appliedMigrationCount(db);
  migrate(db, {
    migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder(),
  });
  const after = appliedMigrationCount(db);

  // Some migrations can change relationships that are denormalized into
  // `flashcards.locked`, `review_units.locked`, and review-unit scheduling by
  // service code. Recompute that derived state whenever migrations actually ran,
  // regardless of which entry point (IPC, MCP, restore) triggered the upgrade.
  // Gating on an applied-count change keeps this off the hot path once a profile
  // is already up to date.
  if (after > before) {
    await refreshAllLockedStates({ profileId, db });
  }
}
