import type { Card, Deck, Settings } from "../../main/db/schema";
import type { DeckWithStats } from "../../main/services/decks";
import type { BrowseCard, CardWithMeta } from "../../main/services/cards";
import type { SettingsUpdate } from "../../main/services/settings";
import type { PreviewOption } from "../../main/services/review";
import type { DeckGraph } from "../../main/services/graph";
import type { McpSetup } from "../../shared/mcp";
import type {
  AnkiAnalysis,
  AnkiImportResult,
} from "../../main/services/anki/import";

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
  cards: {
    list(deckId: string): Promise<CardWithMeta[]>;
    listAll(): Promise<BrowseCard[]>;
    browse(input: {
      offset: number;
      limit: number;
      sort: string;
      state?: number;
      deckId?: string;
      tags?: string[];
    }): Promise<{
      cards: BrowseCard[];
      filteredTotal: number;
      libraryTotal: number;
    }>;
    listTags(): Promise<string[]>;
    listDeckTags(deckId: string): Promise<string[]>;
    get(id: string): Promise<CardWithMeta | undefined>;
    create(input: {
      deckId: string;
      front: string;
      back: string;
      type?: string;
      tags?: string[];
    }): Promise<CardWithMeta>;
    update(input: {
      id: string;
      front?: string;
      back?: string;
      type?: string;
      tags?: string[];
    }): Promise<CardWithMeta | undefined>;
    delete(id: string): Promise<{ ok: true }>;
  };
  review: {
    queue(deckId: string): Promise<CardWithMeta[]>;
    queueAll(): Promise<BrowseCard[]>;
    preview(cardId: string): Promise<PreviewOption[]>;
    rate(cardId: string, rating: Grade): Promise<CardWithMeta>;
  };
  graph: {
    get(deckId: string): Promise<DeckGraph>;
    addPrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
    removePrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
    saveLayout(
      deckId: string,
      placements: { cardId: string; x: number; y: number }[],
    ): Promise<{ ok: true }>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: SettingsUpdate): Promise<Settings>;
  };
  mcp: {
    getSetup(): Promise<McpSetup>;
  };
  import: {
    analyzeAnki(bytes: Uint8Array, fileName: string): Promise<AnkiAnalysis>;
    commitAnki(input: {
      importId: string;
      deckName: string;
      keepScheduling: boolean;
      deckStrategy: "single" | "separate";
    }): Promise<AnkiImportResult>;
    createDeckWithCards(input: {
      name: string;
      description?: string | null;
      cards: { front: string; back: string; tags?: string[] }[];
    }): Promise<{ deckId: string; cardCount: number }>;
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

declare global {
  interface Window {
    armin: ArminApi;
    arminShell?: ArminShell;
    __ARMIN_E2E__?: boolean;
  }
}

export type {
  Card,
  Deck,
  Settings,
  DeckWithStats,
  CardWithMeta,
  BrowseCard,
  PreviewOption,
  DeckGraph,
};
