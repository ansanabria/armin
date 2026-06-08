import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "./index";

type ElectronModule = {
  app?: {
    getAppPath(): string;
  };
};

async function defaultMigrationsFolder() {
  if (process.versions.electron) {
    try {
      const electron = (await import("electron")) as ElectronModule;
      if (electron.app) {
        return path.join(electron.app.getAppPath(), "drizzle");
      }
    } catch {
      // Fall through to the project-root path used by the standalone MCP process.
    }
  }

  return path.join(process.cwd(), "drizzle");
}

/**
 * Apply pending migrations. The `drizzle` folder lives at the app root and is
 * bundled into the asar at package time (app.getAppPath() resolves to the
 * project root in dev and the asar root in production).
 */
export async function runMigrations(
  options: { migrationsFolder?: string } = {},
) {
  await migrate(getDb(), {
    migrationsFolder:
      options.migrationsFolder ?? (await defaultMigrationsFolder()),
  });
}
