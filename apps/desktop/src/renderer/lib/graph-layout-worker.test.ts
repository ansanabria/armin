import { describe, expect, it } from "vitest";
import { computeGraphLayoutResponse } from "./graph-layout-worker";

describe("computeGraphLayoutResponse", () => {
  it("returns placements only for unplaced nodes", () => {
    let now = 0;
    const response = computeGraphLayoutResponse(
      {
        requestId: 1,
        nodes: [
          { id: "a", position: { x: 100, y: 100 }, placed: true },
          { id: "b", position: { x: 0, y: 0 }, placed: false },
        ],
        edges: [{ source: "a", target: "b" }],
      },
      () => now++,
    );

    expect(response.requestId).toBe(1);
    expect(response.placements).toHaveLength(1);
    expect(response.placements[0].flashcardId).toBe("b");
    expect(response.timing.durationMs).toBe(1);
  });
});
