import { MarkerType, type Edge } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";
import { isIsolatedNode } from "@/lib/graph-cycle";
import {
  CARD_NODE_HEIGHT,
  CARD_NODE_WIDTH,
  layoutGraph,
} from "@/lib/graph-layout";
import type {
  CardFlowNode,
  CardNodeData,
} from "@/components/prerequisite-graph/flashcard-node";

export const EDGE_STROKE = "var(--color-border-strong)";
export const EDGE_STROKE_ACCENT = "var(--color-accent)";

export const EDGE_MARKER_END = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-border-strong)",
} as const;

export const EDGE_MARKER_END_ACCENT = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-accent)",
} as const;

export function makeFlowEdge(prereqId: string, dependentId: string): Edge {
  return {
    id: `${prereqId}-${dependentId}`,
    source: prereqId,
    target: dependentId,
    type: "floating",
    markerEnd: EDGE_MARKER_END,
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.5,
    },
  } as Edge;
}

export type EdgeEmphasis = "active" | "dimmed" | null;

/**
 * Restyle an edge for the selection lens: edges incident to the selected node
 * paint accent, the rest fade back. Returns a new edge so React Flow re-renders.
 */
export function styleEdgeForEmphasis(edge: Edge, emphasis: EdgeEmphasis): Edge {
  if (emphasis === "active") {
    return {
      ...edge,
      markerEnd: EDGE_MARKER_END_ACCENT,
      style: { stroke: EDGE_STROKE_ACCENT, strokeWidth: 2 },
    };
  }
  return {
    ...edge,
    markerEnd: EDGE_MARKER_END,
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.5,
      opacity: emphasis === "dimmed" ? 0.25 : 1,
    },
  };
}

export function toFlowNode(
  node: UiDeckGraph["nodes"][number],
  edges: UiDeckGraph["edges"],
  position = { x: 0, y: 0 },
): CardFlowNode {
  return {
    id: node.id,
    type: "card",
    position,
    // Known size up front so `fitView` can frame the graph on the first paint,
    // before nodes are measured in the DOM (avoids an unfitted flash).
    initialWidth: CARD_NODE_WIDTH,
    initialHeight: CARD_NODE_HEIGHT,
    data: {
      front: node.front,
      back: node.back,
      type: node.type,
      state: node.state,
      locked: node.locked,
      isIsolated: isIsolatedNode(node.id, edges),
      deckName: node.deckName,
      deckColor: node.deckColor,
      emphasis: null,
    },
  };
}

export function graphToFlowElements(
  graph: UiDeckGraph,
  savedPositions?: Map<string, { x: number; y: number }>,
): { nodes: CardFlowNode[]; edges: Edge[] } {
  const nodes: CardFlowNode[] = graph.nodes.map((n) =>
    toFlowNode(n, graph.edges, savedPositions?.get(n.id) ?? { x: 0, y: 0 }),
  );
  const edges = graph.edges.map((e) => makeFlowEdge(e.prereqId, e.dependentId));

  // Every card already has a saved position — render it exactly as left.
  const allPlaced =
    graph.nodes.length > 0 &&
    graph.nodes.every((n) => savedPositions?.has(n.id));
  if (allPlaced) return { nodes, edges };

  // Otherwise auto-layout, then re-apply any saved positions so previously
  // placed cards stay put while brand-new ones get a sensible dagre slot.
  const laidOut = layoutGraph<CardNodeData>(nodes, edges) as {
    nodes: CardFlowNode[];
    edges: Edge[];
  };
  if (!savedPositions || savedPositions.size === 0) return laidOut;

  return {
    nodes: laidOut.nodes.map((node) => {
      const saved = savedPositions.get(node.id);
      return saved ? { ...node, position: saved } : node;
    }),
    edges: laidOut.edges,
  };
}

export function refreshNodeData(
  nodes: CardFlowNode[],
  edges: UiDeckGraph["edges"],
): CardFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isIsolated: isIsolatedNode(node.id, edges),
    },
  }));
}
