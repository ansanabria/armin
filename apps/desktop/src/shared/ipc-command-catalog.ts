import { z } from "zod";
import { BROWSE_SORT_KEYS } from "./browse";
import { FLASHCARD_TYPES } from "./flashcard-types";
import { ipcCommandNames } from "./ipc-channels";
import { SCHEDULING_PRESET_VALUES } from "./scheduling-presets";
import type { AssistantProviderId } from "./assistant";

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
const assistantProviderId = z.enum([
  "codex",
  "claude-code",
  "opencode",
] satisfies AssistantProviderId[]);

export const ipcCommands = {
  profiles: {
    list: command(ipcCommandNames.profiles.list, optionalVoid),
    create: command(
      ipcCommandNames.profiles.create,
      z.object({ name: z.string().min(1) }),
    ),
    open: command(
      ipcCommandNames.profiles.open,
      z.object({ id: z.string(), name: z.string().optional() }),
    ),
    getDefault: command(ipcCommandNames.profiles.getDefault, optionalVoid),
    setDefault: command(ipcCommandNames.profiles.setDefault, id),
    clearDefault: command(
      ipcCommandNames.profiles.clearDefault,
      optionalVoid,
    ),
    delete: command(ipcCommandNames.profiles.delete, id),
    showPicker: command(ipcCommandNames.profiles.showPicker, optionalVoid),
  },
  decks: {
    list: command(ipcCommandNames.decks.list, optionalVoid),
    get: command(ipcCommandNames.decks.get, id),
    create: command(
      ipcCommandNames.decks.create,
      z.object({ name: z.string().min(1), description: z.string().nullish() }),
    ),
    update: command(
      ipcCommandNames.decks.update,
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullish(),
      }),
    ),
    delete: command(ipcCommandNames.decks.delete, id),
  },
  flashcards: {
    list: command(
      ipcCommandNames.flashcards.list,
      z.object({ deckId: z.string() }),
    ),
    listAll: command(ipcCommandNames.flashcards.listAll, optionalVoid),
    browse: command(
      ipcCommandNames.flashcards.browse,
      z.object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
        sort: z.enum(BROWSE_SORT_KEYS),
        state: z.number().int().min(0).max(3).optional(),
        deckId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    listTags: command(ipcCommandNames.flashcards.listTags, optionalVoid),
    listDeckTags: command(
      ipcCommandNames.flashcards.listDeckTags,
      z.object({ deckId: z.string() }),
    ),
    get: command(ipcCommandNames.flashcards.get, id),
    deleteConsequences: command(
      ipcCommandNames.flashcards.deleteConsequences,
      id,
    ),
    moveConsequences: command(
      ipcCommandNames.flashcards.moveConsequences,
      id,
    ),
    create: command(
      ipcCommandNames.flashcards.create,
      z.object({
        deckId: z.string(),
        type: z.enum(FLASHCARD_TYPES),
        content: z.unknown(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    update: command(
      ipcCommandNames.flashcards.update,
      z.object({
        id: z.string(),
        type: z.enum(FLASHCARD_TYPES).optional(),
        content: z.unknown().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    delete: command(ipcCommandNames.flashcards.delete, id),
    archive: command(
      ipcCommandNames.flashcards.archive,
      z.object({ id: z.string(), archived: z.boolean() }),
    ),
    move: command(
      ipcCommandNames.flashcards.move,
      z.object({ id: z.string(), targetDeckId: z.string() }),
    ),
  },
  import: {
    analyzeAnki: command(
      ipcCommandNames.import.analyzeAnki,
      z.object({
        bytes: z.instanceof(Uint8Array),
        fileName: z.string(),
      }),
    ),
    commitAnki: command(
      ipcCommandNames.import.commitAnki,
      z.object({
        importId: z.string(),
        deckName: z.string().min(1),
        keepScheduling: z.boolean(),
        deckStrategy: z.enum(["single", "separate"]),
      }),
    ),
    createDeckWithFlashcards: command(
      ipcCommandNames.import.createDeckWithFlashcards,
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
    export: command(ipcCommandNames.data.export, optionalVoid),
    restore: command(ipcCommandNames.data.restore, optionalVoid),
  },
  media: {
    importImage: command(
      ipcCommandNames.media.importImage,
      z.object({
        bytes: z.instanceof(Uint8Array),
        fileName: z.string().optional(),
        mime: z.string().optional(),
      }),
    ),
  },
  review: {
    queue: command(
      ipcCommandNames.review.queue,
      z.object({ deckId: z.string() }),
    ),
    queueAll: command(ipcCommandNames.review.queueAll, optionalVoid),
    preview: command(
      ipcCommandNames.review.preview,
      z.object({ reviewUnitId: z.string() }),
    ),
    rate: command(
      ipcCommandNames.review.rate,
      z.object({
        reviewUnitId: z.string(),
        rating: z.number().int().min(1).max(4),
      }),
    ),
    undo: command(
      ipcCommandNames.review.undo,
      z.object({ reviewUnitId: z.string() }),
    ),
  },
  cram: {
    pool: command(
      ipcCommandNames.cram.pool,
      z.object({
        deckIds: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        combine: z.enum(["intersection", "union"]).default("intersection"),
      }),
    ),
  },
  graph: {
    getDeck: command(
      ipcCommandNames.graph.getDeck,
      z.object({ deckId: z.string() }),
    ),
    addPrereq: command(ipcCommandNames.graph.addPrereq, graphEdge),
    removePrereq: command(ipcCommandNames.graph.removePrereq, graphEdge),
    saveLayout: command(
      ipcCommandNames.graph.saveLayout,
      z.object({
        deckId: z.string(),
        placements: z.array(graphLayoutPlacement),
      }),
    ),
  },
  mcp: {
    getSetup: command(ipcCommandNames.mcp.getSetup, optionalVoid),
    getEnabled: command(ipcCommandNames.mcp.getEnabled, optionalVoid),
    setEnabled: command(
      ipcCommandNames.mcp.setEnabled,
      z.object({ enabled: z.boolean() }),
    ),
    getStatus: command(ipcCommandNames.mcp.getStatus, optionalVoid),
    getPort: command(ipcCommandNames.mcp.getPort, optionalVoid),
    setPort: command(
      ipcCommandNames.mcp.setPort,
      z.object({ port: z.number().int().min(1024).max(65535) }),
    ),
    retry: command(ipcCommandNames.mcp.retry, optionalVoid),
  },
  assistant: {
    listProviders: command(
      ipcCommandNames.assistant.listProviders,
      optionalVoid,
    ),
    openProviderUrl: command(
      ipcCommandNames.assistant.openProviderUrl,
      z.object({ providerId: z.string() }),
    ),
    listConversations: command(
      ipcCommandNames.assistant.listConversations,
      optionalVoid,
    ),
    sendMessage: command(
      ipcCommandNames.assistant.sendMessage,
      z.object({
        conversationId: z.string().optional(),
        providerId: assistantProviderId,
        message: z.string().min(1),
      }),
    ),
    cancel: command(
      ipcCommandNames.assistant.cancel,
      z.object({ conversationId: z.string() }),
    ),
  },
  settings: {
    get: command(ipcCommandNames.settings.get, optionalVoid),
    update: command(
      ipcCommandNames.settings.update,
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
        keybindings: z.string().nullish(),
      }),
    ),
    getDeck: command(
      ipcCommandNames.settings.getDeck,
      z.object({ deckId: z.string() }),
    ),
    updateDeck: command(
      ipcCommandNames.settings.updateDeck,
      z.object({
        deckId: z.string(),
        patch: deckSettingsPatch,
      }),
    ),
  },
  shell: {
    minimize: command(ipcCommandNames.shell.minimize, optionalVoid),
    maximize: command(ipcCommandNames.shell.maximize, optionalVoid),
    close: command(ipcCommandNames.shell.close, optionalVoid),
    isMaximized: command(ipcCommandNames.shell.isMaximized, optionalVoid),
  },
} as const;

export { ipcEvents } from "./ipc-channels";
