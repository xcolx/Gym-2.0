import { describe, expect, it } from "vitest";

import { printfFixed } from "./printf";

describe("printfFixed", () => {
  it("rounds an exact tie to the even digit like printf", () => {
    expect(printfFixed(0.125, 2)).toBe("0.12");
    expect(printfFixed(0.375, 2)).toBe("0.38");
    expect(printfFixed(2.5, 0)).toBe("2");
    expect(printfFixed(3.5, 0)).toBe("4");
    expect(printfFixed(0.5, 0)).toBe("0");
    expect(printfFixed(1.5, 0)).toBe("2");
    expect(printfFixed(-1.25, 1)).toBe("-1.2");
    expect(printfFixed(-1.75, 1)).toBe("-1.8");
  });

  it("rounds other values by their exact binary value like toFixed", () => {
    // 1.005 is 1.00499999999999989...
    expect(printfFixed(1.005, 2)).toBe("1.00");
    // 12.345 is 12.34500000000000063...
    expect(printfFixed(12.345, 2)).toBe("12.35");
    expect(printfFixed(80.26, 1)).toBe("80.3");
    expect(printfFixed(2, 2)).toBe("2.00");
  });

  it("keeps the sign of negative zero and of negative values rounded to zero", () => {
    expect(printfFixed(-0, 1)).toBe("-0.0");
    expect(printfFixed(-0.04, 1)).toBe("-0.0");
    expect(printfFixed(0, 1)).toBe("0.0");
  });

  it("pads ties of small values with leading zeros", () => {
    expect(printfFixed(0.0625, 3)).toBe("0.062");
    expect(printfFixed(0.03125, 4)).toBe("0.0312");
  });
});
