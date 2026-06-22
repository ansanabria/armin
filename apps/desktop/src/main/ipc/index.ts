import { readFile, writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { z } from "zod";
import { getDb, initDb, deleteProfileData } from "../db";
import { runMigrations } from "../db/migrate";
import { setActiveProfileId } from "../profiles/active";
import type { ServiceContext } from "../services/context";
import * as decks from "../services/decks";
import * as flashcards from "../services/flashcards";
import * as browse from "../services/browse";
import * as review from "../services/review";
import * as cram from "../services/cram";
import * as graph from "../services/graph";
import * as settings from "../services/settings";
import * as mcp from "../services/mcp";
import { getAppSettings, setMcpEnabled, setMcpPort } from "../services/app-settings";
import { startEmbeddedMcpServer, stopEmbeddedMcpServer } from "../mcp-http";
import * as profiles from "../services/profiles";
import { analyzeAnkiPackage, commitAnkiImport } from "../services/anki/import";
import { exportProfileToMarkdownZip } from "../services/export";
import { restoreProfileFromZip } from "../services/restore";
import {
  getProfileIdForWebContents,
  isProfileOpen,
  openMainWindow,
  openProfilePicker,
} from "../windows";
import {
  ipcCommands,
  ipcEvents,
  type IpcCommand,
} from "../../shared/ipc-command-catalog";

/** Notify all renderers that persisted data changed (e.g. via the MCP server). */
export function notifyDataChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(ipcEvents.dataChanged);
  }
}

type Handler = (payload: unknown) => unknown;

function register<T extends z.ZodType>(
  command: IpcCommand<T>,
  handler: (input: z.infer<T>) => unknown,
) {
  const wrapped: Handler = (payload) => handler(command.schema.parse(payload));
  ipcMain.handle(command.channel, (_event, payload) => wrapped(payload));
}

function registerForProfile<T extends z.ZodType>(
  command: IpcCommand<T>,
  handler: (ctx: ServiceContext, input: z.infer<T>) => unknown,
) {
  ipcMain.handle(command.channel, async (event, payload) => {
    const ctx = await serviceContextForEvent(event);
    return handler(ctx, command.schema.parse(payload));
  });
}

const dbReady = new Set<string>();

async function ensureDbReady(profileId: string) {
  if (dbReady.has(profileId)) return;
  await initDb(profileId);
  await runMigrations(profileId);
  dbReady.add(profileId);
}

async function serviceContextForEvent(
  event: IpcMainInvokeEvent,
): Promise<ServiceContext> {
  const profileId = getProfileIdForWebContents(event.sender.id);
  if (!profileId) {
    throw new Error("No active profile is associated with this window.");
  }
  await ensureDbReady(profileId);
  return { profileId, db: getDb(profileId) };
}

export async function openProfile(id: string, name?: string) {
  setActiveProfileId(id);
  await ensureDbReady(id);
  const profileName = name ?? profiles.getProfile(id)?.name;
  await openMainWindow(id, profileName);
  return { ok: true as const };
}

