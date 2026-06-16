import { app, BrowserWindow, session } from "electron";
import started from "electron-squirrel-startup";
import { closeDb } from "./db";
import { loadDevToolsExtensions } from "./devtools";
import { applyLinuxDesktopEntry } from "./icon";
import { registerIpc } from "./ipc";
import { startEmbeddedMcpServer, stopEmbeddedMcpServer } from "./mcp-http";
import { openProfilePicker } from "./windows";

if (process.env.ARMIN_DATA_DIR) {
  app.setPath("userData", process.env.ARMIN_DATA_DIR);
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  applyLinuxDesktopEntry();
  session.defaultSession.setSpellCheckerEnabled(false);
  registerIpc();
  await startEmbeddedMcpServer();
  await loadDevToolsExtensions();
  openProfilePicker();
});

app.on("quit", () => {
  stopEmbeddedMcpServer();
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
    openProfilePicker();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
