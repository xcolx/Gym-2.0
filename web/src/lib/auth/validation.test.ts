import { describe, expect, it } from "vitest";

import { newPasswordProblem, trimmed, usernameProblem } from "./validation";

describe("usernameProblem", () => {
  it("accepts names of 3 to 20 letters, digits, _ . and -", () => {
    expect(usernameProblem("")).toBeNull();
    expect(usernameProblem("abc")).toBeNull();
    expect(usernameProblem("Colin_R.2-0")).toBeNull();
    expect(usernameProblem("a".repeat(20))).toBeNull();
  });

  it("refuses other lengths", () => {
    expect(usernameProblem("ab")).toBe("Between 3 and 20 characters.");
    expect(usernameProblem("a".repeat(21))).toBe("Between 3 and 20 characters.");
  });

  it("refuses other characters", () => {
    expect(usernameProblem("colin r")).toBe('Username may only contain letters, numbers, "_", "." and "-".');
    expect(usernameProblem("rüegg")).toBe('Username may only contain letters, numbers, "_", "." and "-".');
    expect(usernameProblem("colin@")).toBe('Username may only contain letters, numbers, "_", "." and "-".');
  });
});

describe("newPasswordProblem", () => {
  it("checks the policy first, then the confirmation", () => {
    expect(newPasswordProblem("", "")).toBeNull();
    expect(newPasswordProblem("short", "")).toBe("At least 8 characters.");
    expect(newPasswordProblem("Gym2-web-test!", "")).toBeNull();
    expect(newPasswordProblem("Gym2-web-test!", "Gym2")).toBe("The passwords don't match.");
    expect(newPasswordProblem("Gym2-web-test!", "Gym2-web-test!")).toBeNull();
  });
});

describe("trimmed", () => {
  it("removes spaces and tabs, not newlines", () => {
    expect(trimmed("  a@b.c\t")).toBe("a@b.c");
    expect(trimmed("\na")).toBe("\na");
  });
});
