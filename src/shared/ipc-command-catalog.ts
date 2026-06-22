import { z } from "zod";
import { FLASHCARD_TYPES } from "../main/services/flashcard-types";
import { BROWSE_SORT_KEYS } from "./browse";
import { SCHEDULING_PRESET_VALUES } from "./scheduling-presets";

export type IpcCommand<TSchema extends z.ZodType = z.ZodType> = {
  channel: string;
  schema: TSchema;
};

function command<TSchema extends z.ZodType>(
  channel: string,
  schema: TSchema,
): IpcCommand<TSchema> {
  return { channel, schema };
}

const optionalVoid = z.void().optional();
const id = z.object({ id: z.string() });
const graphEdge = z.object({ prereqId: z.string(), dependentId: z.string() });
const graphLayoutPlacement = z.object({
  flashcardId: z.string(),
  x: z.number(),
  y: z.number(),
});
const deckSettingsPatch = z.object({
  requestRetention: z.number().nullable().optional(),
  maximumInterval: z.number().int().nullable().optional(),
  enableFuzz: z.boolean().nullable().optional(),
  enableShortTerm: z.boolean().nullable().optional(),
  learningSteps: z.string().nullable().optional(),
  relearningSteps: z.string().nullable().optional(),
  weights: z.string().nullable().optional(),
  prereqStabilityFloor: z.number().nullable().optional(),
  keepSiblingReviewUnitsTogether: z.boolean().nullable().optional(),
});

export const ipcCommands = {
  profiles: {
    list: command("profiles:list", optionalVoid),
    create: command("profiles:create", z.object({ name: z.string().min(1) })),
    open: command(
      "profiles:open",
      z.object({ id: z.string(), name: z.string().optional() }),
    ),
    getDefault: command("profiles:getDefault", optionalVoid),
    setDefault: command("profiles:setDefault", id),
    clearDefault: command("profiles:clearDefault", optionalVoid),
    delete: command("profiles:delete", id),
    showPicker: command("profiles:showPicker", optionalVoid),
  },
  decks: {
    list: command("decks:list", optionalVoid),
    get: command("decks:get", id),
    create: command(
      "decks:create",
      z.object({ name: z.string().min(1), description: z.string().nullish() }),
    ),
    update: command(
      "decks:update",
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullish(),
      }),
    ),
    delete: command("decks:delete", id),
  },
  flashcards: {
    list: command("flashcards:list", z.object({ deckId: z.string() })),
    listAll: command("flashcards:listAll", optionalVoid),
    browse: command(
      "flashcards:browse",
      z.object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
        sort: z.enum(BROWSE_SORT_KEYS),
        state: z.number().int().min(0).max(3).optional(),
        deckId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    listTags: command("flashcards:listTags", optionalVoid),
    listDeckTags: command(
      "flashcards:listDeckTags",
      z.object({ deckId: z.string() }),
    ),
    get: command("flashcards:get", id),
    deleteConsequences: command("flashcards:deleteConsequences", id),
    create: command(
      "flashcards:create",
      z.object({
        deckId: z.string(),
        type: z.enum(FLASHCARD_TYPES),
        content: z.unknown(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    update: command(
      "flashcards:update",
      z.object({
        id: z.string(),
        type: z.enum(FLASHCARD_TYPES).optional(),
        content: z.unknown().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    delete: command("flashcards:delete", id),
    archive: command(
      "flashcards:archive",
      z.object({ id: z.string(), archived: z.boolean() }),
    ),
  },
  import: {
    analyzeAnki: command(
      "import:analyzeAnki",
      z.object({
        bytes: z.instanceof(Uint8Array),
        fileName: z.string(),
      }),
    ),
    commitAnki: command(
      "import:commitAnki",
      z.object({
        importId: z.string(),
        deckName: z.string().min(1),
        keepScheduling: z.boolean(),
        deckStrategy: z.enum(["single", "separate"]),
      }),
    ),
    createDeckWithFlashcards: command(
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
    ),
  },
  data: {
    export: command("data:export", optionalVoid),
    restore: command("data:restore", optionalVoid),
  },
  review: {
    queue: command("review:queue", z.object({ deckId: z.string() })),
    queueAll: command("review:queueAll", optionalVoid),
    preview: command("review:preview", z.object({ reviewUnitId: z.string() })),
    rate: command(
      "review:rate",
      z.object({
        reviewUnitId: z.string(),
        rating: z.number().int().min(1).max(4),
      }),
    ),
    undo: command("review:undo", z.object({ reviewUnitId: z.string() })),
  },
  graph: {
    getGlobal: command("graph:getGlobal", z.object({})),
    addPrereq: command("graph:addPrereq", graphEdge),
    removePrereq: command("graph:removePrereq", graphEdge),
    saveLayout: command(
      "graph:saveLayout",
      z.object({ placements: z.array(graphLayoutPlacement) }),
    ),
  },
  mcp: {
    getSetup: command("mcp:getSetup", optionalVoid),
    getEnabled: command("mcp:getEnabled", optionalVoid),
    setEnabled: command("mcp:setEnabled", z.object({ enabled: z.boolean() })),
    getStatus: command("mcp:getStatus", optionalVoid),
    getPort: command("mcp:getPort", optionalVoid),
    setPort: command(
      "mcp:setPort",
      z.object({ port: z.number().int().min(1024).max(65535) }),
    ),
    retry: command("mcp:retry", optionalVoid),
  },
  settings: {
    get: command("settings:get", optionalVoid),
    update: command(
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
        schedulingPreset: z.enum(SCHEDULING_PRESET_VALUES).optional(),
      }),
    ),
    getDeck: command("settings:getDeck", z.object({ deckId: z.string() })),
    updateDeck: command(
      "settings:updateDeck",
      z.object({
        deckId: z.string(),
        patch: deckSettingsPatch,
      }),
    ),
  },
  shell: {
    minimize: command("shell:minimize", optionalVoid),
    maximize: command("shell:maximize", optionalVoid),
    close: command("shell:close", optionalVoid),
    isMaximized: command("shell:isMaximized", optionalVoid),
  },
} as const;

export const ipcEvents = {
  dataChanged: "armin:data-changed",
  shellMaximized: "shell:maximized",
} as const;
