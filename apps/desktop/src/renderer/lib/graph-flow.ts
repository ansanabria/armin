import { MarkerType, type Edge, type XYPosition } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";
import { CARD_NODE_HEIGHT, CARD_NODE_WIDTH } from "@/lib/graph-layout";
import type { CardFlowNode } from "@/components/prerequisite-graph/flashcard-node";

const CARD_PREVIEW_LIMIT = 240;

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

export type EdgeEmphasis = "active" | "dimmed" | null;

export type GraphFlowEdgeData = { emphasis: EdgeEmphasis };

export type GraphFlowEdge = Edge<GraphFlowEdgeData>;

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
    data: { emphasis: null },
  } as GraphFlowEdge;
}

/**
 * Restyle an edge for the selection lens: edges incident to the selected node
 * paint accent, the rest fade back. Returns a new edge so React Flow re-renders.
 */
export function styleEdgeForEmphasis(edge: Edge, emphasis: EdgeEmphasis): Edge {
  if (
    (edge.data as Partial<GraphFlowEdgeData> | undefined)?.emphasis === emphasis
  ) {
    return edge;
  }
  if (emphasis === "active") {
    return {
      ...edge,
      data: { ...edge.data, emphasis },
      markerEnd: EDGE_MARKER_END_ACCENT,
      style: { stroke: EDGE_STROKE_ACCENT, strokeWidth: 2 },
    };
  }
  return {
    ...edge,
    data: { ...edge.data, emphasis },
    markerEnd: EDGE_MARKER_END,
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.5,
      opacity: emphasis === "dimmed" ? 0.25 : 1,
    },
  };
}

export function incidentNodeIdsOf(edges: UiDeckGraph["edges"]): Set<string> {
  const incident = new Set<string>();
  for (const edge of edges) {
    incident.add(edge.prereqId);
    incident.add(edge.dependentId);
  }
  return incident;
}

function fallbackPositionFor(index: number) {
  const columns = 5;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: column * (CARD_NODE_WIDTH + 48),
    y: row * (CARD_NODE_HEIGHT + 56),
  };
}

export function graphNodePreview(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= CARD_PREVIEW_LIMIT) return compact;
  return `${compact.slice(0, CARD_PREVIEW_LIMIT - 1).trimEnd()}…`;
}

export function toFlowNode(
  node: UiDeckGraph["nodes"][number],
  incidentNodeIds: Set<string>,
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
      front: graphNodePreview(node.front),
      back: graphNodePreview(node.back),
      type: node.type,
      state: node.state,
      locked: node.locked,
      isIsolated: !incidentNodeIds.has(node.id),
      emphasis: null,
    },
  };
}

export function graphToFlowElements(
  graph: UiDeckGraph,
  savedPositions?: Map<string, { x: number; y: number }>,
): { nodes: CardFlowNode[]; edges: Edge[] } {
  const incidentNodeIds = incidentNodeIdsOf(graph.edges);
  const nodes: CardFlowNode[] = graph.nodes.map((n, index) =>
    toFlowNode(
      n,
      incidentNodeIds,
      savedPositions?.get(n.id) ?? fallbackPositionFor(index),
    ),
  );
  const edges = graph.edges.map((e) => makeFlowEdge(e.prereqId, e.dependentId));
  return { nodes, edges };
}

/**
 * Yield the renderer thread between chunks so Electron/browser input and
 * navigation can run during a large initial graph build. Prefers
 * `requestIdleCallback` (with a timeout so it still fires under constant
 * activity) and falls back to a macrotask when it isn't available.
 */
function yieldToScheduler(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

type BuildGraphFlowElementsOptions = {
  signal: AbortSignal;
  chunkSize?: number;
};

/**
 * Abortable, chunked version of {@link graphToFlowElements}. Builds flow nodes
 * and edges in bounded batches, yielding between batches so a large Deck graph
 * doesn't monopolize the renderer thread. Resolves `null` if the signal aborts
 * before the build finishes, so a cancelled load never commits into an
 * unmounted canvas.
 */
export async function buildGraphFlowElementsAsync(
  graph: UiDeckGraph,
  savedPositions: Map<string, XYPosition>,
  options: BuildGraphFlowElementsOptions,
): Promise<{ nodes: CardFlowNode[]; edges: Edge[] } | null> {
  // Building flow objects is cheap; the canvas is virtualized so it only mounts
  // the on-screen nodes. The chunk boundary exists only to release the thread on
  // pathologically large graphs — keep it high enough that realistic decks build
  // in a single pass with no yield latency.
  const { signal, chunkSize = 1000 } = options;
  if (signal.aborted) return null;

  const incidentNodeIds = incidentNodeIdsOf(graph.edges);

  const nodes: CardFlowNode[] = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    nodes.push(
      toFlowNode(
        node,
        incidentNodeIds,
        savedPositions.get(node.id) ?? fallbackPositionFor(index),
      ),
    );
    if ((index + 1) % chunkSize === 0) {
      await yieldToScheduler();
      if (signal.aborted) return null;
    }
  }

  const edges: Edge[] = [];
  for (let index = 0; index < graph.edges.length; index++) {
    const edge = graph.edges[index];
    edges.push(makeFlowEdge(edge.prereqId, edge.dependentId));
    if ((index + 1) % chunkSize === 0) {
      await yieldToScheduler();
      if (signal.aborted) return null;
    }
  }

  if (signal.aborted) return null;
  return { nodes, edges };
}

export function refreshNodeData(
  nodes: CardFlowNode[],
  edges: UiDeckGraph["edges"],
): CardFlowNode[] {
  const incidentNodeIds = incidentNodeIdsOf(edges);
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const isIsolated = !incidentNodeIds.has(node.id);
    if (node.data.isIsolated === isIsolated) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        isIsolated,
      },
    };
  });
  return changed ? nextNodes : nodes;
}
