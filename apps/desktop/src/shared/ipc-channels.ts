export type IpcChannel = {
  channel: string;
};

function channel(name: string): IpcChannel {
  return { channel: name };
}

export const ipcChannels = {
  profiles: {
    list: channel("profiles:list"),
    create: channel("profiles:create"),
    open: channel("profiles:open"),
    getDefault: channel("profiles:getDefault"),
    setDefault: channel("profiles:setDefault"),
    clearDefault: channel("profiles:clearDefault"),
    delete: channel("profiles:delete"),
    showPicker: channel("profiles:showPicker"),
  },
  decks: {
    list: channel("decks:list"),
    get: channel("decks:get"),
    create: channel("decks:create"),
    update: channel("decks:update"),
    delete: channel("decks:delete"),
  },
  flashcards: {
    list: channel("flashcards:list"),
    listAll: channel("flashcards:listAll"),
    browse: channel("flashcards:browse"),
    listTags: channel("flashcards:listTags"),
    listDeckTags: channel("flashcards:listDeckTags"),
    get: channel("flashcards:get"),
    deleteConsequences: channel("flashcards:deleteConsequences"),
    moveConsequences: channel("flashcards:moveConsequences"),
    create: channel("flashcards:create"),
    update: channel("flashcards:update"),
    delete: channel("flashcards:delete"),
    archive: channel("flashcards:archive"),
    move: channel("flashcards:move"),
  },
  import: {
    analyzeAnki: channel("import:analyzeAnki"),
    commitAnki: channel("import:commitAnki"),
    createDeckWithFlashcards: channel("import:createDeckWithFlashcards"),
  },
  data: {
    export: channel("data:export"),
    restore: channel("data:restore"),
  },
  review: {
    queue: channel("review:queue"),
    queueAll: channel("review:queueAll"),
    preview: channel("review:preview"),
    rate: channel("review:rate"),
    undo: channel("review:undo"),
  },
  cram: {
    pool: channel("cram:pool"),
  },
  graph: {
    getDeck: channel("graph:getDeck"),
    addPrereq: channel("graph:addPrereq"),
    removePrereq: channel("graph:removePrereq"),
    saveLayout: channel("graph:saveLayout"),
  },
  mcp: {
    getSetup: channel("mcp:getSetup"),
    getEnabled: channel("mcp:getEnabled"),
    setEnabled: channel("mcp:setEnabled"),
    getStatus: channel("mcp:getStatus"),
    getPort: channel("mcp:getPort"),
    setPort: channel("mcp:setPort"),
    retry: channel("mcp:retry"),
  },
  settings: {
    get: channel("settings:get"),
    update: channel("settings:update"),
    getDeck: channel("settings:getDeck"),
    updateDeck: channel("settings:updateDeck"),
  },
  shell: {
    minimize: channel("shell:minimize"),
    maximize: channel("shell:maximize"),
    close: channel("shell:close"),
    isMaximized: channel("shell:isMaximized"),
  },
} as const;

export const ipcEvents = {
  dataChanged: "armin:data-changed",
  shellMaximized: "shell:maximized",
} as const;
