import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { downloadArtifact } = require("@electron/get");
const extract = require("extract-zip");

const root = path.resolve(import.meta.dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const electronPackage = require(path.join(electronDir, "package.json"));
const checksums = require(path.join(electronDir, "checksums.json"));

const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;
const arch = process.env.ELECTRON_INSTALL_ARCH || process.arch;
const platformPath = getPlatformPath(platform);
const distDir = path.join(electronDir, "dist");
const executablePath = path.join(distDir, platformPath);
const pathFile = path.join(electronDir, "path.txt");

if (isInstalled()) {
  console.log(`Electron ${electronPackage.version} is ready at ${executablePath}`);
  process.exit(0);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.rmSync(pathFile, { force: true });

const zipPath = await downloadArtifact({
  version: electronPackage.version,
  artifactName: "electron",
  platform,
  arch,
  checksums,
  force: process.env.force_no_cache === "true",
  cacheRoot: process.env.electron_config_cache,
});

await extract(zipPath, { dir: distDir });

const typeDefinition = path.join(distDir, "electron.d.ts");
if (fs.existsSync(typeDefinition)) {
  fs.renameSync(typeDefinition, path.join(electronDir, "electron.d.ts"));
}

fs.writeFileSync(pathFile, platformPath);

if (!isInstalled()) {
  throw new Error(
    `Electron ${electronPackage.version} install did not produce ${executablePath}`,
  );
}

console.log(`Electron ${electronPackage.version} is ready at ${executablePath}`);

function isInstalled() {
  try {
    const version = fs
      .readFileSync(path.join(distDir, "version"), "utf8")
      .replace(/^v/, "");
    const installedPath = fs.readFileSync(pathFile, "utf8");

    return (
      version === electronPackage.version &&
      installedPath === platformPath &&
      fs.existsSync(executablePath)
    );
  } catch {
    return false;
  }
}

function getPlatformPath(targetPlatform) {
  switch (targetPlatform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(
        `Electron builds are not available on platform: ${targetPlatform} (${os.platform()})`,
      );
  }
}
