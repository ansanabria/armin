import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { registerWindowShortcuts } from "../devtools";
import { attachWindowIcon, getAppIcon } from "../icon";
import { clearMcpSession, writeMcpSession } from "../../shared/mcp-session";

let profilePickerWindow: BrowserWindow | null = null;
const profileWindows = new Map<string, BrowserWindow>();
const profileNames = new Map<string, string>();

export function getProfileIdForWebContents(webContentsId: number) {
  for (const [profileId, win] of profileWindows) {
    if (!win.isDestroyed() && win.webContents.id === webContentsId) {
      return profileId;
    }
  }
  return null;
}

function dismissProfilePicker() {
  if (!profilePickerWindow || profilePickerWindow.isDestroyed()) return;
  profilePickerWindow.hide();
  profilePickerWindow.close();
  profilePickerWindow = null;
}

function hasOpenMainWindows() {
  for (const win of profileWindows.values()) {
    if (!win.isDestroyed()) return true;
  }
  return false;
}

export function isProfileOpen(profileId: string): boolean {
  const win = profileWindows.get(profileId);
  return win != null && !win.isDestroyed();
}

export function getOpenProfilesForMcp() {
  return [...profileWindows]
    .filter(([, win]) => !win.isDestroyed())
    .map(([id]) => ({ id, name: profileNames.get(id) }));
}

export function getActiveProfileIdForMcp() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    for (const [profileId, win] of profileWindows) {
      if (win === focused) return profileId;
    }
  }
  if (profileWindows.size !== 1) return null;
  return profileWindows.keys().next().value ?? null;
}

function publishMcpSession(activeProfileId: string | null) {
  const openProfiles = getOpenProfilesForMcp();
  if (openProfiles.length === 0) {
    clearMcpSession(app.getPath("userData"));
    return;
  }

  writeMcpSession(app.getPath("userData"), openProfiles, activeProfileId);
}

function publishAnyOpenProfileForMcp() {
  for (const [profileId, win] of profileWindows) {
    if (!win.isDestroyed()) {
      publishMcpSession(profileId);
      return;
    }
  }
  clearMcpSession(app.getPath("userData"));
}

function windowFrameOptions() {
  if (process.platform === "darwin") {
    return { titleBarStyle: "hiddenInset" as const };
  }

  return {
    frame: false,
    ...(process.platform === "linux" && { hasShadow: false }),
  };
}

function rendererWebPreferences(profileId?: string) {
  const additionalArguments: string[] = [];
  if (process.env.ARMIN_E2E === "1") {
    additionalArguments.push("--armin-e2e");
  }
  if (profileId) {
    additionalArguments.push(
      `--armin-profile-id=${encodeURIComponent(profileId)}`,
    );
  }

  return {
    preload: path.join(__dirname, "preload.js"),
    spellcheck: false,
    additionalArguments,
  };
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

function showWhenReady(win: BrowserWindow) {
  win.once("ready-to-show", () => {
    try {
      if (!win.isDestroyed()) win.show();
    } catch {
      // Window torn down while ready-to-show was queued (e.g. dev server stop).
    }
  });
}

export function openProfilePicker() {
  if (profilePickerWindow && !profilePickerWindow.isDestroyed()) {
    profilePickerWindow.focus();
    return profilePickerWindow;
  }

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
    ...windowFrameOptions(),
    webPreferences: rendererWebPreferences(),
  });
  attachWindowIcon(profilePickerWindow);
  showWhenReady(profilePickerWindow);

  profilePickerWindow.on("closed", () => {
    profilePickerWindow = null;
    if (!hasOpenMainWindows()) {
      app.quit();
    }
  });

  Menu.setApplicationMenu(null);
  loadProfilePicker(profilePickerWindow);

  registerWindowShortcuts(profilePickerWindow);

  return profilePickerWindow;
}

export async function openMainWindow(profileId: string, profileName?: string) {
  dismissProfilePicker();

  const existing = profileWindows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: getAppIcon(),
    title: profileName ? `${profileName} — Armin` : "Armin",
    ...windowFrameOptions(),
    webPreferences: rendererWebPreferences(profileId),
  });
  attachWindowIcon(win);

  profileWindows.set(profileId, win);
  if (profileName) profileNames.set(profileId, profileName);
  publishMcpSession(profileId);

  showWhenReady(win);

  win.on("closed", () => {
    profileWindows.delete(profileId);
    profileNames.delete(profileId);
    publishAnyOpenProfileForMcp();
  });
  win.on("focus", () => publishMcpSession(profileId));

  Menu.setApplicationMenu(null);
  wireMainWindowEvents(win);
  loadMain(win);

  registerWindowShortcuts(win);

  return win;
}
