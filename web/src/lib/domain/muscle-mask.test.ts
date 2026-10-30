import { describe, expect, it } from "vitest";

import { makeMuscleMask, maskAlpha, maskSize } from "./muscle-mask";

describe("maskAlpha", () => {
  it("makes white, black and gray transparent and pure colors opaque", () => {
    expect(maskAlpha(255, 255, 255)).toBe(0);
    expect(maskAlpha(0, 0, 0)).toBe(0);
    expect(maskAlpha(128, 128, 128)).toBe(0);
    expect(maskAlpha(255, 0, 0)).toBe(255);
    expect(maskAlpha(0, 0, 255)).toBe(255);
  });

  it("ignores the little color of JPEG artifacts", () => {
    expect(maskAlpha(124, 100, 100)).toBe(0);
    expect(maskAlpha(125, 100, 100)).toBe(1);
    expect(maskAlpha(200, 100, 100)).toBe(83);
  });
});

describe("makeMuscleMask", () => {
  it("turns the pixels into white with the opacity of their color, transparent ones count as black", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, // red
      255, 255, 255, 255, // white background
      255, 0, 0, 0, // transparent red
      255, 0, 0, 128, // half transparent red
    ]);
    makeMuscleMask(pixels);
    expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, maskAlpha(128, 0, 0)]);
  });
});

describe("maskSize", () => {
  it("scales the longest side down to 800 and never up", () => {
    expect(maskSize(1600, 800)).toEqual({ width: 800, height: 400 });
    expect(maskSize(600, 1200)).toEqual({ width: 400, height: 800 });
    expect(maskSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it("is at least one pixel", () => {
    expect(maskSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(maskSize(10_000, 1)).toEqual({ width: 800, height: 1 });
  });
});
