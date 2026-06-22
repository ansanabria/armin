import { describe, expect, it } from "vitest";
import {
  activeUnitIds,
  answerHead,
  buildDrillIndex,
  isDrillDone,
  type DrillState,
} from "./cram-drill";

const unit = (id: string, flashcardId: string) => ({ id, flashcardId });

function seed(index: ReturnType<typeof buildDrillIndex>): DrillState {
  const cleared = new Set<string>();
  return { cleared, queue: activeUnitIds(index, cleared) };
}

describe("free drill", () => {
  it("re-queues a missed unit to the back until it is cleared", () => {
    const index = buildDrillIndex(
      [unit("u1", "f1"), unit("u2", "f2")],
      [
        { flashcardId: "f1", reviewUnitIds: ["u1"] },
        { flashcardId: "f2", reviewUnitIds: ["u2"] },
      ],
      [],
      "free",
    );
    let state = seed(index);
    expect(state.queue).toEqual(["u1", "u2"]);

    // Miss the head: it rotates behind the other card rather than disappearing.
    state = answerHead(index, state, false);
    expect(state.queue).toEqual(["u2", "u1"]);
    expect(state.cleared.size).toBe(0);

    // Clear both: the session ends only once nothing is left.
    state = answerHead(index, state, true); // clears u2
    state = answerHead(index, state, true); // clears u1
    expect(isDrillDone(index, state)).toBe(true);
    expect(state.queue).toEqual([]);
  });
});

describe("graph-follow drill", () => {
  it("keeps a dependent locked until its prerequisite flashcard is wholly cleared", () => {
    // f1 generates two units; f2 depends on f1.
    const index = buildDrillIndex(
      [unit("p1", "f1"), unit("p2", "f1"), unit("d1", "f2")],
      [
        { flashcardId: "f1", reviewUnitIds: ["p1", "p2"] },
        { flashcardId: "f2", reviewUnitIds: ["d1"] },
      ],
      [{ prereqId: "f1", dependentId: "f2" }],
      "graph",
    );
    let state = seed(index);
    // Only the prereq's units are available at first.
    expect(new Set(state.queue)).toEqual(new Set(["p1", "p2"]));

    // Clearing one of the prereq's two units does NOT unlock the dependent yet.
    state = answerHead(index, state, true);
    expect(state.queue.includes("d1")).toBe(false);

    // Clearing the second unit completes the flashcard and unlocks the dependent.
    state = answerHead(index, state, true);
    expect(state.queue).toEqual(["d1"]);

    state = answerHead(index, state, true);
    expect(isDrillDone(index, state)).toBe(true);
  });

  it("treats a card whose only prerequisite is out of scope as a root", () => {
    // The out-of-scope edge is absent from the pool, so f2 has no in-scope
    // prerequisite and is immediately available.
    const index = buildDrillIndex(
      [unit("d1", "f2")],
      [{ flashcardId: "f2", reviewUnitIds: ["d1"] }],
      [],
      "graph",
    );
    const state = seed(index);
    expect(state.queue).toEqual(["d1"]);
  });

  it("includes a brand-new prerequisite card and gates its dependents on clearing it", () => {
    // f1 is never-studied (no special state needed here — it is just a unit in
    // the pool). Its dependent stays out until f1 is cleared.
    const index = buildDrillIndex(
      [unit("n1", "f1"), unit("d1", "f2")],
      [
        { flashcardId: "f1", reviewUnitIds: ["n1"] },
        { flashcardId: "f2", reviewUnitIds: ["d1"] },
      ],
      [{ prereqId: "f1", dependentId: "f2" }],
      "graph",
    );
    let state = seed(index);
    expect(state.queue).toEqual(["n1"]);

    state = answerHead(index, state, true);
    expect(state.queue).toEqual(["d1"]);
  });
});
