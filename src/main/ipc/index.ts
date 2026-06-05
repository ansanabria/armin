import { BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import * as decks from "../services/decks";
import * as cards from "../services/cards";
import * as review from "../services/review";
import * as graph from "../services/graph";
import * as settings from "../services/settings";

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

const id = z.object({ id: z.string() });

export function registerIpc() {
  // --- decks ---
  register("decks:list", z.void().optional(), () => decks.listDecks());
  register("decks:get", id, ({ id }) => decks.getDeck(id));
  register(
    "decks:create",
    z.object({ name: z.string().min(1), description: z.string().nullish() }),
    (input) => decks.createDeck(input),
  );
  register(
    "decks:update",
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().nullish(),
    }),
    ({ id, ...patch }) => decks.updateDeck(id, patch),
  );
  register("decks:delete", id, ({ id }) => {
    decks.deleteDeck(id);
    return { ok: true };
  });

  // --- cards ---
  register("cards:list", z.object({ deckId: z.string() }), ({ deckId }) =>
    cards.listCards(deckId),
  );
  register("cards:get", id, ({ id }) => cards.getCard(id));
  register(
    "cards:create",
    z.object({
      deckId: z.string(),
      front: z.string().min(1),
      back: z.string().min(1),
      type: z.string().optional(),
    }),
    (input) => cards.createCard(input),
  );
  register(
    "cards:update",
    z.object({
      id: z.string(),
      front: z.string().min(1).optional(),
      back: z.string().min(1).optional(),
      type: z.string().optional(),
    }),
    ({ id, ...patch }) => cards.updateCard(id, patch),
  );
  register("cards:delete", id, ({ id }) => {
    cards.deleteCard(id);
    return { ok: true };
  });

  // --- review ---
  register("review:queue", z.object({ deckId: z.string() }), ({ deckId }) =>
    review.getQueue(deckId),
  );
  register("review:preview", z.object({ cardId: z.string() }), ({ cardId }) =>
    review.previewCard(cardId),
  );
  register(
    "review:rate",
    z.object({ cardId: z.string(), rating: z.number().int().min(1).max(4) }),
    ({ cardId, rating }) => review.rateCard(cardId, rating as 1 | 2 | 3 | 4),
  );

  // --- graph ---
  register("graph:get", z.object({ deckId: z.string() }), ({ deckId }) =>
    graph.getDeckGraph(deckId),
  );
  register(
    "graph:addPrereq",
    z.object({ prereqId: z.string(), dependentId: z.string() }),
    ({ prereqId, dependentId }) => {
      graph.addPrereq(prereqId, dependentId);
      return { ok: true };
    },
  );
  register(
    "graph:removePrereq",
    z.object({ prereqId: z.string(), dependentId: z.string() }),
    ({ prereqId, dependentId }) => {
      graph.removePrereq(prereqId, dependentId);
      return { ok: true };
    },
  );

  // --- settings ---
  register("settings:get", z.void().optional(), () => settings.getSettings());
  register(
    "settings:update",
    z.object({
      requestRetention: z.number().optional(),
      maximumInterval: z.number().int().optional(),
      enableFuzz: z.boolean().optional(),
      enableShortTerm: z.boolean().optional(),
      learningSteps: z.string().optional(),
      relearningSteps: z.string().optional(),
      weights: z.string().nullish(),
    }),
    (patch) => settings.updateSettings(patch),
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
