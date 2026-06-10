// Exposes a typed, namespaced API to the renderer over IPC.
// See src/renderer/types/window.d.ts for the contract.
import { contextBridge, ipcRenderer } from "electron";

const invoke = (channel: string, payload?: unknown) =>
  ipcRenderer.invoke(channel, payload);

const api = {
  profiles: {
    list: () => invoke("profiles:list"),
    create: (name: string) => invoke("profiles:create", { name }),
    open: (id: string, name?: string) => invoke("profiles:open", { id, name }),
    showPicker: () => invoke("profiles:showPicker"),
  },
  decks: {
    list: () => invoke("decks:list"),
    get: (id: string) => invoke("decks:get", { id }),
    create: (input: unknown) => invoke("decks:create", input),
    update: (input: unknown) => invoke("decks:update", input),
    delete: (id: string) => invoke("decks:delete", { id }),
  },
  cards: {
    list: (deckId: string) => invoke("cards:list", { deckId }),
    listAll: () => invoke("cards:listAll"),
    browse: (input: unknown) => invoke("cards:browse", input),
    listTags: () => invoke("cards:listTags"),
    listDeckTags: (deckId: string) => invoke("cards:listDeckTags", { deckId }),
    get: (id: string) => invoke("cards:get", { id }),
    create: (input: unknown) => invoke("cards:create", input),
    update: (input: unknown) => invoke("cards:update", input),
    delete: (id: string) => invoke("cards:delete", { id }),
  },
  review: {
    queue: (deckId: string) => invoke("review:queue", { deckId }),
    queueAll: () => invoke("review:queueAll"),
    preview: (cardId: string) => invoke("review:preview", { cardId }),
    rate: (cardId: string, rating: number) =>
      invoke("review:rate", { cardId, rating }),
  },
  graph: {
    get: (deckId: string) => invoke("graph:get", { deckId }),
    addPrereq: (prereqId: string, dependentId: string) =>
      invoke("graph:addPrereq", { prereqId, dependentId }),
    removePrereq: (prereqId: string, dependentId: string) =>
      invoke("graph:removePrereq", { prereqId, dependentId }),
    saveLayout: (
      deckId: string,
      placements: { noteId: string; x: number; y: number }[],
    ) => invoke("graph:saveLayout", { deckId, placements }),
  },
  settings: {
    get: () => invoke("settings:get"),
    update: (patch: unknown) => invoke("settings:update", patch),
  },
  mcp: {
    getSetup: () => invoke("mcp:getSetup"),
  },
  import: {
    analyzeAnki: (bytes: Uint8Array, fileName: string) =>
      invoke("import:analyzeAnki", { bytes, fileName }),
    commitAnki: (input: unknown) => invoke("import:commitAnki", input),
    createDeckWithCards: (input: unknown) =>
      invoke("import:createDeckWithCards", input),
  },
  onDataChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("armin:data-changed", listener);
    return () => ipcRenderer.removeListener("armin:data-changed", listener);
  },
};

contextBridge.exposeInMainWorld("armin", api);
contextBridge.exposeInMainWorld(
  "__ARMIN_E2E__",
  process.argv.includes("--armin-e2e") || process.env.ARMIN_E2E === "1",
);

contextBridge.exposeInMainWorld("arminShell", {
  platform: process.platform,
  minimize: () => invoke("shell:minimize"),
  maximize: () => invoke("shell:maximize"),
  close: () => invoke("shell:close"),
  isMaximized: () => invoke("shell:isMaximized"),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_event: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on("shell:maximized", listener);
    return () => ipcRenderer.removeListener("shell:maximized", listener);
  },
});
