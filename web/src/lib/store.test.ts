import { describe, expect, it, vi } from "vitest";

import { createStore } from "./store";

describe("createStore", () => {
  it("holds a value and notifies the listeners of changes", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(2);
    expect(store.get()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("updates from the previous value", () => {
    const store = createStore({ count: 1 });
    store.set((previous) => ({ count: previous.count + 1 }));
    expect(store.get()).toEqual({ count: 2 });
  });

  it("doesn't notify when the value stays the same", () => {
    const store = createStore<number | { a: number }>(Number.NaN);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(Number.NaN);
    store.set((previous) => previous);
    expect(listener).not.toHaveBeenCalled();
    // a new object is a change, even if it's equal
    store.set({ a: 1 });
    store.set({ a: 1 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying a listener that unsubscribed", () => {
    const store = createStore(0);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = store.subscribe(first);
    store.subscribe(second);
    unsubscribe();
    store.set(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
