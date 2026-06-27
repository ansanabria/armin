import { describe, expect, it } from "vitest";
import {
  generateReviewUnits,
  matchesTypeAnswer,
  renderClozeText,
  validateContent,
  type ImageOcclusionContent,
} from "./flashcard-types";

describe("cloze parsing", () => {
  it("blanks the target cluster and reveals the rest", () => {
    const text = "The {{1::mitochondria}} powers the {{2::cell}}.";
    expect(renderClozeText(text, 1)).toBe("The […] powers the cell.");
    expect(renderClozeText(text, 2)).toBe("The mitochondria powers the […].");
    expect(renderClozeText(text, null)).toBe(
      "The mitochondria powers the cell.",
    );
  });
});

describe("generateReviewUnits", () => {
  it("makes one item for basic", () => {
    expect(generateReviewUnits("basic", { front: "F", back: "B" })).toEqual([
      { subKey: "", front: "F", back: "B" },
    ]);
  });

  it("makes forward and reverse items for basic_reversed", () => {
    expect(
      generateReviewUnits("basic_reversed", { front: "F", back: "B" }),
    ).toEqual([
      { subKey: "", front: "F", back: "B" },
      { subKey: "rev", front: "B", back: "F" },
    ]);
  });

  it("makes one item per cloze cluster", () => {
    const items = generateReviewUnits("cloze", {
      text: "{{1::a}} and {{2::b}}",
    });
    expect(items.map((i) => i.subKey)).toEqual(["c1", "c2"]);
    expect(items[0].front).toBe("[…] and b");
    expect(items[1].front).toBe("a and […]");
  });

  it("makes one item per image occlusion mask keyed by mask id", () => {
    const content: ImageOcclusionContent = {
      baseImage: "data:image/png;base64,AAAA",
      revealMode: "hide_all",
      header: "Anatomy",
      extra: "Review labels.",
      masks: [
        {
          id: "r1",
          geometry: { x: 0, y: 0, w: 0.5, h: 0.5 },
          label: "Heart",
        },
        {
          id: "r2",
          geometry: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
          label: "Lung",
          hint: "air",
        },
      ],
    };
    const items = generateReviewUnits("image_occlusion", content);
    expect(items.map((i) => i.subKey)).toEqual(["r1", "r2"]);
    expect(items[0].back).toBe("Heart");
    expect(items[1].front).toContain("air");
  });
});

describe("type_answer matching", () => {
  it("matches the answer or an accepted alternative", () => {
    const content = {
      prompt: "Capital of France?",
      answer: "Paris",
      acceptedAnswers: ["Ville de Paris"],
    };
    expect(matchesTypeAnswer("paris", content)).toBe(true);
    expect(matchesTypeAnswer(" VILLE de paris ", content)).toBe(true);
    expect(matchesTypeAnswer("Lyon", content)).toBe(false);
    expect(matchesTypeAnswer("", content)).toBe(false);
  });
});

describe("validateContent", () => {
  it("normalizes bare cloze deletions to explicit cluster numbers", () => {
    expect(
      validateContent("cloze", { text: "{{a}} then {{b::hint}}" }),
    ).toEqual({ text: "{{1::a}} then {{2::b::hint}}" });
  });

  it("rejects cloze text without any deletions", () => {
    expect(() =>
      validateContent("cloze", { text: "no clozes here" }),
    ).toThrow();
  });

  it("rejects image occlusion cards without masks", () => {
    expect(() =>
      validateContent("image_occlusion", { baseImage: "data:...", masks: [] }),
    ).toThrow();
  });

  it("defaults image occlusion reveal mode to hide_all", () => {
    expect(
      validateContent("image_occlusion", {
        baseImage: "data:...",
        masks: [{ id: "m1", geometry: { x: 0, y: 0, w: 1, h: 1 } }],
      }),
    ).toMatchObject({ revealMode: "hide_all" });
  });
});