export function registerIpc() {
  const c = ipcCommands;

  // --- profiles (local JSON store; per-profile data dirs come later) ---
  register(c.profiles.list, () => profiles.listProfiles());
  register(
    c.profiles.create,
    ({ name }) => profiles.createProfile(name),
  );
  register(
    c.profiles.open,
    ({ id, name }) => openProfile(id, name),
  );
  register(c.profiles.getDefault, () => profiles.getDefaultProfileId());
  register(c.profiles.setDefault, ({ id }) => {
    profiles.setDefaultProfile(id);
    return { ok: true as const };
  });
  register(c.profiles.clearDefault, () => {
    profiles.clearDefaultProfile();
    return { ok: true as const };
  });
  register(c.profiles.delete, async ({ id }) => {
    if (isProfileOpen(id)) {
      throw new Error("Close this profile's window before deleting it.");
    }
    deleteProfileData(id);
    profiles.deleteProfile(id);
    dbReady.delete(id);
    return { ok: true as const };
  });
  register(c.profiles.showPicker, () => {
    openProfilePicker();
    return { ok: true as const };
  });

  // --- decks ---
  registerForProfile(c.decks.list, (ctx) => decks.listDecks(ctx));
  registerForProfile(c.decks.get, (ctx, { id }) => decks.getDeck(ctx, id));
  registerForProfile(c.decks.create, (ctx, input) =>
    decks.createDeck(ctx, input),
  );
  registerForProfile(c.decks.update, (ctx, { id, ...patch }) =>
    decks.updateDeck(ctx, id, patch),
  );
  registerForProfile(c.decks.delete, async (ctx, { id }) => {
    await decks.deleteDeck(ctx, id);
    return { ok: true };
  });

  // --- flashcards (the authored unit) ---
  registerForProfile(
    c.flashcards.list,
    (ctx, { deckId }) => flashcards.listFlashcards(ctx, deckId),
  );
  registerForProfile(c.flashcards.listAll, (ctx) =>
    flashcards.listAllFlashcards(ctx),
  );
  registerForProfile(
    c.flashcards.browse,
    (ctx, input) => browse.listBrowsePage(ctx, input),
  );
  registerForProfile(c.flashcards.listTags, (ctx) =>
    browse.listAllTagNames(ctx),
  );
  registerForProfile(
    c.flashcards.listDeckTags,
    (ctx, { deckId }) => browse.listDeckTagNames(ctx, deckId),
  );
  registerForProfile(c.flashcards.get, (ctx, { id }) =>
    flashcards.getFlashcard(ctx, id),
  );
  registerForProfile(c.flashcards.deleteConsequences, (ctx, { id }) =>
    flashcards.getDeleteConsequences(ctx, id),
  );
  registerForProfile(
    c.flashcards.create,
    (ctx, input) =>
      flashcards.createFlashcard({
        ctx,
        deckId: input.deckId,
        type: input.type,
        content: input.content,
        tags: input.tags,
      }),
  );
  registerForProfile(
    c.flashcards.update,
    (ctx, { id, ...patch }) => flashcards.updateFlashcard(ctx, id, patch),
  );
  registerForProfile(c.flashcards.delete, async (ctx, { id }) => {
    await flashcards.deleteFlashcard(ctx, id);
    return { ok: true };
  });
  registerForProfile(
    c.flashcards.archive,
    async (ctx, { id, archived }) => {
      const flashcard = await flashcards.setArchived(ctx, id, archived);
      notifyDataChanged();
      return flashcard;
    },
  );

  // --- import ---
  register(
    c.import.analyzeAnki,
    ({ bytes, fileName }) => analyzeAnkiPackage(bytes, fileName),
  );
  registerForProfile(
    c.import.commitAnki,
    (ctx, input) => commitAnkiImport(ctx, input),
  );
  registerForProfile(
    c.import.createDeckWithFlashcards,
    (ctx, input) => decks.createDeckWithFlashcards(ctx, input),
  );

  // --- data export / restore ---
  ipcMain.handle(c.data.export.channel, async (event, payload) => {
    c.data.export.schema.parse(payload);
    const ctx = await serviceContextForEvent(event);
    const profileName = profiles.getProfile(ctx.profileId)?.name ?? "Armin";
    const { fileName, bytes, deckCount, flashcardCount } =
      await exportProfileToMarkdownZip(ctx, profileName);

    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Export & back up library",
      defaultPath: fileName,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return { canceled: true as const };
    }

    await writeFile(result.filePath, bytes);
    return {
      canceled: false as const,
      path: result.filePath,
      deckCount,
      flashcardCount,
    };
  });

  // Restore runs from the profile-picker window, which has no profile context:
  // it creates a brand-new profile from the chosen backup archive.
  ipcMain.handle(c.data.restore.channel, async (event, payload) => {
    c.data.restore.schema.parse(payload);
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Restore from backup",
      properties: ["openFile" as const],
      filters: [{ name: "Armin backup", extensions: ["zip"] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true as const };
    }

    const bytes = await readFile(picked.filePaths[0]);
    const { profile, deckCount, flashcardCount } = await restoreProfileFromZip(
      new Uint8Array(bytes),
    );
    return {
      canceled: false as const,
      profile,
      deckCount,
      flashcardCount,
    };
  });

  // --- review ---
  registerForProfile(
    c.review.queue,
    (ctx, { deckId }) => review.getQueue(ctx, deckId),
  );
  registerForProfile(c.review.queueAll, (ctx) =>
    review.getGlobalQueue(ctx),
  );
  registerForProfile(
    c.review.preview,
    (ctx, { reviewUnitId }) => review.previewReviewUnit(ctx, reviewUnitId),
  );
  registerForProfile(
    c.review.rate,
    (ctx, { reviewUnitId, rating }) =>
      review.rateReviewUnit(ctx, reviewUnitId, rating as 1 | 2 | 3 | 4),
  );
  registerForProfile(
    c.review.undo,
    async (ctx, { reviewUnitId }) => {
      const result = await review.undoReview(ctx, reviewUnitId);
      notifyDataChanged();
      return result;
    },
  );

  // --- cram ---
  registerForProfile(c.cram.pool, (ctx, scope) => cram.getCramPool(ctx, scope));

  // --- graph ---
  registerForProfile(c.graph.getGlobal, (ctx) =>
    graph.getGlobalGraph(ctx),
  );
  registerForProfile(
    c.graph.addPrereq,
    async (ctx, { prereqId, dependentId }) => {
      await graph.addPrereq(ctx, prereqId, dependentId);
      return { ok: true };
    },
  );
  registerForProfile(
    c.graph.removePrereq,
    async (ctx, { prereqId, dependentId }) => {
      await graph.removePrereq(ctx, prereqId, dependentId);
      return { ok: true };
    },
  );
  registerForProfile(
    c.graph.saveLayout,
    async (ctx, { placements }) => {
      await graph.saveGlobalLayout(ctx, placements);
      return { ok: true };
    },
  );

  // --- mcp ---
  registerForProfile(c.mcp.getSetup, (ctx) =>
    mcp.getMcpSetup(ctx.profileId),
  );
  register(c.mcp.getEnabled, () => getAppSettings().mcpEnabled);
  register(
    c.mcp.setEnabled,
    async ({ enabled }) => {
      // Apply the server change first, then persist — so a failed bind (e.g.
      // the port is in use) never leaves mcpEnabled=true on disk, which would
      // make the next launch try to start a server the user couldn't enable.
      if (enabled) await startEmbeddedMcpServer();
      else stopEmbeddedMcpServer();
      setMcpEnabled(enabled);
      return { enabled };
    },
  );
  register(c.mcp.getStatus, () => mcp.getMcpStatus());
  register(c.mcp.getPort, () => mcp.getMcpPort());
  register(
    c.mcp.setPort,
    async ({ port }) => {
      setMcpPort(port);
      if (getAppSettings().mcpEnabled) {
        stopEmbeddedMcpServer();
        await startEmbeddedMcpServer();
      }
      return mcp.getMcpStatus();
    },
  );
  register(c.mcp.retry, async () => {
    await startEmbeddedMcpServer();
    return mcp.getMcpStatus();
  });

  // --- settings ---
  registerForProfile(c.settings.get, (ctx) =>
    settings.getSettings(ctx),
  );
  registerForProfile(
    c.settings.update,
    (ctx, patch) => settings.updateSettings(ctx, patch),
  );
  registerForProfile(
    c.settings.getDeck,
    (ctx, { deckId }) => settings.getDeckSettings(ctx, deckId),
  );
  registerForProfile(
    c.settings.updateDeck,
    (ctx, { deckId, patch }) => settings.updateDeckSettings(ctx, deckId, patch),
  );

  // --- shell (custom title bar controls) ---
  register(c.shell.minimize, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
  });
  register(c.shell.maximize, () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { maximized: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { maximized: win.isMaximized() };
  });
  register(c.shell.close, () => {
    BrowserWindow.getFocusedWindow()?.close();
  });
  register(c.shell.isMaximized, () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });
}
