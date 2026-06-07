import { MarkerType, type Edge } from "@xyflow/react";
import type { UiDeckGraph } from "@/data/fixtures";
import { isIsolatedNode } from "@/lib/graph-cycle";
import { CARD_NODE_HEIGHT, CARD_NODE_WIDTH, layoutGraph } from "@/lib/graph-layout";
import type { CardFlowNode, CardNodeData } from "@/components/prerequisite-graph/card-node";

export const EDGE_STROKE = "var(--color-border-strong)";

export const EDGE_MARKER_END = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-border-strong)",
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
      state: node.state,
      locked: node.locked,
      isIsolated: isIsolatedNode(node.id, edges),
    },
  };
}

export function graphToFlowElements(
  graph: UiDeckGraph,
  existingPositions?: Map<string, { x: number; y: number }>,
): { nodes: CardFlowNode[]; edges: Edge[] } {
  const nodes: CardFlowNode[] = graph.nodes.map((n) =>
    toFlowNode(n, graph.edges, existingPositions?.get(n.id) ?? { x: 0, y: 0 }),
  );
  const edges = graph.edges.map((e) =>
    makeFlowEdge(e.prereqId, e.dependentId),
  );

  if (!existingPositions || existingPositions.size === 0) {
    return layoutGraph<CardNodeData>(nodes, edges) as {
      nodes: CardFlowNode[];
      edges: Edge[];
    };
  }

  return { nodes, edges };
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
