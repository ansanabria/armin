import { graphlib, layout } from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

export const CARD_NODE_WIDTH = 240;
export const CARD_NODE_HEIGHT = 116;

export function layoutGraph<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): { nodes: Node<T>[]; edges: Edge[] } {
  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 72 });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: CARD_NODE_WIDTH,
      height: CARD_NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: pos.x - CARD_NODE_WIDTH / 2,
        y: pos.y - CARD_NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
