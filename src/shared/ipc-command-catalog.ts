import { z } from "zod";
import { BROWSE_SORT_KEYS } from "./browse";
import { FLASHCARD_TYPES } from "./flashcard-types";
import { ipcChannels } from "./ipc-channels";
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
    list: command(ipcChannels.profiles.list.channel, optionalVoid),
    create: command(
      ipcChannels.profiles.create.channel,
      z.object({ name: z.string().min(1) }),
    ),
    open: command(
      ipcChannels.profiles.open.channel,
      z.object({ id: z.string(), name: z.string().optional() }),
    ),
    getDefault: command(ipcChannels.profiles.getDefault.channel, optionalVoid),
    setDefault: command(ipcChannels.profiles.setDefault.channel, id),
    clearDefault: command(
      ipcChannels.profiles.clearDefault.channel,
      optionalVoid,
    ),
    delete: command(ipcChannels.profiles.delete.channel, id),
    showPicker: command(ipcChannels.profiles.showPicker.channel, optionalVoid),
  },
  decks: {
    list: command(ipcChannels.decks.list.channel, optionalVoid),
    get: command(ipcChannels.decks.get.channel, id),
    create: command(
      ipcChannels.decks.create.channel,
      z.object({ name: z.string().min(1), description: z.string().nullish() }),
    ),
    update: command(
      ipcChannels.decks.update.channel,
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullish(),
      }),
    ),
    delete: command(ipcChannels.decks.delete.channel, id),
  },
  flashcards: {
    list: command(
      ipcChannels.flashcards.list.channel,
      z.object({ deckId: z.string() }),
    ),
    listAll: command(ipcChannels.flashcards.listAll.channel, optionalVoid),
    browse: command(
      ipcChannels.flashcards.browse.channel,
      z.object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
        sort: z.enum(BROWSE_SORT_KEYS),
        state: z.number().int().min(0).max(3).optional(),
        deckId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    listTags: command(ipcChannels.flashcards.listTags.channel, optionalVoid),
    listDeckTags: command(
      ipcChannels.flashcards.listDeckTags.channel,
      z.object({ deckId: z.string() }),
    ),
    get: command(ipcChannels.flashcards.get.channel, id),
    deleteConsequences: command(
      ipcChannels.flashcards.deleteConsequences.channel,
      id,
    ),
    create: command(
      ipcChannels.flashcards.create.channel,
      z.object({
        deckId: z.string(),
        type: z.enum(FLASHCARD_TYPES),
        content: z.unknown(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    update: command(
      ipcChannels.flashcards.update.channel,
      z.object({
        id: z.string(),
        type: z.enum(FLASHCARD_TYPES).optional(),
        content: z.unknown().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
    delete: command(ipcChannels.flashcards.delete.channel, id),
    archive: command(
      ipcChannels.flashcards.archive.channel,
      z.object({ id: z.string(), archived: z.boolean() }),
    ),
  },
  import: {
    analyzeAnki: command(
      ipcChannels.import.analyzeAnki.channel,
      z.object({
        bytes: z.instanceof(Uint8Array),
        fileName: z.string(),
      }),
    ),
    commitAnki: command(
      ipcChannels.import.commitAnki.channel,
      z.object({
        importId: z.string(),
        deckName: z.string().min(1),
        keepScheduling: z.boolean(),
        deckStrategy: z.enum(["single", "separate"]),
      }),
    ),
    createDeckWithFlashcards: command(
      ipcChannels.import.createDeckWithFlashcards.channel,
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
    export: command(ipcChannels.data.export.channel, optionalVoid),
    restore: command(ipcChannels.data.restore.channel, optionalVoid),
  },
  review: {
    queue: command(
      ipcChannels.review.queue.channel,
      z.object({ deckId: z.string() }),
    ),
    queueAll: command(ipcChannels.review.queueAll.channel, optionalVoid),
    preview: command(
      ipcChannels.review.preview.channel,
      z.object({ reviewUnitId: z.string() }),
    ),
    rate: command(
      ipcChannels.review.rate.channel,
      z.object({
        reviewUnitId: z.string(),
        rating: z.number().int().min(1).max(4),
      }),
    ),
    undo: command(
      ipcChannels.review.undo.channel,
      z.object({ reviewUnitId: z.string() }),
    ),
  },
  graph: {
    getGlobal: command(ipcChannels.graph.getGlobal.channel, z.object({})),
    addPrereq: command(ipcChannels.graph.addPrereq.channel, graphEdge),
    removePrereq: command(ipcChannels.graph.removePrereq.channel, graphEdge),
    saveLayout: command(
      ipcChannels.graph.saveLayout.channel,
      z.object({ placements: z.array(graphLayoutPlacement) }),
    ),
  },
  mcp: {
    getSetup: command(ipcChannels.mcp.getSetup.channel, optionalVoid),
    getEnabled: command(ipcChannels.mcp.getEnabled.channel, optionalVoid),
    setEnabled: command(
      ipcChannels.mcp.setEnabled.channel,
      z.object({ enabled: z.boolean() }),
    ),
    getStatus: command(ipcChannels.mcp.getStatus.channel, optionalVoid),
    getPort: command(ipcChannels.mcp.getPort.channel, optionalVoid),
    setPort: command(
      ipcChannels.mcp.setPort.channel,
      z.object({ port: z.number().int().min(1024).max(65535) }),
    ),
    retry: command(ipcChannels.mcp.retry.channel, optionalVoid),
  },
  settings: {
    get: command(ipcChannels.settings.get.channel, optionalVoid),
    update: command(
      ipcChannels.settings.update.channel,
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
    getDeck: command(
      ipcChannels.settings.getDeck.channel,
      z.object({ deckId: z.string() }),
    ),
    updateDeck: command(
      ipcChannels.settings.updateDeck.channel,
      z.object({
        deckId: z.string(),
        patch: deckSettingsPatch,
      }),
    ),
  },
  shell: {
    minimize: command(ipcChannels.shell.minimize.channel, optionalVoid),
    maximize: command(ipcChannels.shell.maximize.channel, optionalVoid),
    close: command(ipcChannels.shell.close.channel, optionalVoid),
    isMaximized: command(ipcChannels.shell.isMaximized.channel, optionalVoid),
  },
} as const;

export { ipcEvents } from "./ipc-channels";
