import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_THEME_KEY, APP_THEME_SCRIPT, applyAppTheme, parseAppTheme } from "./theme";

afterEach(() => vi.unstubAllGlobals());

describe("parseAppTheme", () => {
  it("reads light and dark, everything else is the system appearance", () => {
    expect(parseAppTheme("light")).toBe("light");
    expect(parseAppTheme("dark")).toBe("dark");
    expect(parseAppTheme("system")).toBe("system");
    expect(parseAppTheme("Dark")).toBe("system");
    expect(parseAppTheme(null)).toBe("system");
    expect(parseAppTheme(undefined)).toBe("system");
  });

  it("is applied by the script before the first paint from the same key", () => {
    expect(APP_THEME_SCRIPT).toContain(`localStorage.getItem("${APP_THEME_KEY}")`);
  });
});

describe("applyAppTheme", () => {
  function fakeDocument() {
    const attributes = new Map<string, string>();
    const metas = [
      { media: "(prefers-color-scheme: light)", dataset: {} as Record<string, string> },
      { media: "(prefers-color-scheme: dark)", dataset: {} as Record<string, string> },
    ];
    vi.stubGlobal("document", {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      },
      querySelectorAll: () => metas,
    });
    return { attributes, metas };
  }

  it("forces a theme on the page and the matching theme color only", () => {
    const { attributes, metas } = fakeDocument();
    applyAppTheme("dark");
    expect(attributes.get("data-theme")).toBe("dark");
    expect(metas.map((meta) => meta.media)).toEqual(["not all", "all"]);

    applyAppTheme("light");
    expect(attributes.get("data-theme")).toBe("light");
    // the scheme of a meta is remembered, its media query was replaced
    expect(metas.map((meta) => meta.media)).toEqual(["all", "not all"]);
  });

  it("restores the media queries of the system appearance", () => {
    const { attributes, metas } = fakeDocument();
    applyAppTheme("dark");
    applyAppTheme("system");
    expect(attributes.has("data-theme")).toBe(false);
    expect(metas.map((meta) => meta.media)).toEqual(["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]);
  });
});
