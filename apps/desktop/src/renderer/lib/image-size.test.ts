import { describe, expect, it } from "vitest";
import {
  formatImageTitle,
  parseImageWidth,
  stripImageWidth,
} from "./image-size";

describe("image width title encoding", () => {
  it("round-trips a width through the title format", () => {
    const title = formatImageTitle(320, null);
    expect(title).toBe("w=320");
    expect(parseImageWidth(title)).toBe(320);
    expect(stripImageWidth(title)).toBeUndefined();
  });

  it("rounds fractional widths to whole pixels", () => {
    expect(formatImageTitle(199.6, undefined)).toBe("w=200");
    expect(parseImageWidth("w=200")).toBe(200);
  });

  it("keeps a human caption alongside the width", () => {
    const title = formatImageTitle(320, "Figure 1");
    expect(title).toBe("w=320 Figure 1");
    expect(parseImageWidth(title)).toBe(320);
    expect(stripImageWidth(title)).toBe("Figure 1");
  });

  it("preserves a caption that has no width", () => {
    expect(formatImageTitle(null, "Figure 1")).toBe("Figure 1");
    expect(parseImageWidth("Figure 1")).toBeNull();
    expect(stripImageWidth("Figure 1")).toBe("Figure 1");
  });

  it("returns no title for absent or non-positive widths and no caption", () => {
    expect(formatImageTitle(null, null)).toBeUndefined();
    expect(formatImageTitle(undefined, undefined)).toBeUndefined();
    expect(formatImageTitle(0, "")).toBeUndefined();
  });

  it("ignores titles that do not encode a width", () => {
    expect(parseImageWidth(null)).toBeNull();
    expect(parseImageWidth("")).toBeNull();
    expect(parseImageWidth("a diagram")).toBeNull();
    expect(parseImageWidth("width=320")).toBeNull();
  });
});
