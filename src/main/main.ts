import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { closeDb, initDb } from "./db";
import { runMigrations } from "./db/migrate";
import {
  loadDevToolsExtensions,
  registerDevToolsShortcuts,
} from "./devtools";
import { registerIpc } from "./ipc";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(isMac
      ? { titleBarStyle: "hiddenInset" as const }
      : {
          frame: false,
          ...(isLinux && { hasShadow: false }),
        }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  Menu.setApplicationMenu(null);

  const notifyMaximized = (maximized: boolean) => {
    mainWindow.webContents.send("shell:maximized", maximized);
  };
  mainWindow.on("maximize", () => notifyMaximized(true));
  mainWindow.on("unmaximize", () => notifyMaximized(false));

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    registerDevToolsShortcuts(mainWindow);
    mainWindow.webContents.openDevTools({ mode: "right" });
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  await loadDevToolsExtensions();
  await initDb();
  await runMigrations();
  registerIpc();
  createWindow();
});

app.on("quit", () => {
  closeDb();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
