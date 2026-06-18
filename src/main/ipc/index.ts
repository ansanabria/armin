import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { getDb, initDb, deleteProfileData } from "../db";
import { runMigrations } from "../db/migrate";
import { setActiveProfileId } from "../profiles/active";
import type { ServiceContext } from "../services/context";
import * as decks from "../services/decks";
import * as flashcards from "../services/flashcards";
import * as browse from "../services/browse";
import { FLASHCARD_TYPES } from "../services/flashcard-types";
import { BROWSE_SORT_KEYS } from "../../shared/browse";
import * as review from "../services/review";
import * as graph from "../services/graph";
import * as settings from "../services/settings";
import * as mcp from "../services/mcp";
import * as profiles from "../services/profiles";
import { analyzeAnkiPackage, commitAnkiImport } from "../services/anki/import";
import {
  getProfileIdForWebContents,
  isProfileOpen,
  openMainWindow,
  openProfilePicker,
} from "../windows";

/** Notify all renderers that persisted data changed (e.g. via the MCP server). */
export function notifyDataChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("armin:data-changed");
  }
}

type Handler = (payload: unknown) => unknown;

function register<T extends z.ZodType>(
  channel: string,
  schema: T,
  handler: (input: z.infer<T>) => unknown,
) {
  const wrapped: Handler = (payload) => handler(schema.parse(payload));
  ipcMain.handle(channel, (_event, payload) => wrapped(payload));
}

function registerForProfile<T extends z.ZodType>(
  channel: string,
  schema: T,
  handler: (ctx: ServiceContext, input: z.infer<T>) => unknown,
) {
  ipcMain.handle(channel, async (event, payload) => {
    const ctx = await serviceContextForEvent(event);
    return handler(ctx, schema.parse(payload));
  });
}

