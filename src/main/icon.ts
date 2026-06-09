import {
  app,
  nativeImage,
  type BrowserWindow,
  type NativeImage,
} from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LINUX_ICON_NAMES = ["icon-256.png", "icon-512.png", "icon.png"] as const;

function iconSearchDirs(): string[] {
  const dirs: string[] = [];

  if (app.isPackaged) {
    dirs.push(path.join(process.resourcesPath, "icons"));
  }

  dirs.push(path.join(app.getAppPath(), "assets/icons"));
  dirs.push(path.join(process.cwd(), "assets/icons"));

  // electron-forge dev bundles main to .vite/build/main.js
  if (typeof __dirname !== "undefined") {
    dirs.push(path.normalize(path.join(__dirname, "../../assets/icons")));
  }

  return [...new Set(dirs)];
}

function resolveIconPath(): string | undefined {
  const names =
    process.platform === "linux"
      ? LINUX_ICON_NAMES
      : process.platform === "win32"
        ? ["icon.ico"]
        : ["icon.icns"];

  for (const dir of iconSearchDirs()) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

let cachedIcon: NativeImage | undefined;

/** Loaded app icon for Linux/Windows window chrome and switchers. */
export function getAppIcon(): NativeImage | undefined {
  if (cachedIcon && !cachedIcon.isEmpty()) return cachedIcon;

  const iconPath = resolveIconPath();
  if (!iconPath) return undefined;

  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return undefined;

  cachedIcon = image;
  return image;
}

/**
 * GNOME/KDE on Wayland match running windows to a .desktop file by app id /
 * StartupWMClass. Install a dev entry so Alt+Tab can resolve our icon.
 */
export function applyLinuxDesktopEntry(): void {
  if (process.platform !== "linux" || app.isPackaged) return;

  const iconPath = resolveIconPath();
  if (!iconPath) return;

  const desktopDir = path.join(
    app.getPath("home"),
    ".local/share/applications",
  );
  const desktopFile = path.join(desktopDir, "armin.desktop");
  const content = `[Desktop Entry]
Version=1.0
Type=Application
Name=Armin
GenericName=Flashcards
Comment=Spaced repetition flashcards
Icon=${iconPath}
StartupWMClass=armin
Terminal=false
Categories=Education;Office;
`;

  fs.mkdirSync(desktopDir, { recursive: true });
  const previous = fs.existsSync(desktopFile)
    ? fs.readFileSync(desktopFile, "utf8")
    : "";
  if (previous === content) return;

  fs.writeFileSync(desktopFile, content);
  spawnSync("update-desktop-database", [desktopDir], { stdio: "ignore" });
}

function safeSetIcon(win: BrowserWindow, icon: NativeImage): void {
  try {
    if (!win.isDestroyed()) win.setIcon(icon);
  } catch {
    // Window can be torn down while ready-to-show is still queued (e.g. dev quit).
  }
}

/** Apply icon to a window (needed for Linux task switchers, especially Wayland). */
export function attachWindowIcon(win: BrowserWindow): void {
  if (process.platform !== "linux" && process.platform !== "win32") return;

  const icon = getAppIcon();
  if (!icon) return;

  safeSetIcon(win, icon);
  win.once("ready-to-show", () => {
    safeSetIcon(win, icon);
  });
}
