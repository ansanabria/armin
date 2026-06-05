import type { Card, Deck, Settings } from "../../main/db/schema";
import type { DeckWithStats } from "../../main/services/decks";
import type { SettingsUpdate } from "../../main/services/settings";
import type { PreviewOption } from "../../main/services/review";
import type { DeckGraph } from "../../main/services/graph";

export type Grade = 1 | 2 | 3 | 4;

export interface ArminApi {
  decks: {
    list(): Promise<DeckWithStats[]>;
    get(id: string): Promise<Deck | undefined>;
    create(input: { name: string; description?: string | null }): Promise<Deck>;
    update(input: {
      id: string;
      name?: string;
      description?: string | null;
    }): Promise<Deck | undefined>;
    delete(id: string): Promise<{ ok: true }>;
  };
  cards: {
    list(deckId: string): Promise<Card[]>;
    get(id: string): Promise<Card | undefined>;
    create(input: {
      deckId: string;
      front: string;
      back: string;
      type?: string;
    }): Promise<Card>;
    update(input: {
      id: string;
      front?: string;
      back?: string;
      type?: string;
    }): Promise<Card | undefined>;
    delete(id: string): Promise<{ ok: true }>;
  };
  review: {
    queue(deckId: string): Promise<Card[]>;
    preview(cardId: string): Promise<PreviewOption[]>;
    rate(cardId: string, rating: Grade): Promise<Card>;
  };
  graph: {
    get(deckId: string): Promise<DeckGraph>;
    addPrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
    removePrereq(prereqId: string, dependentId: string): Promise<{ ok: true }>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: SettingsUpdate): Promise<Settings>;
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
  }
}

export type { Card, Deck, Settings, DeckWithStats, PreviewOption, DeckGraph };
