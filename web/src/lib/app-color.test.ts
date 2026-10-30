import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_COLOR_SCRIPT, applyAppColor, appColorForeground } from "./app-color";

afterEach(() => vi.unstubAllGlobals());

describe("appColorForeground", () => {
  it("is black on light colors and white on dark ones", () => {
    expect(appColorForeground("#FFFFFF")).toBe("#000000");
    expect(appColorForeground("#FFFF00")).toBe("#000000");
    expect(appColorForeground("#FF0000")).toBe("#FFFFFF");
    expect(appColorForeground("#000000")).toBe("#FFFFFF");
    expect(appColorForeground("00FF00")).toBe("#FFFFFF");
  });

  it("is white for an invalid color", () => {
    expect(appColorForeground("red")).toBe("#FFFFFF");
    expect(appColorForeground("")).toBe("#FFFFFF");
  });
});

describe("applyAppColor", () => {
  it("sets the CSS variable and keeps a copy for the script before the first paint", () => {
    const setProperty = vi.fn();
    const stored = new Map<string, string>();
    vi.stubGlobal("document", { documentElement: { style: { setProperty } } });
    vi.stubGlobal("localStorage", { setItem: (key: string, value: string) => stored.set(key, value) });
    applyAppColor("#00FF00");
    expect(setProperty).toHaveBeenCalledWith("--app-color", "#00FF00");
    expect(stored.get("appColor")).toBe("#00FF00");
    expect(APP_COLOR_SCRIPT).toContain('localStorage.getItem("appColor")');
  });

  it("works without storage", () => {
    vi.stubGlobal("document", { documentElement: { style: { setProperty: vi.fn() } } });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(() => applyAppColor("#00FF00")).not.toThrow();
  });
});
