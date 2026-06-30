import { describe, expect, it } from "vitest";
import { parseBinding } from "./keys";
import { resolve, type FireableCommand } from "./dispatcher";

const fire = (commandId: string, binding: string, depth = 0): FireableCommand => ({
  commandId,
  binding,
  depth,
});

describe("resolve", () => {
  it("fires an exact single-key match", () => {
    const res = resolve(parseBinding("Space"), [fire("review.flip", "Space")]);
    expect(res).toEqual({ type: "fire", commandId: "review.flip" });
  });

  it("waits while a longer chord is still reachable", () => {
    const res = resolve(parseBinding("g"), [fire("nav.decks", "g d")]);
    expect(res).toEqual({ type: "pending" });
  });

  it("fires the completed chord", () => {
    const res = resolve(parseBinding("g d"), [fire("nav.decks", "g d")]);
    expect(res).toEqual({ type: "fire", commandId: "nav.decks" });
  });

  it("returns none when nothing matches", () => {
    const res = resolve(parseBinding("x"), [fire("nav.decks", "g d")]);
    expect(res).toEqual({ type: "none" });
  });

  it("prefers the deeper scope on a tie", () => {
    const res = resolve(parseBinding("Space"), [
      fire("review.flip", "Space", 0),
      fire("cram.flip", "Space", 2),
    ]);
    expect(res).toEqual({ type: "fire", commandId: "cram.flip" });
  });

  it("prefers a pending chord over an available shorter match", () => {
    const res = resolve(parseBinding("g"), [
      fire("nav.decks", "g d", 0),
      fire("some.g", "g", 1),
    ]);
    expect(res).toEqual({ type: "pending" });
  });
});
