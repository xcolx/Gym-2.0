import { describe, expect, it } from "vitest";

import { passwordProblem } from "./password-policy";

describe("passwordProblem", () => {
  it("needs 8 to 50 characters", () => {
    expect(passwordProblem("Ab1")).toBe("At least 8 characters.");
    expect(passwordProblem("a".repeat(25) + "B".repeat(25))).toBeNull();
    expect(passwordProblem("a".repeat(25) + "B".repeat(26))).toBe("At most 50 characters.");
  });

  it("counts code points like the server", () => {
    // 4 emoji are 8 UTF-16 units but only 4 characters
    expect(passwordProblem("😀😀😀😀")).toBe("At least 8 characters.");
  });

  it("needs at least two kinds of characters", () => {
    expect(passwordProblem("abcdefgh")).toMatch(/at least two/);
    expect(passwordProblem("12345678")).toMatch(/at least two/);
    expect(passwordProblem("abcdefg1")).toBeNull();
    expect(passwordProblem("abcdefg!")).toBeNull();
    expect(passwordProblem("ABCDEFGh")).toBeNull();
  });
});
