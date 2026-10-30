import { describe, expect, it } from "vitest";

import { toggledId, withId } from "./id-set";

describe("withId", () => {
  it("adds and removes an id without changing the original", () => {
    const ids = new Set([1, 2]);
    expect([...withId(ids, 3, true)]).toEqual([1, 2, 3]);
    expect([...withId(ids, 1, false)]).toEqual([2]);
    expect([...withId(ids, 4, false)]).toEqual([1, 2]);
    expect([...ids]).toEqual([1, 2]);
  });
});

describe("toggledId", () => {
  it("removes a contained id and adds a missing one", () => {
    const ids = new Set([5]);
    expect([...toggledId(ids, 5)]).toEqual([]);
    expect([...toggledId(ids, 6)]).toEqual([5, 6]);
    expect([...ids]).toEqual([5]);
  });
});
