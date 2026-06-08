import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { getDb, initDb } from "../db";
import { runMigrations } from "../db/migrate";
import { setActiveProfileId } from "../profiles/active";
import type { ServiceContext } from "../services/context";
import * as decks from "../services/decks";
import * as cards from "../services/cards";
import * as review from "../services/review";
import * as graph from "../services/graph";
import * as settings from "../services/settings";
import * as profiles from "../services/profiles";
import {
  getProfileIdForWebContents,
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
    async ({ id, name }) => {
      setActiveProfileId(id);
      await ensureDbReady(id);
      const profileName = name ?? profiles.getProfile(id)?.name;
      await openMainWindow(id, profileName);
      return { ok: true as const };
    },
  );
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

  // --- cards ---
  registerForProfile("cards:list", z.object({ deckId: z.string() }), (ctx, { deckId }) =>
    cards.listCards(ctx, deckId),
  );
  registerForProfile("cards:listAll", z.void().optional(), (ctx) =>
    cards.listAllCards(ctx),
  );
  registerForProfile("cards:get", id, (ctx, { id }) => cards.getCard(ctx, id));
  registerForProfile(
    "cards:create",
    z.object({
      deckId: z.string(),
      front: z.string().min(1),
      back: z.string().min(1),
      type: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    (ctx, input) => cards.createCard({ ctx, ...input }),
  );
  registerForProfile(
    "cards:update",
    z.object({
      id: z.string(),
      front: z.string().min(1).optional(),
      back: z.string().min(1).optional(),
      type: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    (ctx, { id, ...patch }) => cards.updateCard(ctx, id, patch),
  );
  registerForProfile("cards:delete", id, async (ctx, { id }) => {
    await cards.deleteCard(ctx, id);
    return { ok: true };
  });

  // --- review ---
  registerForProfile("review:queue", z.object({ deckId: z.string() }), (ctx, { deckId }) =>
    review.getQueue(ctx, deckId),
  );
  registerForProfile("review:queueAll", z.void().optional(), (ctx) =>
    review.getGlobalQueue(ctx),
  );
  registerForProfile("review:preview", z.object({ cardId: z.string() }), (ctx, { cardId }) =>
    review.previewCard(ctx, cardId),
  );
  registerForProfile(
    "review:rate",
    z.object({ cardId: z.string(), rating: z.number().int().min(1).max(4) }),
    (ctx, { cardId, rating }) =>
      review.rateCard(ctx, cardId, rating as 1 | 2 | 3 | 4),
  );

  // --- graph ---
  registerForProfile("graph:get", z.object({ deckId: z.string() }), (ctx, { deckId }) =>
    graph.getDeckGraph(ctx, deckId),
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
      newCardsPerDay: z.number().int().min(0).optional(),
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
