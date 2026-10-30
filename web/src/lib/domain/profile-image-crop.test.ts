import { describe, expect, it } from "vitest";

import { clampOffset, clampZoom, cropRect, displayedSize, MAX_ZOOM, outputSide } from "./profile-image-crop";

const landscape = { width: 4000, height: 3000 };

describe("displayedSize", () => {
  it("fills the circle with the shorter side at zoom 1", () => {
    expect(displayedSize(landscape, 300, 1)).toEqual({ width: 400, height: 300 });
    expect(displayedSize(landscape, 300, 2)).toEqual({ width: 800, height: 600 });
  });
});

describe("clampZoom", () => {
  it("stays between 1 and the maximum", () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
  });
});

describe("clampOffset", () => {
  it("keeps the circle covered", () => {
    // 400 x 300 shown in a circle of 300: 50 to each side horizontally, nothing vertically
    expect(clampOffset({ x: 80, y: 20 }, landscape, 300, 1)).toEqual({ x: 50, y: 0 });
    expect(clampOffset({ x: -80, y: -20 }, landscape, 300, 1)).toEqual({ x: -50, y: -0 });
    expect(clampOffset({ x: 10, y: 10 }, landscape, 300, 2)).toEqual({ x: 10, y: 10 });
  });
});

describe("cropRect", () => {
  it("is the centered square without offset and zoom", () => {
    expect(cropRect(landscape, 300, 1, { x: 0, y: 0 })).toEqual({ x: 500, y: 0, side: 3000 });
  });

  it("moves against the offset and shrinks with the zoom", () => {
    // Moved fully to the right: the left edge of the image is behind the circle
    expect(cropRect(landscape, 300, 1, { x: 50, y: 0 })).toEqual({ x: 0, y: 0, side: 3000 });
    expect(cropRect(landscape, 300, 2, { x: 0, y: 0 })).toEqual({ x: 1250, y: 750, side: 1500 });
  });
});

describe("outputSide", () => {
  it("is at most 1024 pixels", () => {
    expect(outputSide({ x: 0, y: 0, side: 3000 })).toBe(1024);
    expect(outputSide({ x: 0, y: 0, side: 640.4 })).toBe(640);
  });
});
