import { describe, expect, it } from "vitest";
import {
  clozeNumbers,
  hasClozeMarkers,
  renderCloze,
  renderTemplate,
  stripHtmlToText,
} from "./template";

describe("renderTemplate", () => {
  const fields = { Front: "What is 2+2?", Back: "4", Extra: "" };

  it("substitutes plain fields", () => {
    expect(renderTemplate("{{Front}}", fields)).toBe("What is 2+2?");
  });

  it("substitutes FrontSide on the answer template", () => {
    const front = renderTemplate("{{Front}}", fields);
    expect(renderTemplate("{{FrontSide}}<hr>{{Back}}", fields, front)).toBe(
      "What is 2+2?<hr>4",
    );
  });

  it("keeps non-empty positive sections and drops empty ones", () => {
    expect(renderTemplate("{{#Back}}A: {{Back}}{{/Back}}", fields)).toBe(
      "A: 4",
    );
    expect(renderTemplate("{{#Extra}}{{Extra}}{{/Extra}}", fields)).toBe("");
  });

  it("renders negative sections when the field is empty", () => {
    expect(renderTemplate("{{^Extra}}none{{/Extra}}", fields)).toBe("none");
    expect(renderTemplate("{{^Back}}none{{/Back}}", fields)).toBe("");
  });

  it("handles nested sections", () => {
    const t = "{{#Front}}{{#Back}}{{Front}}={{Back}}{{/Back}}{{/Front}}";
    expect(renderTemplate(t, fields)).toBe("What is 2+2?=4");
  });

  it("applies the text filter and strips tts", () => {
    const f = { Word: "<b>hi</b>" };
    expect(renderTemplate("{{text:Word}}", f)).toBe("hi");
    expect(renderTemplate("{{tts en_US:Word}}", f)).toBe("");
  });

  it("drops unknown remaining handlebars", () => {
    expect(renderTemplate("{{Missing}}", fields)).toBe("");
  });
});

describe("cloze helpers", () => {
  const text = "The {{c1::sky}} is {{c2::blue}} during {{c1::day}}.";

  it("detects cloze markers and numbers", () => {
    expect(hasClozeMarkers(text)).toBe(true);
    expect(hasClozeMarkers("no clozes")).toBe(false);
    expect(clozeNumbers(text)).toEqual([1, 2]);
  });

  it("blanks the active cloze and reveals others", () => {
    const card1 = renderCloze(text, 1);
    expect(card1.front).toBe("The [...] is blue during [...].");
    expect(card1.back).toBe("The <b>sky</b> is blue during <b>day</b>.");

    const card2 = renderCloze(text, 2);
    expect(card2.front).toBe("The sky is [...] during day.");
    expect(card2.back).toBe("The sky is <b>blue</b> during day.");
  });

  it("uses the hint when present", () => {
    const { front } = renderCloze("Capital is {{c1::Paris::city}}.", 1);
    expect(front).toBe("Capital is [city].");
  });
});

describe("stripHtmlToText", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtmlToText("<div>a</div> <b>b</b>")).toBe("a b");
  });
});
