import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { loadDevToolsExtensions, registerDevToolsShortcuts } from "../devtools";
import { attachWindowIcon, getAppIcon } from "../icon";

let profilePickerWindow: BrowserWindow | null = null;
const profileWindows = new Map<string, BrowserWindow>();
let devToolsExtensionsLoaded = false;

export function getProfileIdForWebContents(webContentsId: number) {
  for (const [profileId, win] of profileWindows) {
    if (!win.isDestroyed() && win.webContents.id === webContentsId) {
      return profileId;
    }
  }
  return null;
}

export function getMainWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    for (const win of profileWindows.values()) {
      if (win === focused) return win;
    }
  }
  return profileWindows.values().next().value ?? null;
}

export function getProfilePickerWindow() {
  return profilePickerWindow;
}

function hasOpenMainWindows() {
  for (const win of profileWindows.values()) {
    if (!win.isDestroyed()) return true;
  }
  return false;
}

function shellOptions() {
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  return { isMac, isLinux };
}

function loadProfilePicker(win: BrowserWindow) {
  if (PROFILE_PICKER_VITE_DEV_SERVER_URL) {
    win.loadURL(`${PROFILE_PICKER_VITE_DEV_SERVER_URL}/profile-picker.html`);
  } else {
    win.loadFile(
      path.join(
        __dirname,
        `../renderer/${PROFILE_PICKER_VITE_NAME}/profile-picker.html`,
      ),
    );
  }
}

function loadMain(win: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function wireMainWindowEvents(win: BrowserWindow) {
  const notifyMaximized = (maximized: boolean) => {
    win.webContents.send("shell:maximized", maximized);
  };
  win.on("maximize", () => notifyMaximized(true));
  win.on("unmaximize", () => notifyMaximized(false));
}

export function openProfilePicker() {
  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    profilePickerWindow.focus();
    return profilePickerWindow;
  }

  const { isMac, isLinux } = shellOptions();

  profilePickerWindow = new BrowserWindow({
    width: 420,
    height: 500,
    minWidth: 420,
    minHeight: 500,
    maxWidth: 420,
    maxHeight: 500,
    center: true,
    resizable: false,
    show: false,
    icon: getAppIcon(),
    ...(isMac
      ? { titleBarStyle: "hiddenInset" as const }
      : {
          frame: false,
          ...(isLinux && { hasShadow: false }),
        }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,
    },
  });
  attachWindowIcon(profilePickerWindow);

  profilePickerWindow.once("ready-to-show", () => {
    const picker = profilePickerWindow;
    try {
      if (picker && !picker.isDestroyed()) picker.show();
    } catch {
      // Window torn down while ready-to-show was queued (e.g. dev server stop).
    }
  });

  profilePickerWindow.on("closed", () => {
    profilePickerWindow = null;
    if (!hasOpenMainWindows()) {
      app.quit();
    }
  });

  Menu.setApplicationMenu(null);
  loadProfilePicker(profilePickerWindow);

  if (!app.isPackaged) {
    registerDevToolsShortcuts(profilePickerWindow);
  }

  return profilePickerWindow;
}

export async function openMainWindow(profileId: string, profileName?: string) {
  const existing = profileWindows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const { isMac, isLinux } = shellOptions();
  const isFirstMainWindow = !hasOpenMainWindows();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: getAppIcon(),
    title: profileName ? `${profileName} — Armin` : "Armin",
    ...(isMac
      ? { titleBarStyle: "hiddenInset" as const }
      : {
          frame: false,
          ...(isLinux && { hasShadow: false }),
        }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,
    },
  });
  attachWindowIcon(win);

  profileWindows.set(profileId, win);

  win.once("ready-to-show", () => {
    try {
      if (!win.isDestroyed()) win.show();
    } catch {
      // Window torn down while ready-to-show was queued (e.g. dev server stop).
    }
  });

  win.on("closed", () => {
    profileWindows.delete(profileId);
  });

  Menu.setApplicationMenu(null);
  wireMainWindowEvents(win);
  loadMain(win);

  if (!app.isPackaged) {
    if (!devToolsExtensionsLoaded) {
      await loadDevToolsExtensions();
      devToolsExtensionsLoaded = true;
    }
    registerDevToolsShortcuts(win);
    if (isFirstMainWindow) {
      win.webContents.openDevTools({ mode: "right" });
    }
  }

  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    profilePickerWindow.close();
    profilePickerWindow = null;
  }

  return win;
}
