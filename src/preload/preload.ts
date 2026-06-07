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
    get: (id: string) => invoke("cards:get", { id }),
    create: (input: unknown) => invoke("cards:create", input),
    update: (input: unknown) => invoke("cards:update", input),
    delete: (id: string) => invoke("cards:delete", { id }),
  },
  review: {
    queue: (deckId: string) => invoke("review:queue", { deckId }),
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
  },
  settings: {
    get: () => invoke("settings:get"),
    update: (patch: unknown) => invoke("settings:update", patch),
  },
  onDataChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("armin:data-changed", listener);
    return () => ipcRenderer.removeListener("armin:data-changed", listener);
  },
};

contextBridge.exposeInMainWorld("armin", api);

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
