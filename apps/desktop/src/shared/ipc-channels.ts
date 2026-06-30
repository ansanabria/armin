export type IpcChannel = {
  channel: string;
};

export const ipcCommandNames = {
  profiles: {
    list: "profiles:list",
    create: "profiles:create",
    open: "profiles:open",
    getDefault: "profiles:getDefault",
    setDefault: "profiles:setDefault",
    clearDefault: "profiles:clearDefault",
    delete: "profiles:delete",
    showPicker: "profiles:showPicker",
  },
  decks: {
    list: "decks:list",
    get: "decks:get",
    create: "decks:create",
    update: "decks:update",
    delete: "decks:delete",
  },
  flashcards: {
    list: "flashcards:list",
    listAll: "flashcards:listAll",
    browse: "flashcards:browse",
    listTags: "flashcards:listTags",
    listDeckTags: "flashcards:listDeckTags",
    get: "flashcards:get",
    deleteConsequences: "flashcards:deleteConsequences",
    moveConsequences: "flashcards:moveConsequences",
    create: "flashcards:create",
    update: "flashcards:update",
    delete: "flashcards:delete",
    archive: "flashcards:archive",
    move: "flashcards:move",
  },
  import: {
    analyzeAnki: "import:analyzeAnki",
    commitAnki: "import:commitAnki",
    createDeckWithFlashcards: "import:createDeckWithFlashcards",
  },
  data: {
    export: "data:export",
    restore: "data:restore",
  },
  media: {
    importImage: "media:importImage",
  },
  review: {
    queue: "review:queue",
    queueAll: "review:queueAll",
    preview: "review:preview",
    rate: "review:rate",
    undo: "review:undo",
  },
  cram: {
    pool: "cram:pool",
  },
  graph: {
    getDeck: "graph:getDeck",
    addPrereq: "graph:addPrereq",
    removePrereq: "graph:removePrereq",
    saveLayout: "graph:saveLayout",
  },
  mcp: {
    getSetup: "mcp:getSetup",
    getEnabled: "mcp:getEnabled",
    setEnabled: "mcp:setEnabled",
    getStatus: "mcp:getStatus",
    getPort: "mcp:getPort",
    setPort: "mcp:setPort",
    retry: "mcp:retry",
  },
  settings: {
    get: "settings:get",
    update: "settings:update",
    getDeck: "settings:getDeck",
    updateDeck: "settings:updateDeck",
  },
  shell: {
    minimize: "shell:minimize",
    maximize: "shell:maximize",
    close: "shell:close",
    isMaximized: "shell:isMaximized",
  },
} as const;

function channel(name: string): IpcChannel {
  return { channel: name };
}

export const ipcChannels = {
  profiles: {
    list: channel(ipcCommandNames.profiles.list),
    create: channel(ipcCommandNames.profiles.create),
    open: channel(ipcCommandNames.profiles.open),
    getDefault: channel(ipcCommandNames.profiles.getDefault),
    setDefault: channel(ipcCommandNames.profiles.setDefault),
    clearDefault: channel(ipcCommandNames.profiles.clearDefault),
    delete: channel(ipcCommandNames.profiles.delete),
    showPicker: channel(ipcCommandNames.profiles.showPicker),
  },
  decks: {
    list: channel(ipcCommandNames.decks.list),
    get: channel(ipcCommandNames.decks.get),
    create: channel(ipcCommandNames.decks.create),
    update: channel(ipcCommandNames.decks.update),
    delete: channel(ipcCommandNames.decks.delete),
  },
  flashcards: {
    list: channel(ipcCommandNames.flashcards.list),
    listAll: channel(ipcCommandNames.flashcards.listAll),
    browse: channel(ipcCommandNames.flashcards.browse),
    listTags: channel(ipcCommandNames.flashcards.listTags),
    listDeckTags: channel(ipcCommandNames.flashcards.listDeckTags),
    get: channel(ipcCommandNames.flashcards.get),
    deleteConsequences: channel(ipcCommandNames.flashcards.deleteConsequences),
    moveConsequences: channel(ipcCommandNames.flashcards.moveConsequences),
    create: channel(ipcCommandNames.flashcards.create),
    update: channel(ipcCommandNames.flashcards.update),
    delete: channel(ipcCommandNames.flashcards.delete),
    archive: channel(ipcCommandNames.flashcards.archive),
    move: channel(ipcCommandNames.flashcards.move),
  },
  import: {
    analyzeAnki: channel(ipcCommandNames.import.analyzeAnki),
    commitAnki: channel(ipcCommandNames.import.commitAnki),
    createDeckWithFlashcards: channel(
      ipcCommandNames.import.createDeckWithFlashcards,
    ),
  },
  data: {
    export: channel(ipcCommandNames.data.export),
    restore: channel(ipcCommandNames.data.restore),
  },
  media: {
    importImage: channel(ipcCommandNames.media.importImage),
  },
  review: {
    queue: channel(ipcCommandNames.review.queue),
    queueAll: channel(ipcCommandNames.review.queueAll),
    preview: channel(ipcCommandNames.review.preview),
    rate: channel(ipcCommandNames.review.rate),
    undo: channel(ipcCommandNames.review.undo),
  },
  cram: {
    pool: channel(ipcCommandNames.cram.pool),
  },
  graph: {
    getDeck: channel(ipcCommandNames.graph.getDeck),
    addPrereq: channel(ipcCommandNames.graph.addPrereq),
    removePrereq: channel(ipcCommandNames.graph.removePrereq),
    saveLayout: channel(ipcCommandNames.graph.saveLayout),
  },
  mcp: {
    getSetup: channel(ipcCommandNames.mcp.getSetup),
    getEnabled: channel(ipcCommandNames.mcp.getEnabled),
    setEnabled: channel(ipcCommandNames.mcp.setEnabled),
    getStatus: channel(ipcCommandNames.mcp.getStatus),
    getPort: channel(ipcCommandNames.mcp.getPort),
    setPort: channel(ipcCommandNames.mcp.setPort),
    retry: channel(ipcCommandNames.mcp.retry),
  },
  settings: {
    get: channel(ipcCommandNames.settings.get),
    update: channel(ipcCommandNames.settings.update),
    getDeck: channel(ipcCommandNames.settings.getDeck),
    updateDeck: channel(ipcCommandNames.settings.updateDeck),
  },
  shell: {
    minimize: channel(ipcCommandNames.shell.minimize),
    maximize: channel(ipcCommandNames.shell.maximize),
    close: channel(ipcCommandNames.shell.close),
    isMaximized: channel(ipcCommandNames.shell.isMaximized),
  },
} as const;

export const ipcEvents = {
  dataChanged: "armin:data-changed",
  shellMaximized: "shell:maximized",
} as const;
