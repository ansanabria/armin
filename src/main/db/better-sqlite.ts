import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Database from "better-sqlite3";

const requireFromHere = createRequire(import.meta.url);

function isInsideAsar(value: string) {
  return value.split(path.sep).includes("app.asar");
}

function electronPrebuildPath() {
  if (!process.versions.electron) return undefined;

  try {
    const packageRoot = path.dirname(
      requireFromHere.resolve("better-sqlite3/package.json"),
    );

    const candidates: string[] = [];

    if (!isInsideAsar(packageRoot)) {
      const projectRoot = path.resolve(packageRoot, "../..");
      candidates.push(
        path.join(
          projectRoot,
          "out",
          `Armin-${process.platform}-${process.arch}`,
          "resources",
          "app.asar.unpacked",
          "node_modules",
          "better-sqlite3",
          "build",
          "Release",
          "better_sqlite3.node",
        ),
      );
    }
    candidates.push(
      path.join(packageRoot, "build", "Release", "better_sqlite3.node"),
    );

    for (const candidate of candidates) {
      if (!isInsideAsar(candidate) && fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    return undefined;
  }
}

export function openSqliteDatabase(
  filename: string,
  options: Database.Options = {},
) {
  const nativeBinding = electronPrebuildPath();
  return new Database(
    filename,
    nativeBinding && options.nativeBinding === undefined
      ? { ...options, nativeBinding }
      : options,
  );
}
