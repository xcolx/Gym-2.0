import { describe, expect, it } from "vitest";

import { centeredSquare, scaledToFit } from "./image-size";

describe("scaledToFit", () => {
  it("scales the longest side down to the maximum", () => {
    expect(scaledToFit(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(scaledToFit(3000, 6000, 2048)).toEqual({ width: 1024, height: 2048 });
  });

  it("never scales up", () => {
    expect(scaledToFit(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe("centeredSquare", () => {
  it("cuts the longer side evenly and limits the side", () => {
    expect(centeredSquare(4000, 3000, 1024)).toEqual({ sourceX: 500, sourceY: 0, sourceSide: 3000, side: 1024 });
    expect(centeredSquare(600, 900, 1024)).toEqual({ sourceX: 0, sourceY: 150, sourceSide: 600, side: 600 });
  });
});
