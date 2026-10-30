import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appUpdateStore, dismissUpdateNotice, updateAvailable, updateRequired } from "./app-update";

let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  });
  appUpdateStore.set({ isUpdateRequired: false, showsUpdateNotice: false });
});

afterEach(() => vi.unstubAllGlobals());

const day = 24 * 60 * 60 * 1000;

describe("app update", () => {
  it("requires an update once and keeps the state object afterwards", () => {
    updateRequired();
    const state = appUpdateStore.get();
    expect(state.isUpdateRequired).toBe(true);
    updateRequired();
    expect(appUpdateStore.get()).toBe(state);
  });

  it("shows the notice of a deprecated version at most once a day", () => {
    const now = new Date(2026, 9, 21, 12, 0);
    updateAvailable(now);
    expect(appUpdateStore.get().showsUpdateNotice).toBe(true);
    dismissUpdateNotice();
    expect(appUpdateStore.get().showsUpdateNotice).toBe(false);

    updateAvailable(new Date(now.getTime() + day - 1));
    expect(appUpdateStore.get().showsUpdateNotice).toBe(false);
    updateAvailable(new Date(now.getTime() + day));
    expect(appUpdateStore.get().showsUpdateNotice).toBe(true);
  });

  it("doesn't show the notice when an update is required", () => {
    updateRequired();
    updateAvailable(new Date());
    expect(appUpdateStore.get().showsUpdateNotice).toBe(false);
    expect(values.size).toBe(0);
  });

  it("shows the notice without storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    updateAvailable(new Date());
    expect(appUpdateStore.get().showsUpdateNotice).toBe(true);
  });
});
