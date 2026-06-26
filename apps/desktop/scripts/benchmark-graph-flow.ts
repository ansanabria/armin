import { performance } from "node:perf_hooks";
import { graphToFlowElements } from "../src/renderer/lib/graph-flow";
import type { UiDeckGraph } from "../src/renderer/types/view-models";

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const cardCount = numberFromEnv("CARD_COUNT", 471);
const deckCount = numberFromEnv("DECK_COUNT", 8);
const edgeCount = numberFromEnv("EDGE_COUNT", 190);
const placedRatio = Number.parseFloat(process.env.PLACED_RATIO ?? "0.5");
const contentRepeat = numberFromEnv("CONTENT_REPEAT", 1);

const graph: UiDeckGraph = {
  nodes: Array.from({ length: cardCount }, (_, index) => {
    const placed = index / Math.max(1, cardCount) < placedRatio;
    return {
      id: `card-${index}`,
      deckId: `deck-${index % deckCount}`,
      front: `Synthetic front ${index} ${"with long markdown-ish content ".repeat(contentRepeat)}`,
      back: `Synthetic back ${index} ${"with additional explanation text ".repeat(contentRepeat)}`,
      type: "basic",
      state: 0,
      locked: false,
      x: placed ? (index % 20) * 288 : null,
      y: placed ? Math.floor(index / 20) * 172 : null,
    };
  }),
  edges: Array.from({ length: edgeCount }, (_, index) => ({
    prereqId: `card-${index % cardCount}`,
    dependentId: `card-${(index * 7 + 1) % cardCount}`,
  })).filter((edge) => edge.prereqId !== edge.dependentId),
};

const savedPositions = new Map(
  graph.nodes
    .filter((node) => node.x != null && node.y != null)
    .map((node) => [node.id, { x: node.x!, y: node.y! }]),
);

const started = performance.now();
const result = graphToFlowElements(graph, savedPositions);
const durationMs = performance.now() - started;

console.log(
  JSON.stringify(
    {
      cardCount,
      deckCount,
      edgeCount: graph.edges.length,
      placedRatio,
      contentRepeat,
      nodes: result.nodes.length,
      edges: result.edges.length,
      durationMs: Number(durationMs.toFixed(2)),
    },
    null,
    2,
  ),
);
