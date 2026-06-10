import { describe, expect, it } from "vitest";
import {
  clozeClusters,
  generateReviewItems,
  matchesTypeAnswer,
  noteDisplay,
  normalizeAnswer,
  parseClozes,
  renderClozeText,
  validateContent,
  type DiagramContent,
} from "./card-types";

describe("cloze parsing", () => {
  it("extracts deletions with clusters and optional hints", () => {
    const text = "The {{c1::mitochondria}} powers the {{c2::cell::organelle}}.";
    expect(parseClozes(text)).toEqual([
      { cluster: 1, answer: "mitochondria", hint: undefined },
      { cluster: 2, answer: "cell", hint: "organelle" },
    ]);
  });

  it("dedupes and sorts cluster numbers", () => {
    expect(clozeClusters("{{c2::b}} {{c1::a}} {{c2::c}}")).toEqual([1, 2]);
  });

  it("blanks the target cluster and reveals the rest", () => {
    const text = "The {{c1::mitochondria}} powers the {{c2::cell}}.";
    expect(renderClozeText(text, 1)).toBe("The […] powers the cell.");
    expect(renderClozeText(text, 2)).toBe("The mitochondria powers the […].");
    expect(renderClozeText(text, null)).toBe(
      "The mitochondria powers the cell.",
    );
  });

  it("uses the hint inside the blank when present", () => {
    expect(renderClozeText("{{c1::Paris::capital}}", 1)).toBe("[capital]");
  });
});

describe("generateReviewItems", () => {
  it("makes one item for basic", () => {
    expect(generateReviewItems("basic", { front: "F", back: "B" })).toEqual([
      { subKey: "", front: "F", back: "B" },
    ]);
  });

  it("makes forward and reverse items for basic_reversed", () => {
    expect(
      generateReviewItems("basic_reversed", { front: "F", back: "B" }),
    ).toEqual([
      { subKey: "fwd", front: "F", back: "B" },
      { subKey: "rev", front: "B", back: "F" },
    ]);
  });

  it("makes one item per cloze cluster", () => {
    const items = generateReviewItems("cloze", {
      text: "{{c1::a}} and {{c2::b}}",
    });
    expect(items.map((i) => i.subKey)).toEqual(["c1", "c2"]);
    expect(items[0].front).toBe("[…] and b");
    expect(items[1].front).toBe("a and […]");
  });

  it("makes one item per diagram region keyed by region id", () => {
    const content: DiagramContent = {
      image: "data:image/png;base64,AAAA",
      regions: [
        { id: "r1", x: 0, y: 0, w: 0.5, h: 0.5, label: "Heart" },
        {
          id: "r2",
          x: 0.5,
          y: 0.5,
          w: 0.2,
          h: 0.2,
          label: "Lung",
          hint: "air",
        },
      ],
    };
    const items = generateReviewItems("diagram", content);
    expect(items.map((i) => i.subKey)).toEqual(["r1", "r2"]);
    expect(items[0].back).toBe("Heart");
    expect(items[1].front).toContain("air");
  });
});

describe("type_answer matching", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeAnswer("  Hello   World ")).toBe("hello world");
  });

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

describe("noteDisplay", () => {
  it("summarizes each type for tiles", () => {
    expect(noteDisplay("cloze", { text: "{{c1::a}} b" })).toEqual({
      front: "[…] b",
      back: "a b",
    });
    expect(
      noteDisplay("type_answer", {
        prompt: "P",
        answer: "A",
        acceptedAnswers: [],
      }),
    ).toEqual({ front: "P", back: "A" });
  });
});

describe("validateContent", () => {
  it("rejects cloze text without any deletions", () => {
    expect(() =>
      validateContent("cloze", { text: "no clozes here" }),
    ).toThrow();
  });

  it("rejects diagrams without regions", () => {
    expect(() =>
      validateContent("diagram", { image: "data:...", regions: [] }),
    ).toThrow();
  });
});
