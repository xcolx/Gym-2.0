import { describe, expect, it } from "vitest";

import { changeEdit, continueEdit } from "./use-bound-text";

describe("bound text field", () => {
  it("keeps the typed text while the store catches up with it", () => {
    let edit = changeEdit(null, "Pus", "Pus");
    edit = changeEdit(edit, "Push ", "Push");
    // the live query delivers the values the edit wrote, in any order
    expect(continueEdit(edit, "Pus")).toBe(edit);
    expect(continueEdit(edit, "Push")).toBe(edit);
    expect(edit.text).toBe("Push ");
  });

  it("follows a value that came from elsewhere, e.g. a sync that undid a rejected rename", () => {
    const edit = changeEdit(changeEdit(null, "Pul", "Pul"), "Pull", "Pull");
    expect(continueEdit(edit, "Push")).toBeNull();
  });

  it("keeps an empty field without storing anything", () => {
    const edit = changeEdit(changeEdit(null, "P", "P"), "", null);
    expect(edit).toEqual({ text: "", written: ["P"] });
    expect(continueEdit(edit, "P")).toBe(edit);
  });
});
