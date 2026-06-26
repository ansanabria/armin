import { describe, expect, it } from "vitest";
import {
  createGraphCycleIndex,
  graphEdgeKey,
  wouldCreateCycle,
  wouldCreateCycleIndexed,
  type GraphEdge,
} from "./graph-cycle";

describe("graph cycle indexes", () => {
  it("matches the one-off cycle check", () => {
    const edges: GraphEdge[] = [
      { prereqId: "a", dependentId: "b" },
      { prereqId: "b", dependentId: "c" },
    ];
    const index = createGraphCycleIndex(edges);

    expect(index.edgeKeys.has(graphEdgeKey("a", "b"))).toBe(true);
    expect(wouldCreateCycleIndexed(index, "c", "a")).toBe(
      wouldCreateCycle(edges, "c", "a"),
    );
    expect(wouldCreateCycleIndexed(index, "a", "c")).toBe(
      wouldCreateCycle(edges, "a", "c"),
    );
  });
});
