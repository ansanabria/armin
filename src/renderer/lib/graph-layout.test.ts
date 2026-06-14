import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { CARD_NODE_HEIGHT, CARD_NODE_WIDTH, layoutGraph } from "./graph-layout";

type Data = Record<string, unknown>;

function makeNodes(count: number): Node<Data>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: "card",
    position: { x: 0, y: 0 },
    data: {},
  }));
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

function distinctRows(nodes: Node<Data>[]): number {
  return new Set(nodes.map((n) => Math.round(n.position.y))).size;
}

describe("layoutGraph", () => {
  it("packs many isolated cards into a grid, not a single row", () => {
    const { nodes } = layoutGraph(makeNodes(12), []);
    // A single dagre row would put every card at the same y; the grid packer
    // should wrap them across several rows.
    expect(distinctRows(nodes)).toBeGreaterThan(1);
  });

  it("keeps a connected component as a vertical tree", () => {
    const nodes = makeNodes(2);
    const { nodes: laidOut } = layoutGraph(nodes, [makeEdge("n0", "n1")]);
    const [a, b] = laidOut;
    // Prerequisite (source) sits above its dependent (target).
    expect(a.position.y).toBeLessThan(b.position.y);
    expect(a.sourcePosition).toBe("bottom");
    expect(a.targetPosition).toBe("top");
  });

  it("does not overlap isolated cards", () => {
    const { nodes } = layoutGraph(makeNodes(9), []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].position;
        const b = nodes[j].position;
        const overlap =
          Math.abs(a.x - b.x) < CARD_NODE_WIDTH &&
          Math.abs(a.y - b.y) < CARD_NODE_HEIGHT;
        expect(overlap).toBe(false);
      }
    }
  });
});
