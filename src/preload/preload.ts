import { contextBridge, ipcRenderer } from "electron";
import type { ArminApi, ArminShell } from "../shared/armin-api";
import {
  ipcChannels,
  ipcEvents,
  type IpcChannel,
} from "../shared/ipc-channels";

const invoke = (command: IpcChannel, payload?: unknown) =>
  ipcRenderer.invoke(command.channel, payload);

const c = ipcChannels;

const api = {
  profiles: {
    list: () => invoke(c.profiles.list),
    create: (name: string) => invoke(c.profiles.create, { name }),
    open: (id: string, name?: string) => invoke(c.profiles.open, { id, name }),
    getDefault: () => invoke(c.profiles.getDefault),
    setDefault: (id: string) => invoke(c.profiles.setDefault, { id }),
    clearDefault: () => invoke(c.profiles.clearDefault),
    delete: (id: string) => invoke(c.profiles.delete, { id }),
    showPicker: () => invoke(c.profiles.showPicker),
  },
  decks: {
    list: () => invoke(c.decks.list),
    get: (id: string) => invoke(c.decks.get, { id }),
    create: (input: unknown) => invoke(c.decks.create, input),
    update: (input: unknown) => invoke(c.decks.update, input),
    delete: (id: string) => invoke(c.decks.delete, { id }),
  },
  flashcards: {
    list: (deckId: string) => invoke(c.flashcards.list, { deckId }),
    listAll: () => invoke(c.flashcards.listAll),
    browse: (input: unknown) => invoke(c.flashcards.browse, input),
    listTags: () => invoke(c.flashcards.listTags),
    listDeckTags: (deckId: string) =>
      invoke(c.flashcards.listDeckTags, { deckId }),
    get: (id: string) => invoke(c.flashcards.get, { id }),
    deleteConsequences: (id: string) =>
      invoke(c.flashcards.deleteConsequences, { id }),
    create: (input: unknown) => invoke(c.flashcards.create, input),
    update: (input: unknown) => invoke(c.flashcards.update, input),
    delete: (id: string) => invoke(c.flashcards.delete, { id }),
    archive: (id: string, archived: boolean) =>
      invoke(c.flashcards.archive, { id, archived }),
  },
  review: {
    queue: (deckId: string) => invoke(c.review.queue, { deckId }),
    queueAll: () => invoke(c.review.queueAll),
    preview: (reviewUnitId: string) =>
      invoke(c.review.preview, { reviewUnitId }),
    rate: (reviewUnitId: string, rating: number) =>
      invoke(c.review.rate, { reviewUnitId, rating }),
    undo: (reviewUnitId: string) => invoke(c.review.undo, { reviewUnitId }),
  },
  graph: {
    getGlobal: () => invoke(c.graph.getGlobal, {}),
    addPrereq: (prereqId: string, dependentId: string) =>
      invoke(c.graph.addPrereq, { prereqId, dependentId }),
    removePrereq: (prereqId: string, dependentId: string) =>
      invoke(c.graph.removePrereq, { prereqId, dependentId }),
    saveLayout: (placements: { flashcardId: string; x: number; y: number }[]) =>
      invoke(c.graph.saveLayout, { placements }),
  },
  settings: {
    get: () => invoke(c.settings.get),
    update: (patch: unknown) => invoke(c.settings.update, patch),
    getDeck: (deckId: string) => invoke(c.settings.getDeck, { deckId }),
    updateDeck: (deckId: string, patch: unknown) =>
      invoke(c.settings.updateDeck, { deckId, patch }),
  },
  mcp: {
    getSetup: () => invoke(c.mcp.getSetup),
    getEnabled: () => invoke(c.mcp.getEnabled),
    setEnabled: (enabled: boolean) => invoke(c.mcp.setEnabled, { enabled }),
    getStatus: () => invoke(c.mcp.getStatus),
    getPort: () => invoke(c.mcp.getPort),
    setPort: (port: number) => invoke(c.mcp.setPort, { port }),
    retry: () => invoke(c.mcp.retry),
  },
  import: {
    analyzeAnki: (bytes: Uint8Array, fileName: string) =>
      invoke(c.import.analyzeAnki, { bytes, fileName }),
    commitAnki: (input: unknown) => invoke(c.import.commitAnki, input),
    createDeckWithFlashcards: (input: unknown) =>
      invoke(c.import.createDeckWithFlashcards, input),
  },
  data: {
    export: () => invoke(c.data.export),
    restore: () => invoke(c.data.restore),
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
  minimize: () => invoke(c.shell.minimize),
  maximize: () => invoke(c.shell.maximize),
  close: () => invoke(c.shell.close),
  isMaximized: () => invoke(c.shell.isMaximized),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on(ipcEvents.shellMaximized, listener);
    return () => ipcRenderer.removeListener(ipcEvents.shellMaximized, listener);
  },
} satisfies ArminShell;

contextBridge.exposeInMainWorld("arminShell", shell);
