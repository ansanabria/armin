import { app, session, type BrowserWindow, type Input } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEVTOOLS_EXTENSIONS = [
  {
    id: "fmkadmapgofadopljbjfkapdkoienihi",
    name: "React Developer Tools",
    installUrl:
      "https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi",
  },
  {
    id: "bdkgmiklpdmaojlpflclinlofgjfpabf",
    name: "Impeccable",
    installUrl:
      "https://chrome.google.com/webstore/detail/impeccable/bdkgmiklpdmaojlpflclinlofgjfpabf",
  },
] as const;

function chromeExtensionsDirs(): string[] {
  const home = os.homedir();

  if (process.platform === "darwin") {
    return [
      path.join(
        home,
        "Library/Application Support/Google/Chrome/Default/Extensions",
      ),
    ];
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      return [];
    }
    return [
      path.join(
        localAppData,
        "Google",
        "Chrome",
        "User Data",
        "Default",
        "Extensions",
      ),
    ];
  }

  return [
    path.join(home, ".config/google-chrome/Default/Extensions"),
    path.join(home, ".config/google-chrome-beta/Default/Extensions"),
    path.join(home, ".config/google-chrome-canary/Default/Extensions"),
    path.join(home, ".config/chromium/Default/Extensions"),
  ];
}

function findChromeExtensionPath(extensionId: string): string | undefined {
  for (const base of chromeExtensionsDirs()) {
    const extensionRoot = path.join(base, extensionId);
    if (!fs.existsSync(extensionRoot)) {
      continue;
    }

    const versions = fs
      .readdirSync(extensionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }),
      );

    const latest = versions[0];
    if (!latest) {
      continue;
    }

    return path.join(extensionRoot, latest);
  }

  return undefined;
}

const DEVTOOLS_DOCK_MODE = "right" as const;

function isDevToolsToggleShortcut(input: Input): boolean {
  if (input.type !== "keyDown") {
    return false;
  }

  if (input.key === "F12") {
    return true;
  }

  const key = input.key.toLowerCase();
  if (key !== "i") {
    return false;
  }

  // Chromium defaults: Ctrl+Shift+I (Linux/Windows), Cmd+Option+I (macOS).
  if (process.platform === "darwin") {
    return input.meta && input.alt;
  }

  return input.control && input.shift;
}

export function toggleDevTools(window: BrowserWindow): void {
  if (window.webContents.isDevToolsOpened()) {
    window.webContents.closeDevTools();
  } else {
    window.webContents.openDevTools({ mode: DEVTOOLS_DOCK_MODE });
  }
}

/** Register DevTools shortcuts when the app menu is hidden. */
export function registerDevToolsShortcuts(window: BrowserWindow): void {
  if (app.isPackaged) {
    return;
  }

  window.webContents.on("before-input-event", (_event, input) => {
    if (isDevToolsToggleShortcut(input)) {
      toggleDevTools(window);
    }
  });
}

export async function loadDevToolsExtensions(): Promise<void> {
  if (app.isPackaged) {
    return;
  }

  for (const { id, name, installUrl } of DEVTOOLS_EXTENSIONS) {
    const extensionPath = findChromeExtensionPath(id);
    if (!extensionPath) {
      console.warn(
        `${name} not found. Install it in Chrome (${installUrl}), then restart the app.`,
      );
      continue;
    }

    try {
      const extension =
        await session.defaultSession.extensions.loadExtension(extensionPath);
      console.log(`Loaded DevTools extension: ${extension.name}`);
    } catch (err) {
      console.error(`Failed to load ${name}:`, err);
    }
  }
}
