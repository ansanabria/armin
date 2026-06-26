import type { Edge, Node, XYPosition } from "@xyflow/react";
import { layoutGraph } from "@/lib/graph-layout";

export type GraphLayoutWorkerNode = {
  id: string;
  position: XYPosition;
  placed: boolean;
};

export type GraphLayoutWorkerEdge = {
  id: string;
  source: string;
  target: string;
};

export type GraphLayoutWorkerRequest = {
  nodes: GraphLayoutWorkerNode[];
  edges: GraphLayoutWorkerEdge[];
};

export type GraphLayoutWorkerResponse = {
  placements: { flashcardId: string; x: number; y: number }[];
  timing: { startedAt: number; finishedAt: number; durationMs: number };
};

export function computeGraphLayoutResponse(
  request: GraphLayoutWorkerRequest,
  now = () => performance.now(),
): GraphLayoutWorkerResponse {
  const startedAt = now();
  const flowNodes: Node<Record<string, unknown>>[] = request.nodes.map(
    (node) => ({
      id: node.id,
      type: "card",
      position: node.position,
      data: {},
    }),
  );
  const flowEdges: Edge[] = request.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));
  const unplacedIds = new Set(
    request.nodes.filter((node) => !node.placed).map((node) => node.id),
  );
  const { nodes } = layoutGraph(flowNodes, flowEdges);
  const finishedAt = now();

  return {
    placements: nodes
      .filter((node) => unplacedIds.has(node.id))
      .map((node) => ({
        flashcardId: node.id,
        x: node.position.x,
        y: node.position.y,
      })),
    timing: {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    },
  };
}
