import type { ArminApi, ArminShell } from "../../shared/armin-api";

declare global {
  interface Window {
    armin: ArminApi;
    arminShell?: ArminShell;
    __ARMIN_E2E__?: boolean;
  }
}

export type {
  ArminApi,
  ArminShell,
  Grade,
  Profile,
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
} from "../../shared/armin-api";
