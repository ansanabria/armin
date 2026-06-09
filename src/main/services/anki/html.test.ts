import { describe, expect, it } from "vitest";
import { ankiHtmlToMarkdown, decodeEntities } from "./html";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("a&nbsp;b")).toBe("a b");
    expect(decodeEntities("&amp;&lt;&gt;")).toBe("&<>");
    expect(decodeEntities("&#39;")).toBe("'");
    expect(decodeEntities("&#x2014;")).toBe("—");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeEntities("&unknown;")).toBe("&unknown;");
  });
});

describe("ankiHtmlToMarkdown", () => {
  it("turns div blocks into separate lines", () => {
    const html = "<div>Memento</div>";
    expect(ankiHtmlToMarkdown(html)).toBe("Memento");
  });

  it("renders the real Anki field shape with bold, breaks and an image", () => {
    const html =
      "<div><b>Type:</b> Behavioral</div><div><br /></div>" +
      "<div><b>What it is:</b></div><div>Capture state.</div>" +
      '<div><img src="Memento.png" /></div>';
    const md = ankiHtmlToMarkdown(html, {
      resolveMedia: (name) =>
        name === "Memento.png" ? "data:image/png;base64,AAAA" : undefined,
    });
    expect(md).toContain("**Type:** Behavioral");
    expect(md).toContain("**What it is:**");
    expect(md).toContain("Capture state.");
    expect(md).toContain("![](data:image/png;base64,AAAA)");
  });

  it("converts italics and inline code", () => {
    expect(ankiHtmlToMarkdown("<i>hi</i> <code>x = 1</code>")).toBe(
      "*hi* `x = 1`",
    );
  });

  it("converts links", () => {
    expect(ankiHtmlToMarkdown('see <a href="https://x.com">the site</a>')).toBe(
      "see [the site](https://x.com)",
    );
  });

  it("converts unordered and ordered lists", () => {
    expect(ankiHtmlToMarkdown("<ul><li>one</li><li>two</li></ul>")).toBe(
      "- one\n- two",
    );
    expect(ankiHtmlToMarkdown("<ol><li>one</li><li>two</li></ol>")).toBe(
      "1. one\n2. two",
    );
  });

  it("strips [sound:...] references Armin can't play", () => {
    expect(ankiHtmlToMarkdown("Word [sound:word.mp3]")).toBe("Word");
  });

  it("drops unknown tags but keeps their text", () => {
    expect(ankiHtmlToMarkdown('<span style="color:red">kept</span>')).toBe(
      "kept",
    );
  });

  it("collapses excessive whitespace and blank lines", () => {
    const html = "<div>a</div><div><br></div><div><br></div><div>b</div>";
    expect(ankiHtmlToMarkdown(html)).toBe("a\n\nb");
  });

  it("keeps the original src when media can't be resolved", () => {
    expect(ankiHtmlToMarkdown('<img src="missing.png">')).toBe(
      "![](missing.png)",
    );
  });
});
