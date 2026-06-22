import { describe, expect, it } from "vitest";
import { isImageOcclusionMaskHidden } from "./image-occlusion-review";

describe("image occlusion reveal modes", () => {
  it("hides every mask before reveal in hide_all mode", () => {
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_all",
        targetId: "m1",
        maskId: "m1",
        flipped: false,
      }),
    ).toBe(true);
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_all",
        targetId: "m1",
        maskId: "m2",
        flipped: false,
      }),
    ).toBe(true);
  });

  it("hides only the tested mask before reveal in hide_one mode", () => {
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_one",
        targetId: "m1",
        maskId: "m1",
        flipped: false,
      }),
    ).toBe(true);
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_one",
        targetId: "m1",
        maskId: "m2",
        flipped: false,
      }),
    ).toBe(false);
  });

  it("reveals masks after flip in both modes", () => {
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_all",
        targetId: "m1",
        maskId: "m2",
        flipped: true,
      }),
    ).toBe(false);
    expect(
      isImageOcclusionMaskHidden({
        revealMode: "hide_one",
        targetId: "m1",
        maskId: "m1",
        flipped: true,
      }),
    ).toBe(false);
  });
});
