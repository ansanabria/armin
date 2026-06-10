import type { CardState } from "@/components/ui/badge";
import type {
  BrowseNote,
  CardContent,
  CardType,
  DeckGraph,
  DeckWithStats,
  NoteWithMeta,
  ReviewQueueItem,
} from "@/types/window";

export type UiDeck = DeckWithStats;

export type UiCard = {
  id: string;
  deckId: string;
  type: CardType;
  content: CardContent;
  front: string;
  back: string;
  state: CardState;
  locked: boolean;
  dueLabel: string;
  createdAt: string;
  tags: string[];
};

export type UiBrowseCard = UiCard & {
  deckName: string;
};

export type UiReviewCard = {
  id: string;
  noteId: string;
  type: CardType;
  content: CardContent;
  subKey: string;
  front: string;
  back: string;
  deck?: string;
  deckId?: string;
};

export type UiGraphNode = {
  id: string;
  front: string;
  back: string;
  type: CardType;
  state: CardState;
  locked: boolean;
  x: number | null;
  y: number | null;
};

export type UiGraphEdge = {
  prereqId: string;
  dependentId: string;
};

export type UiDeckGraph = {
  nodes: UiGraphNode[];
  edges: UiGraphEdge[];
};

function toDate(value: Date | string | number | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function compactFutureLabel(due: Date, now = new Date()) {
  const ms = Math.max(0, due.getTime() - now.getTime());
  const mins = Math.ceil(ms / 60_000);

  if (mins < 60) return `in ${Math.max(1, mins)}m`;

  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.ceil(ms / 86_400_000);
  if (days < 30) return `in ${days} ${days === 1 ? "day" : "days"}`;

  const months = Math.ceil(days / 30);
  if (months < 12) return `in ${months}mo`;

  const years = Math.ceil(days / 365);
  return `in ${years}y`;
}

export function formatDueLabel(
  card: { locked: boolean; state: number; due: Date | string | number },
  now = new Date(),
) {
  if (card.locked) return "Locked";
  if (card.state === 0) return "New";

  const due = toDate(card.due);
  if (!due || due <= now) return "Due now";
  return compactFutureLabel(due, now);
}

export function toUiCard(note: NoteWithMeta): UiCard {
  return {
    id: note.id,
    deckId: note.deckId,
    type: note.type,
    content: note.content,
    front: note.front,
    back: note.back,
    state: note.state as CardState,
    locked: note.locked,
    dueLabel: formatDueLabel(note),
    createdAt: toDate(note.createdAt)?.toISOString() ?? "",
    tags: note.tags,
  };
}

export function toUiBrowseCard(note: BrowseNote): UiBrowseCard {
  return {
    ...toUiCard(note),
    deckName: note.deckName,
  };
}

export function toUiReviewCard(item: ReviewQueueItem): UiReviewCard {
  return {
    id: item.cardId,
    noteId: item.noteId,
    type: item.type,
    content: item.content,
    subKey: item.subKey,
    front: item.front,
    back: item.back,
    deck: item.deckName,
    deckId: item.deckId,
  };
}

export function toUiDeckGraph(graph: DeckGraph): UiDeckGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      state: node.state as CardState,
    })),
    edges: graph.edges,
  };
}
