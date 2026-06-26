import { graphlib, layout } from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

export const CARD_NODE_WIDTH = 240;
export const CARD_NODE_HEIGHT = 116;

const NODE_SEP = 48;
const RANK_SEP = 72;
// Spacing between disconnected components once they're packed into a grid.
const COMPONENT_GAP_X = 64;
const COMPONENT_GAP_Y = 64;

type Placed<T extends Record<string, unknown>> = {
  node: Node<T>;
  position: { x: number; y: number };
};

type Component<T extends Record<string, unknown>> = {
  nodes: Node<T>[];
  edges: Edge[];
};

/** Group nodes into connected components, treating edges as undirected. */
function connectedComponents<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): Component<T>[] {
  const parent = new Map<string, string>();
  const nodeById = new Map<string, Node<T>>();
  for (const node of nodes) {
    parent.set(node.id, node.id);
    nodeById.set(node.id, node);
  }

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression.
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target);
    }
  }

  const groups = new Map<string, Component<T>>();
  for (const node of nodes) {
    const id = node.id;
    const root = find(id);
    const group = groups.get(root);
    if (group) group.nodes.push(node);
    else groups.set(root, { nodes: [node], edges: [] });
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    groups.get(find(edge.source))?.edges.push(edge);
  }

  return [...groups.values()];
}

/** Lay out a single component with dagre, normalised so its top-left is (0, 0). */
function layoutComponent<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): { placements: Placed<T>[]; width: number; height: number } {
  if (nodes.length === 1 && edges.length === 0) {
    return {
      placements: [{ node: nodes[0], position: { x: 0, y: 0 } }],
      width: CARD_NODE_WIDTH,
      height: CARD_NODE_HEIGHT,
    };
  }

  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: NODE_SEP, ranksep: RANK_SEP });

  for (const node of nodes) {
    g.setNode(node.id, { width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  layout(g);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const raw = nodes.map((node) => {
    const pos = g.node(node.id);
    const x = pos.x - CARD_NODE_WIDTH / 2;
    const y = pos.y - CARD_NODE_HEIGHT / 2;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + CARD_NODE_WIDTH);
    maxY = Math.max(maxY, y + CARD_NODE_HEIGHT);
    return { node, x, y };
  });

  const placements = raw.map(({ node, x, y }) => ({
    node,
    position: { x: x - minX, y: y - minY },
  }));

  return { placements, width: maxX - minX, height: maxY - minY };
}

/**
 * Auto-arrange the graph. Each connected component keeps its dagre tree shape;
 * the components are then packed into a wrapped grid so a deck made of many
 * isolated cards (or several small trees) reads as a navigable grid rather than
 * one long horizontal row.
 */
export function layoutGraph<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): { nodes: Node<T>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const laidOut = connectedComponents(nodes, edges).map((component) =>
    layoutComponent(component.nodes, component.edges),
  );

  // Pack components into rows, wrapping once a row exceeds a target width that
  // keeps the overall arrangement roughly square.
  const totalArea = laidOut.reduce(
    (sum, c) =>
      sum + (c.width + COMPONENT_GAP_X) * (c.height + COMPONENT_GAP_Y),
    0,
  );
  const widestComponent = laidOut.reduce((m, c) => Math.max(m, c.width), 0);
  const targetRowWidth = Math.max(widestComponent, Math.sqrt(totalArea));

  const positioned = new Map<string, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const component of laidOut) {
    if (cursorX > 0 && cursorX + component.width > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + COMPONENT_GAP_Y;
      rowHeight = 0;
    }

    for (const { node, position } of component.placements) {
      positioned.set(node.id, {
        x: cursorX + position.x,
        y: cursorY + position.y,
      });
    }

    cursorX += component.width + COMPONENT_GAP_X;
    rowHeight = Math.max(rowHeight, component.height);
  }

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
    position: positioned.get(node.id) ?? node.position,
  }));

  return { nodes: layoutedNodes, edges };
}
