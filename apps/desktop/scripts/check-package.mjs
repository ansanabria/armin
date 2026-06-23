import asar from "@electron/asar";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const platform = process.platform;
const arch = process.arch;

const packageDir = path.join(root, "out", `Armin-${platform}-${arch}`);
const executablePath =
  platform === "darwin"
    ? path.join(packageDir, "Armin.app", "Contents", "MacOS", "Armin")
    : path.join(packageDir, platform === "win32" ? "Armin.exe" : "Armin");
const resourcesDir =
  platform === "darwin"
    ? path.join(packageDir, "Armin.app", "Contents", "Resources")
    : path.join(packageDir, "resources");
const appAsarPath = path.join(resourcesDir, "app.asar");
const unpackedDir = path.join(resourcesDir, "app.asar.unpacked");

const expectedNativeModules = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
];

function fail(message) {
  console.error(`Package check failed: ${message}`);
  process.exitCode = 1;
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`${label} missing at ${filePath}`);
  }
}

function assertExecutable(filePath, label) {
  assertFile(filePath, label);
  if (platform !== "win32") {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
    } catch {
      fail(`${label} is not executable at ${filePath}`);
    }
  }
}

function assertAsarFile(entries, filePath) {
  if (!entries.includes(`/${filePath}`)) {
    fail(`${filePath} missing from app.asar`);
  }
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

assertExecutable(executablePath, "Packaged executable");
assertFile(appAsarPath, "app.asar");

const entries = asar.listPackage(appAsarPath);
for (const requiredFile of [
  "package.json",
  ".vite/build/main.js",
  "drizzle/meta/_journal.json",
]) {
  assertAsarFile(entries, requiredFile);
}

const actualNativeModules = [
  ...new Set(
    entries
      .map((entry) => entry.match(/^\/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1])
      .filter(Boolean),
  ),
].sort();

const expectedSorted = [...expectedNativeModules].sort();
if (actualNativeModules.join(",") !== expectedSorted.join(",")) {
  fail(
    `unexpected packaged native modules: expected ${expectedSorted.join(", ")}, got ${actualNativeModules.join(", ") || "none"}`,
  );
}

const unpackedNativeFiles = collectFiles(
  path.join(unpackedDir, "node_modules", "better-sqlite3"),
).filter((filePath) => filePath.endsWith(".node"));

if (unpackedNativeFiles.length === 0) {
  fail("better-sqlite3 native .node files missing from app.asar.unpacked");
}

if (process.exitCode) process.exit(process.exitCode);

console.log("Package check passed.");
