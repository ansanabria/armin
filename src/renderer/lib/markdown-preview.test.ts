import { describe, expect, it } from "vitest";
import { stripMarkdownForPreview } from "@/lib/markdown-preview";

describe("stripMarkdownForPreview", () => {
  it("strips common markdown syntax for grid previews", () => {
    const input =
      "# Heading\n\n**Bold** and `code` with [link](https://x.test)";
    expect(stripMarkdownForPreview(input)).toBe(
      "Heading Bold and code with link",
    );
  });

  it("replaces images with a placeholder token", () => {
    expect(
      stripMarkdownForPreview("See ![alt](data:image/png;base64,abc)"),
    ).toBe("See [Image]");
  });
});
