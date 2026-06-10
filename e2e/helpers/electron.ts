import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electronPath from "electron";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";

const MAIN_ENTRY = path.join(process.cwd(), ".vite/build/main.js");

export type ArminTestApp = {
  app: ElectronApplication;
  dataDir: string;
};

export function mainEntryPath() {
  return MAIN_ENTRY;
}

export function isE2eBuildAvailable() {
  return fs.existsSync(MAIN_ENTRY);
}

export async function launchArmin(
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-e2e-")),
): Promise<ArminTestApp> {
  if (!isE2eBuildAvailable()) {
    throw new Error(
      `Vite build output missing at ${MAIN_ENTRY}. Run npm run test:e2e:build first.`,
    );
  }

  const app = await electron.launch({
    // The electron package's default export is the binary path at runtime,
    // even though its types describe the Electron API namespace.
    executablePath: electronPath as unknown as string,
    args: [
      MAIN_ENTRY,
      `--user-data-dir=${dataDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
    env: {
      ...process.env,
      ARMIN_DATA_DIR: dataDir,
      ARMIN_E2E: "1",
    },
  });

  return { app, dataDir };
}

export async function firstWindow(app: ElectronApplication): Promise<Page> {
  return app.firstWindow();
}

export async function waitForMainWindow(
  app: ElectronApplication,
): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const hasDecks = await page
        .getByRole("heading", { name: "Decks", exact: true })
        .isVisible()
        .catch(() => false);
      if (hasDecks) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the main Armin window.");
}

export async function closeArmin({ app, dataDir }: ArminTestApp) {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
