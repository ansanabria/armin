import {
  app,
  session,
  type BrowserWindow,
  type Event,
  type Extension,
  type Input,
} from "electron";
import { REACT_DEVELOPER_TOOLS } from "electron-devtools-installer";
import { downloadChromeExtension } from "electron-devtools-installer/dist/downloadChromeExtension";

const DEVTOOLS_DOCK_MODE = "right" as const;

let devToolsExtensionsLoaded = false;

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

/** MV3 DevTools extensions need their service worker started explicitly in Electron. */
async function startExtensionServiceWorker(extension: Extension): Promise<void> {
  const manifest = extension.manifest as {
    manifest_version?: number;
    background?: { service_worker?: string };
  };

  if (
    manifest.manifest_version !== 3 ||
    !manifest.background?.service_worker
  ) {
    return;
  }

  await session.defaultSession.serviceWorkers.startWorkerForScope(
    extension.url,
  );
}

async function installDevToolsExtension(
  chromeStoreId: string,
  loadExtensionOptions: { allowFileAccess: boolean },
): Promise<Extension> {
  const extensions = session.defaultSession.extensions;
  const installed = extensions
    .getAllExtensions()
    .find((extension) => extension.id === chromeStoreId);
  if (installed) {
    return installed;
  }

  const extensionFolder = await downloadChromeExtension(chromeStoreId);
  return extensions.loadExtension(extensionFolder, loadExtensionOptions);
}

function waitForExtensionReady(extensionId: string): Promise<Extension> {
  const existing = session.defaultSession.extensions.getExtension(extensionId);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for extension ${extensionId}`));
    }, 10_000);

    const onReady = (_event: Event, extension: Extension) => {
      if (extension.id !== extensionId) {
        return;
      }
      cleanup();
      resolve(extension);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      session.defaultSession.extensions.off("extension-ready", onReady);
    };

    session.defaultSession.extensions.on("extension-ready", onReady);
  });
}

export async function loadDevToolsExtensions(): Promise<void> {
  if (app.isPackaged || devToolsExtensionsLoaded) {
    return;
  }

  devToolsExtensionsLoaded = true;

  try {
    const extensionId = REACT_DEVELOPER_TOOLS.id;
    const readyPromise = waitForExtensionReady(extensionId);
    const extension = await installDevToolsExtension(REACT_DEVELOPER_TOOLS.id, {
      allowFileAccess: true,
    });
    const readyExtension = await readyPromise.catch(() => extension);
    try {
      await startExtensionServiceWorker(readyExtension);
    } catch (err) {
      console.warn(
        "React DevTools service worker did not start; reload the window if the Components tab is missing.",
        err,
      );
    }
    console.log(`Loaded DevTools extension: ${readyExtension.name}`);
  } catch (err) {
    console.error("Failed to load React Developer Tools:", err);
  }
}
