import { describe, expect, it } from "vitest";
import {
  isStepsPrefix,
  parseBinding,
  serializeStep,
  stepFromEvent,
  stepHasStrongModifier,
} from "./keys";

function fakeEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  } as KeyboardEvent;
}

describe("stepFromEvent", () => {
  it("normalizes Space and lowercases letters", () => {
    expect(serializeStep(stepFromEvent(fakeEvent({ key: " " }))!)).toBe("Space");
    expect(serializeStep(stepFromEvent(fakeEvent({ key: "G" }))!)).toBe("g");
  });

  it("maps Ctrl to the Mod token on non-mac", () => {
    // jsdom navigator.platform is not 'Mac', so Ctrl is Mod here.
    const step = stepFromEvent(fakeEvent({ key: "k", ctrlKey: true }))!;
    expect(serializeStep(step)).toBe("Mod+k");
    expect(stepHasStrongModifier(step)).toBe(true);
  });

  it("treats Shift as a modifier on letters but not on symbol keys", () => {
    expect(serializeStep(stepFromEvent(fakeEvent({ key: "a", shiftKey: true }))!)).toBe(
      "Shift+a",
    );
    // "?" arrives already shift-resolved; Shift is not double-counted.
    expect(serializeStep(stepFromEvent(fakeEvent({ key: "?", shiftKey: true }))!)).toBe(
      "?",
    );
  });

  it("returns null for a bare modifier press", () => {
    expect(stepFromEvent(fakeEvent({ key: "Shift" }))).toBeNull();
  });
});

describe("parseBinding / prefix", () => {
  it("splits a chord into steps", () => {
    expect(parseBinding("g d").map(serializeStep)).toEqual(["g", "d"]);
  });

  it("recognizes a strict prefix", () => {
    const g = parseBinding("g");
    const gd = parseBinding("g d");
    expect(isStepsPrefix(g, gd)).toBe(true);
    expect(isStepsPrefix(gd, g)).toBe(false);
  });
});
