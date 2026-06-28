import { contextBridge, ipcRenderer } from "electron";
import type { ArminApi, ArminShell } from "../shared/armin-api";
import {
  ipcChannels,
  ipcEvents,
  type IpcChannel,
} from "../shared/ipc-channels";

const invoke = (command: IpcChannel, payload?: unknown) =>
  ipcRenderer.invoke(command.channel, payload);

const channels = ipcChannels;

function currentProfileId() {
  const prefix = "--armin-profile-id=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return null;
  return decodeURIComponent(arg.slice(prefix.length));
}

const profileId = currentProfileId();
const mediaRefRe =
  /^armin-media:([a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif))$/;

function mediaUrl(ref: string) {
  const match = ref.match(mediaRefRe);
  if (!match || !profileId) return ref;
  return `armin-media://${encodeURIComponent(profileId)}/${match[1]}`;
}

function mediaRefFromUrl(url: string) {
  if (!profileId) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "armin-media:") return null;
    if (decodeURIComponent(parsed.hostname) !== profileId) return null;

    const fileName = parsed.pathname.replace(/^\//, "");
    if (!/^[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif)$/.test(fileName)) {
      return null;
    }

    return `armin-media:${fileName}`;
  } catch {
    return null;
  }
}

const api = {
  profiles: {
    list: () => invoke(channels.profiles.list),
    create: (name: string) => invoke(channels.profiles.create, { name }),
    open: (id: string, name?: string) =>
      invoke(channels.profiles.open, { id, name }),
    getDefault: () => invoke(channels.profiles.getDefault),
    setDefault: (id: string) => invoke(channels.profiles.setDefault, { id }),
    clearDefault: () => invoke(channels.profiles.clearDefault),
    delete: (id: string) => invoke(channels.profiles.delete, { id }),
    showPicker: () => invoke(channels.profiles.showPicker),
  },
  decks: {
    list: () => invoke(channels.decks.list),
    get: (id: string) => invoke(channels.decks.get, { id }),
    create: (input: unknown) => invoke(channels.decks.create, input),
    update: (input: unknown) => invoke(channels.decks.update, input),
    delete: (id: string) => invoke(channels.decks.delete, { id }),
  },
  flashcards: {
    list: (deckId: string) => invoke(channels.flashcards.list, { deckId }),
    listAll: () => invoke(channels.flashcards.listAll),
    browse: (input: unknown) => invoke(channels.flashcards.browse, input),
    listTags: () => invoke(channels.flashcards.listTags),
    listDeckTags: (deckId: string) =>
      invoke(channels.flashcards.listDeckTags, { deckId }),
    get: (id: string) => invoke(channels.flashcards.get, { id }),
    deleteConsequences: (id: string) =>
      invoke(channels.flashcards.deleteConsequences, { id }),
    moveConsequences: (id: string) =>
      invoke(channels.flashcards.moveConsequences, { id }),
    create: (input: unknown) => invoke(channels.flashcards.create, input),
    update: (input: unknown) => invoke(channels.flashcards.update, input),
    delete: (id: string) => invoke(channels.flashcards.delete, { id }),
    archive: (id: string, archived: boolean) =>
      invoke(channels.flashcards.archive, { id, archived }),
    move: (id: string, targetDeckId: string) =>
      invoke(channels.flashcards.move, { id, targetDeckId }),
  },
  review: {
    queue: (deckId: string) => invoke(channels.review.queue, { deckId }),
    queueAll: () => invoke(channels.review.queueAll),
    preview: (reviewUnitId: string) =>
      invoke(channels.review.preview, { reviewUnitId }),
    rate: (reviewUnitId: string, rating: number) =>
      invoke(channels.review.rate, { reviewUnitId, rating }),
    undo: (reviewUnitId: string) =>
      invoke(channels.review.undo, { reviewUnitId }),
  },
  cram: {
    pool: (input: unknown) => invoke(channels.cram.pool, input),
  },
  graph: {
    getDeck: (deckId: string) => invoke(channels.graph.getDeck, { deckId }),
    addPrereq: (prereqId: string, dependentId: string) =>
      invoke(channels.graph.addPrereq, { prereqId, dependentId }),
    removePrereq: (prereqId: string, dependentId: string) =>
      invoke(channels.graph.removePrereq, { prereqId, dependentId }),
    saveLayout: (
      deckId: string,
      placements: { flashcardId: string; x: number; y: number }[],
    ) => invoke(channels.graph.saveLayout, { deckId, placements }),
  },
  settings: {
    get: () => invoke(channels.settings.get),
    update: (patch: unknown) => invoke(channels.settings.update, patch),
    getDeck: (deckId: string) => invoke(channels.settings.getDeck, { deckId }),
    updateDeck: (deckId: string, patch: unknown) =>
      invoke(channels.settings.updateDeck, { deckId, patch }),
  },
  mcp: {
    getSetup: () => invoke(channels.mcp.getSetup),
    getEnabled: () => invoke(channels.mcp.getEnabled),
    setEnabled: (enabled: boolean) =>
      invoke(channels.mcp.setEnabled, { enabled }),
    getStatus: () => invoke(channels.mcp.getStatus),
    getPort: () => invoke(channels.mcp.getPort),
    setPort: (port: number) => invoke(channels.mcp.setPort, { port }),
    retry: () => invoke(channels.mcp.retry),
  },
  import: {
    analyzeAnki: (bytes: Uint8Array, fileName: string) =>
      invoke(channels.import.analyzeAnki, { bytes, fileName }),
    commitAnki: (input: unknown) => invoke(channels.import.commitAnki, input),
    createDeckWithFlashcards: (input: unknown) =>
      invoke(channels.import.createDeckWithFlashcards, input),
  },
  data: {
    export: () => invoke(channels.data.export),
    restore: () => invoke(channels.data.restore),
  },
  media: {
    importImage: (input: unknown) => invoke(channels.media.importImage, input),
    url: mediaUrl,
    refFromUrl: mediaRefFromUrl,
  },
  onDataChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(ipcEvents.dataChanged, listener);
    return () => ipcRenderer.removeListener(ipcEvents.dataChanged, listener);
  },
} satisfies ArminApi;

contextBridge.exposeInMainWorld("armin", api);
contextBridge.exposeInMainWorld(
  "__ARMIN_E2E__",
  process.argv.includes("--armin-e2e") || process.env.ARMIN_E2E === "1",
);

const shell = {
  platform: process.platform,
  minimize: () => invoke(channels.shell.minimize),
  maximize: () => invoke(channels.shell.maximize),
  close: () => invoke(channels.shell.close),
  isMaximized: () => invoke(channels.shell.isMaximized),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on(ipcEvents.shellMaximized, listener);
    return () => ipcRenderer.removeListener(ipcEvents.shellMaximized, listener);
  },
} satisfies ArminShell;

contextBridge.exposeInMainWorld("arminShell", shell);
