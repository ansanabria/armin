import type { CardState } from "@/components/ui/badge";
import type {
  BrowseCard,
  CardWithMeta,
  DeckGraph,
  DeckWithStats,
} from "@/types/window";

export type UiDeck = DeckWithStats;

export type UiCard = {
  id: string;
  deckId: string;
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
  front: string;
  back: string;
  deck?: string;
  deckId?: string;
};

export type UiGraphNode = {
  id: string;
  front: string;
  back: string;
  state: CardState;
  locked: boolean;
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

export function formatDueLabel(card: CardWithMeta, now = new Date()) {
  if (card.locked) return "Locked";
  if (card.state === 0) return "New";

  const due = toDate(card.due);
  if (!due || due <= now) return "Due now";
  return compactFutureLabel(due, now);
}

export function toUiCard(card: CardWithMeta): UiCard {
  return {
    id: card.id,
    deckId: card.deckId,
    front: card.front,
    back: card.back,
    state: card.state as CardState,
    locked: card.locked,
    dueLabel: formatDueLabel(card),
    createdAt: toDate(card.createdAt)?.toISOString() ?? "",
    tags: card.tags,
  };
}

export function toUiBrowseCard(card: BrowseCard): UiBrowseCard {
  return {
    ...toUiCard(card),
    deckName: card.deckName,
  };
}

export function toUiReviewCard(card: CardWithMeta | BrowseCard): UiReviewCard {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    deck: "deckName" in card ? card.deckName : undefined,
    deckId: card.deckId,
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
