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
    getDefault: () => invoke("profiles:getDefault"),
    setDefault: (id: string) => invoke("profiles:setDefault", { id }),
    clearDefault: () => invoke("profiles:clearDefault"),
    delete: (id: string) => invoke("profiles:delete", { id }),
    showPicker: () => invoke("profiles:showPicker"),
  },
  decks: {
    list: () => invoke("decks:list"),
    get: (id: string) => invoke("decks:get", { id }),
    create: (input: unknown) => invoke("decks:create", input),
    update: (input: unknown) => invoke("decks:update", input),
    delete: (id: string) => invoke("decks:delete", { id }),
  },
  flashcards: {
    list: (deckId: string) => invoke("flashcards:list", { deckId }),
    listAll: () => invoke("flashcards:listAll"),
    browse: (input: unknown) => invoke("flashcards:browse", input),
    listTags: () => invoke("flashcards:listTags"),
    listDeckTags: (deckId: string) =>
      invoke("flashcards:listDeckTags", { deckId }),
    get: (id: string) => invoke("flashcards:get", { id }),
    deleteConsequences: (id: string) =>
      invoke("flashcards:deleteConsequences", { id }),
    create: (input: unknown) => invoke("flashcards:create", input),
    update: (input: unknown) => invoke("flashcards:update", input),
    delete: (id: string) => invoke("flashcards:delete", { id }),
    archive: (id: string, archived: boolean) =>
      invoke("flashcards:archive", { id, archived }),
  },
  review: {
    queue: (deckId: string) => invoke("review:queue", { deckId }),
    queueAll: () => invoke("review:queueAll"),
    preview: (reviewUnitId: string) => invoke("review:preview", { reviewUnitId }),
    rate: (reviewUnitId: string, rating: number) =>
      invoke("review:rate", { reviewUnitId, rating }),
    undo: (reviewUnitId: string) => invoke("review:undo", { reviewUnitId }),
  },
  graph: {
    getGlobal: () => invoke("graph:getGlobal", {}),
    addPrereq: (prereqId: string, dependentId: string) =>
      invoke("graph:addPrereq", { prereqId, dependentId }),
    removePrereq: (prereqId: string, dependentId: string) =>
      invoke("graph:removePrereq", { prereqId, dependentId }),
    saveLayout: (
      placements: { flashcardId: string; x: number; y: number }[],
    ) => invoke("graph:saveLayout", { placements }),
  },
  settings: {
    get: () => invoke("settings:get"),
    update: (patch: unknown) => invoke("settings:update", patch),
    getDeck: (deckId: string) => invoke("settings:getDeck", { deckId }),
    updateDeck: (deckId: string, patch: unknown) =>
      invoke("settings:updateDeck", { deckId, patch }),
  },
  mcp: {
    getSetup: () => invoke("mcp:getSetup"),
    getEnabled: () => invoke("mcp:getEnabled"),
    setEnabled: (enabled: boolean) => invoke("mcp:setEnabled", { enabled }),
    getStatus: () => invoke("mcp:getStatus"),
    getPort: () => invoke("mcp:getPort"),
    setPort: (port: number) => invoke("mcp:setPort", { port }),
    retry: () => invoke("mcp:retry"),
  },
  import: {
    analyzeAnki: (bytes: Uint8Array, fileName: string) =>
      invoke("import:analyzeAnki", { bytes, fileName }),
    commitAnki: (input: unknown) => invoke("import:commitAnki", input),
    createDeckWithFlashcards: (input: unknown) =>
      invoke("import:createDeckWithFlashcards", input),
  },
  data: {
    export: () => invoke("data:export"),
    restore: () => invoke("data:restore"),
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
