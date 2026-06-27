import { describe, expect, it } from "vitest";
import type { UiDeckGraph } from "@/types/view-models";
import { graphToFlowElements } from "./graph-flow";

function makeGraph(): UiDeckGraph {
  return {
    nodes: [
      {
        id: "a",
        deckId: "deck-1",
        front: "A",
        back: "Back A",
        type: "basic",
        state: 0,
        locked: false,
        x: 12,
        y: 34,
      },
      {
        id: "b",
        deckId: "deck-1",
        front: "B",
        back: "",
        type: "basic",
        state: 0,
        locked: false,
        x: null,
        y: null,
      },
      {
        id: "c",
        deckId: "deck-2",
        front: "C",
        back: "",
        type: "basic",
        state: 0,
        locked: false,
        x: null,
        y: null,
      },
    ],
    edges: [{ prereqId: "a", dependentId: "b" }],
  };
}

describe("graphToFlowElements", () => {
  it("uses saved positions without running automatic layout", () => {
    const savedPositions = new Map([
      ["a", { x: 12, y: 34 }],
      ["b", { x: 56, y: 78 }],
    ]);

    const { nodes } = graphToFlowElements(makeGraph(), savedPositions);

    expect(nodes.find((node) => node.id === "a")?.position).toEqual({
      x: 12,
      y: 34,
    });
    expect(nodes.find((node) => node.id === "b")?.position).toEqual({
      x: 56,
      y: 78,
    });
  });

  it("assigns deterministic fallback positions to unplaced cards", () => {
    const graph = makeGraph();
    const first = graphToFlowElements(graph);
    const second = graphToFlowElements(graph);

    expect(first.nodes.map((node) => node.position)).toEqual(
      second.nodes.map((node) => node.position),
    );
    expect(first.nodes[0].position).not.toEqual(first.nodes[1].position);
  });

  it("computes isolated status from incident edges", () => {
    const { nodes } = graphToFlowElements(makeGraph());

    expect(nodes.find((node) => node.id === "a")?.data.isIsolated).toBe(false);
    expect(nodes.find((node) => node.id === "b")?.data.isIsolated).toBe(false);
    expect(nodes.find((node) => node.id === "c")?.data.isIsolated).toBe(true);
  });

  it("renders bounded plain previews instead of full card text", () => {
    const graph = makeGraph();
    graph.nodes[0] = {
      ...graph.nodes[0],
      front: `# Heading\n\n${"Long front body ".repeat(80)}`,
      back: `${"Long back body ".repeat(80)}`,
    };

    const { nodes } = graphToFlowElements(graph);
    const node = nodes.find((candidate) => candidate.id === "a");

    expect(node?.data.front.length).toBeLessThanOrEqual(240);
    expect(node?.data.back.length).toBeLessThanOrEqual(240);
    expect(node?.data.front).not.toContain("\n");
    expect(node?.data.front.endsWith("…")).toBe(true);
  });
});
