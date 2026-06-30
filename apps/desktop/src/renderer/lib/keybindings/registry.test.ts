import { describe, expect, it } from "vitest";
import {
  COMMAND_BY_ID,
  diffFromFactory,
  factoryKeymap,
  findConflict,
  findSharedBindingCommands,
  resolveKeymap,
} from "./registry";

describe("keymap resolution", () => {
  it("layers a profile override diff over the factory defaults", () => {
    const keymap = resolveKeymap({ "review.flip": "Enter" });
    expect(keymap["review.flip"]).toBe("Enter");
    expect(keymap["nav.decks"]).toBe("g d"); // untouched factory default
  });

  it("ignores overrides for unknown command ids", () => {
    const keymap = resolveKeymap({ "made.up": "x" });
    expect(keymap["made.up" as never]).toBeUndefined();
  });

  it("diffs only the bindings that differ from factory", () => {
    const keymap = { ...factoryKeymap(), "review.flip": "Enter" };
    expect(diffFromFactory(keymap)).toEqual({ "review.flip": "Enter" });
  });
});

describe("conflict detection", () => {
  const flip = COMMAND_BY_ID.get("review.flip")!;

  it("blocks a duplicate within the same scope", () => {
    const keymap = factoryKeymap();
    // "1" already belongs to review.rate.again in the review scope.
    expect(findConflict(keymap, flip, "1")).toEqual({
      kind: "duplicate",
      commandId: "review.rate.again",
    });
  });

  it("allows the same key in a different scope", () => {
    const keymap = factoryKeymap();
    // cram.flip uses Space too, but it's a different scope — not a conflict.
    expect(findConflict(keymap, flip, "Space")).toBeNull();
  });

  it("blocks a binding that prefixes another in the scope", () => {
    const decks = COMMAND_BY_ID.get("nav.decks")!;
    const keymap = factoryKeymap();
    // bare "g" would prefix the "g b"/"g c"/… chords in the global scope.
    expect(findConflict(keymap, decks, "g")?.kind).toBe("prefix");
  });

  it("blocks a route binding that prefixes an always-active global chord", () => {
    const keymap = factoryKeymap();
    // `global` is always active beneath the review scope, so binding a review
    // action to bare "g" would be swallowed by the pending "g d"/"g b" chords.
    expect(findConflict(keymap, flip, "g")).toEqual({
      kind: "prefix",
      commandId: "nav.decks",
    });
  });

  it("blocks reusing a global binding that a route scope already shadows", () => {
    const palette = COMMAND_BY_ID.get("palette.open")!;
    const keymap = factoryKeymap();
    // "1" belongs to review.rate.again; a global command rebound to "1" would be
    // shadowed during review, where the deeper scope wins the exact match.
    expect(findConflict(keymap, palette, "1")).toEqual({
      kind: "duplicate",
      commandId: "review.rate.again",
    });
  });

  it("blocks reserved keys owned by intrinsic handlers", () => {
    expect(findConflict(factoryKeymap(), flip, "Escape")).toEqual({
      kind: "reserved",
    });
  });

  it("reports cross-scope shared bindings as informational", () => {
    const shared = findSharedBindingCommands(factoryKeymap(), flip, "Space");
    expect(shared.map((c) => c.id)).toContain("cram.flip");
  });
});
