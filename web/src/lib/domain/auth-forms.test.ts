import { describe, expect, it } from "vitest";

import { canSubmitForgotPassword, canSubmitLogin, signUpFormState, type SignUpForm } from "./auth-forms";

describe("canSubmitLogin", () => {
  it("needs an email that isn't only spaces and a password", () => {
    expect(canSubmitLogin("a@b.ch", "secret", false)).toBe(true);
    expect(canSubmitLogin("  ", "secret", false)).toBe(false);
    expect(canSubmitLogin("a@b.ch", "", false)).toBe(false);
  });

  it("isn't sent while loading", () => {
    expect(canSubmitLogin("a@b.ch", "secret", true)).toBe(false);
  });
});

describe("canSubmitForgotPassword", () => {
  it("needs an email and no running request", () => {
    expect(canSubmitForgotPassword(" a@b.ch ", false)).toBe(true);
    expect(canSubmitForgotPassword(" \t", false)).toBe(false);
    expect(canSubmitForgotPassword("a@b.ch", true)).toBe(false);
  });
});

describe("signUpFormState", () => {
  const valid: SignUpForm = {
    email: "a@b.ch",
    username: "alex.lifts",
    password: "Secret123",
    passwordConfirmation: "Secret123",
    acceptsTermsOfUse: true,
    acceptsPrivacyPolicy: true,
    isLoading: false,
  };

  it("can be sent when everything is filled in and accepted", () => {
    expect(signUpFormState(valid)).toEqual({ usernameIssue: null, passwordIssue: null, canSubmit: true });
  });

  it("shows the problems of the username and the password", () => {
    const state = signUpFormState({ ...valid, username: "al", password: "short", passwordConfirmation: "" });
    expect(state.usernameIssue).toBe("Between 3 and 20 characters.");
    expect(state.passwordIssue).toBe("At least 8 characters.");
    expect(state.canSubmit).toBe(false);
  });

  it("needs the same password twice", () => {
    const state = signUpFormState({ ...valid, passwordConfirmation: "Secret124" });
    expect(state.passwordIssue).toBe("The passwords don't match.");
    expect(state.canSubmit).toBe(false);
  });

  it("needs both agreements, the email and no running request", () => {
    expect(signUpFormState({ ...valid, acceptsTermsOfUse: false }).canSubmit).toBe(false);
    expect(signUpFormState({ ...valid, acceptsPrivacyPolicy: false }).canSubmit).toBe(false);
    expect(signUpFormState({ ...valid, email: " " }).canSubmit).toBe(false);
    expect(signUpFormState({ ...valid, isLoading: true }).canSubmit).toBe(false);
  });

  it("has no problems while the fields are empty", () => {
    const state = signUpFormState({ ...valid, username: "", password: "", passwordConfirmation: "" });
    expect(state).toEqual({ usernameIssue: null, passwordIssue: null, canSubmit: false });
  });
});