const id = z.object({ id: z.string() });

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
  // --- profiles (local JSON store; per-profile data dirs come later) ---
  register("profiles:list", z.void().optional(), () => profiles.listProfiles());
  register(
    "profiles:create",
    z.object({ name: z.string().min(1) }),
    ({ name }) => profiles.createProfile(name),
  );
  register(
    "profiles:open",
    z.object({ id: z.string(), name: z.string().optional() }),
    ({ id, name }) => openProfile(id, name),
  );
  register("profiles:getDefault", z.void().optional(), () =>
    profiles.getDefaultProfileId(),
  );
  register("profiles:setDefault", id, ({ id }) => {
    profiles.setDefaultProfile(id);
    return { ok: true as const };
  });
  register("profiles:clearDefault", z.void().optional(), () => {
    profiles.clearDefaultProfile();
    return { ok: true as const };
  });
  register("profiles:delete", id, async ({ id }) => {
    if (isProfileOpen(id)) {
      throw new Error(
        "Close this profile's window before deleting it.",
      );
    }
    deleteProfileData(id);
    profiles.deleteProfile(id);
    dbReady.delete(id);
    return { ok: true as const };
  });
  register("profiles:showPicker", z.void().optional(), () => {
    openProfilePicker();
    return { ok: true as const };
  });

  // --- decks ---
  registerForProfile("decks:list", z.void().optional(), (ctx) =>
    decks.listDecks(ctx),
  );
  registerForProfile("decks:get", id, (ctx, { id }) => decks.getDeck(ctx, id));
  registerForProfile(
    "decks:create",
    z.object({ name: z.string().min(1), description: z.string().nullish() }),
    (ctx, input) => decks.createDeck(ctx, input),
  );
  registerForProfile(
    "decks:update",
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().nullish(),
    }),
    (ctx, { id, ...patch }) => decks.updateDeck(ctx, id, patch),
  );
  registerForProfile("decks:delete", id, async (ctx, { id }) => {
    await decks.deleteDeck(ctx, id);
    return { ok: true };
  });

  // --- flashcards (the authored unit) ---
  registerForProfile(
    "flashcards:list",
    z.object({ deckId: z.string() }),
    (ctx, { deckId }) => flashcards.listFlashcards(ctx, deckId),
  );
  registerForProfile("flashcards:listAll", z.void().optional(), (ctx) =>
    flashcards.listAllFlashcards(ctx),
  );
  registerForProfile(
    "flashcards:browse",
    z.object({
      offset: z.number().int().min(0),
      limit: z.number().int().min(1).max(100),
      sort: z.enum(BROWSE_SORT_KEYS),
      state: z.number().int().min(0).max(3).optional(),
      deckId: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    (ctx, input) => browse.listBrowsePage(ctx, input),
  );
  registerForProfile("flashcards:listTags", z.void().optional(), (ctx) =>
    browse.listAllTagNames(ctx),
  );
  registerForProfile(
    "flashcards:listDeckTags",
    z.object({ deckId: z.string() }),
    (ctx, { deckId }) => browse.listDeckTagNames(ctx, deckId),
  );
  registerForProfile("flashcards:get", id, (ctx, { id }) =>
    flashcards.getFlashcard(ctx, id),
  );
  registerForProfile("flashcards:deleteConsequences", id, (ctx, { id }) =>
    flashcards.getDeleteConsequences(ctx, id),
  );
  registerForProfile(
    "flashcards:create",
    z.object({
      deckId: z.string(),
      type: z.enum(FLASHCARD_TYPES),
      content: z.unknown(),
      tags: z.array(z.string()).optional(),
    }),
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
    "flashcards:update",
    z.object({
      id: z.string(),
      type: z.enum(FLASHCARD_TYPES).optional(),
      content: z.unknown().optional(),
      tags: z.array(z.string()).optional(),
    }),
    (ctx, { id, ...patch }) => flashcards.updateFlashcard(ctx, id, patch),
  );
  registerForProfile("flashcards:delete", id, async (ctx, { id }) => {
    await flashcards.deleteFlashcard(ctx, id);
    return { ok: true };
  });
  registerForProfile(
    "flashcards:archive",
    z.object({ id: z.string(), archived: z.boolean() }),
    async (ctx, { id, archived }) => {
      const flashcard = await flashcards.setArchived(ctx, id, archived);
      notifyDataChanged();
      return flashcard;
    },
  );

  // --- import ---
  register(
    "import:analyzeAnki",
    z.object({
      bytes: z.instanceof(Uint8Array),
      fileName: z.string(),
    }),
    ({ bytes, fileName }) => analyzeAnkiPackage(bytes, fileName),
  );
  registerForProfile(
    "import:commitAnki",
    z.object({
      importId: z.string(),
      deckName: z.string().min(1),
      keepScheduling: z.boolean(),
      deckStrategy: z.enum(["single", "separate"]),
    }),
    (ctx, input) => commitAnkiImport(ctx, input),
  );
  registerForProfile(
    "import:createDeckWithFlashcards",
    z.object({
      name: z.string().min(1),
      description: z.string().nullish(),
      flashcards: z
        .array(
          z.object({
            front: z.string().min(1),
            back: z.string().min(1),
            tags: z.array(z.string()).optional(),
          }),
        )
        .min(1),
    }),
    (ctx, input) => decks.createDeckWithFlashcards(ctx, input),
  );

  // --- review ---
  registerForProfile(
    "review:queue",
    z.object({ deckId: z.string() }),
    (ctx, { deckId }) => review.getQueue(ctx, deckId),
  );
  registerForProfile("review:queueAll", z.void().optional(), (ctx) =>
    review.getGlobalQueue(ctx),
  );
  registerForProfile(
    "review:preview",
    z.object({ reviewUnitId: z.string() }),
    (ctx, { reviewUnitId }) => review.previewReviewUnit(ctx, reviewUnitId),
  );
  registerForProfile(
    "review:rate",
    z.object({ reviewUnitId: z.string(), rating: z.number().int().min(1).max(4) }),
    (ctx, { reviewUnitId, rating }) =>
      review.rateReviewUnit(ctx, reviewUnitId, rating as 1 | 2 | 3 | 4),
  );
  registerForProfile(
    "review:undo",
    z.object({ reviewUnitId: z.string() }),
    async (ctx, { reviewUnitId }) => {
      const result = await review.undoReview(ctx, reviewUnitId);
      notifyDataChanged();
      return result;
    },
  );

  // --- graph ---
  registerForProfile(
    "graph:get",
    z.object({ deckId: z.string() }),
    (ctx, { deckId }) => graph.getDeckGraph(ctx, deckId),
  );
  registerForProfile(
    "graph:addPrereq",
    z.object({ prereqId: z.string(), dependentId: z.string() }),
    async (ctx, { prereqId, dependentId }) => {
      await graph.addPrereq(ctx, prereqId, dependentId);
      return { ok: true };
    },
  );
  registerForProfile(
    "graph:removePrereq",
    z.object({ prereqId: z.string(), dependentId: z.string() }),
    async (ctx, { prereqId, dependentId }) => {
      await graph.removePrereq(ctx, prereqId, dependentId);
      return { ok: true };
    },
  );
  registerForProfile(
    "graph:saveLayout",
    z.object({
      deckId: z.string(),
      placements: z.array(
        z.object({
          flashcardId: z.string(),
          x: z.number(),
          y: z.number(),
        }),
      ),
    }),
    async (ctx, { deckId, placements }) => {
      await graph.saveLayout(ctx, deckId, placements);
      return { ok: true };
    },
  );

  // --- mcp ---
  registerForProfile("mcp:getSetup", z.void().optional(), (ctx) =>
    mcp.getMcpSetup(ctx.profileId),
  );

  // --- settings ---
  registerForProfile("settings:get", z.void().optional(), (ctx) =>
    settings.getSettings(ctx),
  );
  registerForProfile(
    "settings:update",
    z.object({
      requestRetention: z.number().optional(),
      maximumInterval: z.number().int().optional(),
      enableFuzz: z.boolean().optional(),
      enableShortTerm: z.boolean().optional(),
      learningSteps: z.string().optional(),
      relearningSteps: z.string().optional(),
      weights: z.string().nullish(),
      prereqStabilityFloor: z.number().optional(),
      newReviewUnitsPerDay: z.number().int().min(0).optional(),
      keepSiblingReviewUnitsTogether: z.boolean().optional(),
    }),
    (ctx, patch) => settings.updateSettings(ctx, patch),
  );

  // --- shell (custom title bar controls) ---
  register("shell:minimize", z.void().optional(), () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
  });
  register("shell:maximize", z.void().optional(), () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { maximized: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { maximized: win.isMaximized() };
  });
  register("shell:close", z.void().optional(), () => {
    BrowserWindow.getFocusedWindow()?.close();
  });
  register("shell:isMaximized", z.void().optional(), () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });
}
