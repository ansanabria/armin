import type { ReviewUnit, Deck, Flashcard, Settings } from "../main/db/schema";
import type { DeckWithStats } from "../main/services/decks";
import type {
  DeckSettingsOverrides,
  DeckSettingsUpdate,
  SchedulingSettings,
  SettingsUpdate,
} from "../main/services/settings";
import type {
  BrowseFlashcard,
  FlashcardDeleteConsequences,
  FlashcardWithMeta,
} from "../main/services/flashcards";
import type {
  FlashcardContent,
  FlashcardType,
} from "../main/services/flashcard-types";
import type { PreviewOption, ReviewQueueItem } from "../main/services/review";
import type { DeckGraph, GlobalGraph } from "../main/services/graph";
import type { McpSetup } from "./mcp";
import type {
  AnkiAnalysis,
  AnkiImportResult,
} from "../main/services/anki/import";

export type Grade = 1 | 2 | 3 | 4;

export type Profile = {
  id: string;
  name: string;
  createdAt: string;
};

export interface ArminApi {
  profiles: {
    list(): Promise<Profile[]>;
    create(name: string): Promise<Profile>;
    open(id: string, name?: string): Promise<{ ok: true }>;
    getDefault(): Promise<string | null>;
    setDefault(id: string): Promise<{ ok: true }>;
    clearDefault(): Promise<{ ok: true }>;
    delete(id: string): Promise<{ ok: true }>;
    showPicker(): Promise<{ ok: true }>;
  };
  decks: {
    list(): Promise<DeckWithStats[]>;
    get(id: string): Promise<DeckWithStats | undefined>;
    create(input: { name: string; description?: string | null }): Promise<Deck>;
    update(input: {
      id: string;
      name?: string;
      description?: string | null;
    }): Promise<Deck | undefined>;
    delete(id: string): Promise<{ ok: true }>;
  };
  flashcards: {
    list(deckId: string): Promise<FlashcardWithMeta[]>;
    listAll(): Promise<BrowseFlashcard[]>;
    browse(input: {
      offset: number;
      limit: number;
      sort: string;
      state?: number;
      deckId?: string;
      tags?: string[];
    }): Promise<{
      flashcards: BrowseFlashcard[];
      filteredTotal: number;
      libraryTotal: number;
    }>;
    listTags(): Promise<string[]>;
    listDeckTags(deckId: string): Promise<string[]>;
    get(id: string): Promise<FlashcardWithMeta | undefined>;
    deleteConsequences(id: string): Promise<FlashcardDeleteConsequences>;
    create(input: {
      deckId: string;
      type: FlashcardType;
      content: FlashcardContent;
      tags?: string[];
    }): Promise<FlashcardWithMeta>;
    update(input: {
      id: string;
      type?: FlashcardType;
      content?: FlashcardContent;
      tags?: string[];
    }): Promise<FlashcardWithMeta | undefined>;
    delete(id: string): Promise<{ ok: true }>;
    archive(
      id: string,
      archived: boolean,
    ): Promise<FlashcardWithMeta | undefined>;
  };
  review: {
    queue(deckId: string): Promise<ReviewQueueItem[]>;
    queueAll(): Promise<ReviewQueueItem[]>;
    preview(reviewUnitId: string): Promise<PreviewOption[]>;
    rate(reviewUnitId: string, rating: Grade): Promise<ReviewQueueItem>;
    undo(reviewUnitId: string): Promise<ReviewQueueItem | null>;
  };
  graph: {
    getGlobal(): Promise<GlobalGraph>;
    addPrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
    removePrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
    saveLayout(
      placements: { flashcardId: string; x: number; y: number }[],
    ): Promise<{ ok: true }>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: SettingsUpdate): Promise<Settings>;
    getDeck(deckId: string): Promise<{
      global: SchedulingSettings;
      overrides: DeckSettingsOverrides;
      effective: SchedulingSettings;
    }>;
    updateDeck(
      deckId: string,
      patch: DeckSettingsUpdate,
    ): Promise<{
      global: SchedulingSettings;
      overrides: DeckSettingsOverrides;
      effective: SchedulingSettings;
    }>;
  };
  mcp: {
    getSetup(): Promise<McpSetup>;
    getEnabled(): Promise<boolean>;
    setEnabled(enabled: boolean): Promise<{ enabled: boolean }>;
    getStatus(): Promise<{
      running: boolean;
      url: string | null;
      port: number | null;
      error: string | null;
    }>;
    getPort(): Promise<number>;
    setPort(port: number): Promise<{
      running: boolean;
      url: string | null;
      port: number | null;
      error: string | null;
    }>;
    retry(): Promise<{
      running: boolean;
      url: string | null;
      port: number | null;
      error: string | null;
    }>;
  };
  import: {
    analyzeAnki(bytes: Uint8Array, fileName: string): Promise<AnkiAnalysis>;
    commitAnki(input: {
      importId: string;
      deckName: string;
      keepScheduling: boolean;
      deckStrategy: "single" | "separate";
    }): Promise<AnkiImportResult>;
    createDeckWithFlashcards(input: {
      name: string;
      description?: string | null;
      flashcards: { front: string; back: string; tags?: string[] }[];
    }): Promise<{ deckId: string; flashcardCount: number }>;
  };
  data: {
    export(): Promise<
      | { canceled: true }
      | {
          canceled: false;
          path: string;
          deckCount: number;
          flashcardCount: number;
        }
    >;
    restore(): Promise<
      | { canceled: true }
      | {
          canceled: false;
          profile: Profile;
          deckCount: number;
          flashcardCount: number;
        }
    >;
  };
  onDataChanged(cb: () => void): () => void;
}

export interface ArminShell {
  platform: NodeJS.Platform;
  minimize(): Promise<void>;
  maximize(): Promise<{ maximized: boolean }>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;
}

export type {
  ReviewUnit,
  Flashcard,
  Deck,
  Settings,
  DeckWithStats,
  FlashcardWithMeta,
  FlashcardDeleteConsequences,
  BrowseFlashcard,
  FlashcardType,
  FlashcardContent,
  PreviewOption,
  ReviewQueueItem,
  DeckGraph,
  GlobalGraph,
};
